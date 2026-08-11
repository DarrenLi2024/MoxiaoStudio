import type { EntityId } from "./ids";
import type { DocumentNode } from "./model";

export interface MergeConflict {
  readonly nodeId: EntityId;
  readonly base: DocumentNode | null;
  readonly ours: DocumentNode | null;
  readonly theirs: DocumentNode | null;
  readonly reason: "concurrent-change";
}

export interface MergeResult {
  readonly nodes: DocumentNode[];
  readonly conflicts: MergeConflict[];
}

function nodeMap(nodes: readonly DocumentNode[]): Map<EntityId, DocumentNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function sameNode(left: DocumentNode | null, right: DocumentNode | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeDocumentNodes(
  baseNodes: readonly DocumentNode[],
  ourNodes: readonly DocumentNode[],
  theirNodes: readonly DocumentNode[]
): MergeResult {
  const base = nodeMap(baseNodes);
  const ours = nodeMap(ourNodes);
  const theirs = nodeMap(theirNodes);
  const ids = new Set([...base.keys(), ...ours.keys(), ...theirs.keys()]);
  const nodes: DocumentNode[] = [];
  const conflicts: MergeConflict[] = [];

  for (const nodeId of ids) {
    const baseNode = base.get(nodeId) ?? null;
    const ourNode = ours.get(nodeId) ?? null;
    const theirNode = theirs.get(nodeId) ?? null;

    if (sameNode(ourNode, theirNode)) {
      if (ourNode) nodes.push(ourNode);
      continue;
    }

    if (sameNode(baseNode, ourNode)) {
      if (theirNode) nodes.push(theirNode);
      continue;
    }

    if (sameNode(baseNode, theirNode)) {
      if (ourNode) nodes.push(ourNode);
      continue;
    }

    conflicts.push({ nodeId, base: baseNode, ours: ourNode, theirs: theirNode, reason: "concurrent-change" });
  }

  nodes.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  return { nodes, conflicts };
}
