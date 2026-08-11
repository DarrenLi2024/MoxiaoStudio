import { DatabaseSync } from "node:sqlite";
import { createEntityId, type EntityId } from "@moxiao/domain";
import { digest, importLegacyWorkspace, stableStringify, validateWorkspace, type EditorialWorkspace } from "@moxiao/editorial";

interface WorkspaceRow {
  id: string;
  format: string;
  version: string;
  scope: string;
  created_at: string;
  saved_at: string | null;
  revision: number;
}

interface RecordRow {
  payload_json: string;
}

interface SnapshotRow {
  snapshot_json: string;
}

interface CountRow {
  count: number;
}

export interface SemanticVersionReceipt {
  readonly id: EntityId;
  readonly workspaceId: string;
  readonly label: string;
  readonly snapshotHash: string;
  readonly createdAt: string;
}

export class RevisionConflictError extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`工作区修订冲突：期望 ${expected}，当前为 ${actual}`);
    this.name = "RevisionConflictError";
  }
}

export class WorkspaceStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;");
    this.migrate();
  }

  close(): void {
    this.database.close();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        format TEXT NOT NULL,
        version TEXT NOT NULL,
        scope TEXT NOT NULL,
        created_at TEXT NOT NULL,
        saved_at TEXT,
        revision INTEGER NOT NULL CHECK (revision >= 0)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS workspace_records (
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        record_id TEXT NOT NULL,
        entity_id TEXT NOT NULL UNIQUE,
        sequence INTEGER NOT NULL,
        operation TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        PRIMARY KEY (workspace_id, record_id),
        UNIQUE (workspace_id, sequence)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_workspace_records_status ON workspace_records(workspace_id, status);
      CREATE INDEX IF NOT EXISTS idx_workspace_records_operation ON workspace_records(workspace_id, operation);

      CREATE TABLE IF NOT EXISTS recovery_log (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        payload_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_recovery_workspace_revision ON recovery_log(workspace_id, revision DESC);

      CREATE TABLE IF NOT EXISTS semantic_versions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
        label TEXT NOT NULL,
        snapshot_hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
        created_at TEXT NOT NULL,
        immutable INTEGER NOT NULL DEFAULT 1 CHECK (immutable = 1)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS tombstones (
        entity_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
        record_id TEXT NOT NULL,
        deleted_at TEXT NOT NULL,
        reason TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        mutation_kind TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        created_at TEXT NOT NULL,
        delivered_at TEXT
      ) STRICT;
    `);
    this.database.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)")
      .run(1, new Date().toISOString());
  }

  initializeWorkspace(workspaceId: string, workspaceValue: EditorialWorkspace): EditorialWorkspace {
    const workspace = validateWorkspace(workspaceValue);
    if (this.hasWorkspace(workspaceId)) throw new Error(`工作区已存在：${workspaceId}`);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        INSERT INTO workspaces(id, format, version, scope, created_at, saved_at, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(workspaceId, workspace.format, workspace.version, workspace.scope, workspace.createdAt, workspace.savedAt, workspace.revision);
      this.replaceRecords(workspaceId, workspace);
      this.appendRecovery(workspaceId, workspace);
      this.appendMutationEvents(workspaceId, null, workspace);
      this.database.exec("COMMIT");
      return structuredClone(workspace);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  hasWorkspace(workspaceId: string): boolean {
    return Boolean(this.database.prepare("SELECT 1 AS found FROM workspaces WHERE id = ?").get(workspaceId));
  }

  loadWorkspace(workspaceId: string): EditorialWorkspace | null {
    const row = this.database.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId) as unknown as WorkspaceRow | undefined;
    if (!row) return null;
    const records = this.database.prepare(`
      SELECT payload_json FROM workspace_records WHERE workspace_id = ? ORDER BY sequence, record_id
    `).all(workspaceId) as unknown as RecordRow[];
    return importLegacyWorkspace({
      format: row.format,
      version: row.version,
      scope: row.scope,
      createdAt: row.created_at,
      savedAt: row.saved_at,
      revision: row.revision,
      records: records.map((record) => JSON.parse(record.payload_json) as unknown)
    });
  }

  saveWorkspace(workspaceId: string, workspaceValue: EditorialWorkspace, expectedRevision: number, now = new Date().toISOString()): EditorialWorkspace {
    const workspace = validateWorkspace(workspaceValue);
    const current = this.loadWorkspace(workspaceId);
    if (!current) throw new Error(`工作区不存在：${workspaceId}`);
    if (current.revision !== expectedRevision) throw new RevisionConflictError(expectedRevision, current.revision);
    const next: EditorialWorkspace = { ...structuredClone(workspace), savedAt: now, revision: expectedRevision + 1 };
    validateWorkspace(next);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.database.prepare(`
        UPDATE workspaces SET format = ?, version = ?, scope = ?, saved_at = ?, revision = ?
        WHERE id = ? AND revision = ?
      `).run(next.format, next.version, next.scope, next.savedAt, next.revision, workspaceId, expectedRevision);
      if (result.changes !== 1) throw new RevisionConflictError(expectedRevision, this.currentRevision(workspaceId));
      this.replaceRecords(workspaceId, next);
      this.appendRecovery(workspaceId, next);
      this.appendMutationEvents(workspaceId, current, next);
      this.database.exec("COMMIT");
      return next;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  createSemanticVersion(workspaceId: string, label: string, now = new Date().toISOString()): SemanticVersionReceipt {
    const workspace = this.loadWorkspace(workspaceId);
    if (!workspace) throw new Error(`工作区不存在：${workspaceId}`);
    const id = createEntityId();
    const snapshotHash = digest(workspace);
    this.database.prepare(`
      INSERT INTO semantic_versions(id, workspace_id, label, snapshot_hash, snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, workspaceId, label.trim() || `版本 ${workspace.revision}`, snapshotHash, stableStringify(workspace), now);
    return { id, workspaceId, label: label.trim() || `版本 ${workspace.revision}`, snapshotHash, createdAt: now };
  }

  listSemanticVersions(workspaceId: string): SemanticVersionReceipt[] {
    return this.database.prepare(`
      SELECT id, workspace_id AS workspaceId, label, snapshot_hash AS snapshotHash, created_at AS createdAt
      FROM semantic_versions WHERE workspace_id = ? ORDER BY created_at DESC, id DESC
    `).all(workspaceId) as unknown as SemanticVersionReceipt[];
  }

  restoreRevision(workspaceId: string, revision: number, expectedRevision: number, now = new Date().toISOString()): EditorialWorkspace {
    const row = this.database.prepare(`
      SELECT payload_json AS snapshot_json FROM recovery_log WHERE workspace_id = ? AND revision = ? ORDER BY created_at DESC LIMIT 1
    `).get(workspaceId, revision) as unknown as SnapshotRow | undefined;
    if (!row) throw new Error(`找不到修订 ${revision} 的恢复快照`);
    const snapshot = importLegacyWorkspace(JSON.parse(row.snapshot_json));
    return this.saveWorkspace(workspaceId, { ...snapshot, revision: expectedRevision }, expectedRevision, now);
  }

  pendingOutboxCount(workspaceId: string): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM outbox WHERE workspace_id = ? AND delivered_at IS NULL").get(workspaceId) as unknown as CountRow;
    return row.count;
  }

  tombstoneCount(workspaceId: string): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM tombstones WHERE workspace_id = ?").get(workspaceId) as unknown as CountRow;
    return row.count;
  }

  private currentRevision(workspaceId: string): number {
    const row = this.database.prepare("SELECT revision FROM workspaces WHERE id = ?").get(workspaceId) as { revision?: number } | undefined;
    return row?.revision ?? -1;
  }

  private replaceRecords(workspaceId: string, workspace: EditorialWorkspace): void {
    this.database.prepare("DELETE FROM workspace_records WHERE workspace_id = ?").run(workspaceId);
    const insert = this.database.prepare(`
      INSERT INTO workspace_records(
        workspace_id, record_id, entity_id, sequence, operation, source_hash, status, updated_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of workspace.records) {
      insert.run(
        workspaceId,
        record.id,
        record.entityId,
        record.draft.work.seq,
        record.operation ?? "update",
        record.sourceHash,
        record.editorState.status,
        record.editorState.updatedAt,
        stableStringify(record)
      );
    }
  }

  private appendRecovery(workspaceId: string, workspace: EditorialWorkspace): void {
    const payload = stableStringify(workspace);
    this.database.prepare(`
      INSERT INTO recovery_log(id, workspace_id, revision, payload_hash, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(createEntityId(), workspaceId, workspace.revision, digest(workspace), payload, workspace.savedAt ?? workspace.createdAt);
  }

  private appendMutationEvents(workspaceId: string, previous: EditorialWorkspace | null, next: EditorialWorkspace): void {
    const previousByEntity = new Map(previous?.records.map((record) => [record.entityId, record]) ?? []);
    const nextByEntity = new Map(next.records.map((record) => [record.entityId, record]));
    const entities = new Set([...previousByEntity.keys(), ...nextByEntity.keys()]);
    const insertOutbox = this.database.prepare(`
      INSERT INTO outbox(id, workspace_id, entity_type, entity_id, mutation_kind, payload_json, created_at)
      VALUES (?, ?, 'editorial-record', ?, ?, ?, ?)
    `);
    const insertTombstone = this.database.prepare(`
      INSERT OR IGNORE INTO tombstones(entity_id, workspace_id, record_id, deleted_at, reason)
      VALUES (?, ?, ?, ?, ?)
    `);
    const createdAt = next.savedAt ?? next.createdAt;

    for (const entityId of entities) {
      const before = previousByEntity.get(entityId);
      const after = nextByEntity.get(entityId);
      if (before && after && stableStringify(before) === stableStringify(after)) continue;
      const mutationKind = !before ? "create" : !after || after.operation === "delete" ? "delete" : "update";
      const payload = after ?? { entityId, recordId: before?.id ?? null };
      insertOutbox.run(createEntityId(), workspaceId, entityId, mutationKind, stableStringify(payload), createdAt);
      if (mutationKind === "delete") {
        insertTombstone.run(entityId, workspaceId, before?.id ?? after?.id ?? entityId, createdAt, after?.operation === "delete" ? "editorial-delete" : "workspace-clear");
      }
    }
  }
}
