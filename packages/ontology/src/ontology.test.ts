import { describe, expect, it } from "vitest";
import { createEntityId } from "@moxiao/domain";
import { validateRelation, type SemanticRelation } from "./index";

function relation(overrides: Partial<SemanticRelation> = {}): SemanticRelation {
  return {
    id: createEntityId(),
    subject: { id: createEntityId(), type: "work" },
    predicate: "hasExpression",
    object: { id: createEntityId(), type: "expression" },
    recordedAt: new Date().toISOString(),
    ...overrides
  };
}

describe("Ontology v1", () => {
  it("接受作品与表达的合法关系", () => {
    expect(validateRelation(relation())).toEqual([]);
  });

  it("拒绝主客体类型颠倒", () => {
    expect(validateRelation(relation({
      subject: { id: createEntityId(), type: "expression" },
      object: { id: createEntityId(), type: "work" }
    }))).toContain("hasExpression 不允许以 expression 作为主语");
  });
});
