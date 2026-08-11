import type { EntityId } from "./ids";

export type IsoDateTime = string;
export type ContentHash = `sha256:${string}`;

export interface Work {
  readonly id: EntityId;
  readonly type: "work";
  title: string;
  genreId?: EntityId;
  createdAt: IsoDateTime;
}

export interface Expression {
  readonly id: EntityId;
  readonly type: "expression";
  readonly workId: EntityId;
  readonly rootNodeId: EntityId;
  language: string;
  version: number;
  contentHash: ContentHash;
  createdAt: IsoDateTime;
}

export interface Manifestation {
  readonly id: EntityId;
  readonly type: "manifestation";
  readonly expressionId: EntityId;
  readonly publicationProfileId: EntityId;
  readonly contentHash: ContentHash;
  readonly createdAt: IsoDateTime;
}

export interface Item {
  readonly id: EntityId;
  readonly type: "item";
  readonly manifestationId: EntityId;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly contentHash: ContentHash;
  readonly location: string;
  readonly createdAt: IsoDateTime;
}

export type DocumentNodeKind =
  | "work"
  | "section"
  | "que"
  | "stanza"
  | "paragraph"
  | "sentence"
  | "line"
  | "couplet"
  | "composition-note"
  | "quotation"
  | "postscript"
  | "appendix";

export interface DocumentNode {
  readonly id: EntityId;
  kind: DocumentNodeKind;
  parentId: EntityId | null;
  order: number;
  characters: string;
  attributes: Readonly<Record<string, string | number | boolean>>;
}

export interface NodeTombstone {
  readonly nodeId: EntityId;
  readonly deletedAt: IsoDateTime;
  readonly deletedBy: EntityId;
  readonly reason?: string;
}

export interface NodeMutation {
  readonly id: EntityId;
  readonly nodeId: EntityId;
  readonly actorId: EntityId;
  readonly createdAt: IsoDateTime;
  readonly baseRevision: number;
  readonly kind: "create" | "update" | "move" | "delete";
  readonly before: DocumentNode | null;
  readonly after: DocumentNode | null;
}
