import type { EntityId, IsoDateTime } from "@moxiao/domain";

export type EditorialScope = "pilot" | "full";
export type EditorialOperation = "update" | "add" | "delete";
export type ReviewStatus = "pending" | "editing" | "reviewed";

export interface LegacyWork {
  id: string;
  seq: number;
  title: string;
  editorialTitle?: string | null;
  titleRole?: "authorTitle" | "openingLine";
  form: string;
  lines: string[];
  prose?: string | null;
  bodyLineCount?: number | null;
  compositionNote?: string | null;
  postscript?: string | null;
  composedAt?: string | null;
  era?: string | null;
  [key: string]: unknown;
}

export interface ChronologyEvidence {
  type: string;
  citation?: string | null;
  note: string;
  [key: string]: unknown;
}

export interface ChronologyResearch {
  display: string;
  startYear: number | null;
  endYear: number | null;
  precision: "unknown" | "year" | "season" | "month" | "day" | "range";
  certainty: "unreviewed" | "authorConfirmed" | "documented" | "inferred" | "disputed";
  basis: ChronologyEvidence[];
  alternatives: unknown[];
  editorialNote: string;
}

export interface ReadingAnnotation {
  id?: string;
  anchor: string;
  anchorNodeId?: EntityId | null;
  anchorQuote?: string | null;
  note: string;
  source?: string | null;
  [key: string]: unknown;
}

export interface TextualNote {
  id?: string;
  title?: string | null;
  note: string;
  source?: string | null;
  [key: string]: unknown;
}

export interface CuratedReading {
  translation?: string | null;
  appreciation?: string | null;
  annotations?: ReadingAnnotation[];
  textualNotes?: TextualNote[];
  editionNote?: string | null;
  reviewNote?: string | null;
  [key: string]: unknown;
}

export interface EditorialPayload {
  work: LegacyWork;
  reading: CuratedReading | null;
  readingSource: string | null;
  chronologyResearch: ChronologyResearch;
  editorNotes: string | null;
}

export interface EditorialRecord {
  id: string;
  entityId: EntityId;
  operation?: EditorialOperation;
  sourceHash: string;
  baseline: EditorialPayload;
  draft: EditorialPayload;
  editorState: {
    status: ReviewStatus;
    updatedAt: IsoDateTime | null;
  };
}

export interface EditorialWorkspace {
  format: "XZM-EW";
  version: "0.1";
  scope: EditorialScope;
  createdAt: IsoDateTime;
  savedAt: IsoDateTime | null;
  revision: number;
  records: EditorialRecord[];
}

export interface AuditIssue {
  level: "error" | "warning";
  message: string;
}

export interface RecordAudit {
  id: string;
  operation: EditorialOperation;
  changed: boolean;
  paths: string[];
  issues: AuditIssue[];
}
