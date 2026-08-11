import type { EntityId, IsoDateTime } from "@moxiao/domain";

export const ontologyVersion = "moxiao-ontology/1.0" as const;

export type OntologyEntityType =
  | "work"
  | "expression"
  | "manifestation"
  | "item"
  | "agent"
  | "role"
  | "project"
  | "collection"
  | "document-node"
  | "annotation"
  | "evidence"
  | "time-span"
  | "place"
  | "asset"
  | "rights-statement"
  | "publication-profile"
  | "export-job"
  | "mutation";

export type RelationPredicate =
  | "hasExpression"
  | "realizes"
  | "embodiedIn"
  | "exemplifies"
  | "derivesFrom"
  | "annotatedBy"
  | "targets"
  | "evidencedBy"
  | "createdBy"
  | "licensedFor"
  | "publishedAs"
  | "affects";

export interface OntologyEntityRef {
  readonly id: EntityId;
  readonly type: OntologyEntityType;
}

export interface SemanticRelation {
  readonly id: EntityId;
  readonly subject: OntologyEntityRef;
  readonly predicate: RelationPredicate;
  readonly object: OntologyEntityRef;
  readonly confidence?: number;
  readonly evidenceId?: EntityId;
  readonly validFrom?: IsoDateTime;
  readonly validUntil?: IsoDateTime;
  readonly recordedAt: IsoDateTime;
}

interface RelationConstraint {
  readonly subjects: readonly OntologyEntityType[];
  readonly objects: readonly OntologyEntityType[];
}

export const relationConstraints: Readonly<Record<RelationPredicate, RelationConstraint>> = {
  hasExpression: { subjects: ["work"], objects: ["expression"] },
  realizes: { subjects: ["expression"], objects: ["work"] },
  embodiedIn: { subjects: ["expression"], objects: ["manifestation"] },
  exemplifies: { subjects: ["item"], objects: ["manifestation"] },
  derivesFrom: { subjects: ["expression", "manifestation", "asset"], objects: ["expression", "manifestation", "asset"] },
  annotatedBy: { subjects: ["work", "expression", "document-node", "asset"], objects: ["annotation"] },
  targets: { subjects: ["annotation"], objects: ["work", "expression", "document-node", "asset"] },
  evidencedBy: { subjects: ["annotation", "time-span", "work", "expression"], objects: ["evidence"] },
  createdBy: { subjects: ["work", "expression", "annotation", "asset", "mutation"], objects: ["agent"] },
  licensedFor: { subjects: ["asset", "work", "expression"], objects: ["manifestation", "publication-profile"] },
  publishedAs: { subjects: ["work", "expression"], objects: ["manifestation", "item"] },
  affects: { subjects: ["mutation", "expression"], objects: ["manifestation", "item"] }
};

export function validateRelation(relation: SemanticRelation): string[] {
  const errors: string[] = [];
  const constraint = relationConstraints[relation.predicate];

  if (!constraint.subjects.includes(relation.subject.type)) {
    errors.push(`${relation.predicate} 不允许以 ${relation.subject.type} 作为主语`);
  }
  if (!constraint.objects.includes(relation.object.type)) {
    errors.push(`${relation.predicate} 不允许以 ${relation.object.type} 作为宾语`);
  }
  if (relation.confidence !== undefined && (relation.confidence < 0 || relation.confidence > 1)) {
    errors.push("置信度必须位于 0 到 1 之间");
  }
  if (relation.subject.id === relation.object.id) {
    errors.push("语义关系不能指向实体自身");
  }

  return errors;
}
