import { describe, expect, it } from "vitest";
import { createEntityId, isEntityId, mergeDocumentNodes, type DocumentNode } from "./index";

function node(characters: string): DocumentNode {
  return {
    id: createEntityId(),
    kind: "line",
    parentId: null,
    order: 0,
    characters,
    attributes: {}
  };
}

describe("文枢领域地基", () => {
  it("为实体生成 UUIDv7", () => {
    const id = createEntityId();
    expect(isEntityId(id)).toBe(true);
    expect(id[14]).toBe("7");
  });

  it("自动接受单边节点变更", () => {
    const base = node("千古帝王事");
    const ours = { ...base, characters: "千古帝王事，悠悠" };
    const result = mergeDocumentNodes([base], [ours], [base]);

    expect(result.conflicts).toHaveLength(0);
    expect(result.nodes[0]?.characters).toBe("千古帝王事，悠悠");
  });

  it("把同节点的双向不同修改交给人工处理", () => {
    const base = node("吐谷");
    const ours = { ...base, characters: "吐浑" };
    const theirs = { ...base, characters: "吐谷浑" };
    const result = mergeDocumentNodes([base], [ours], [theirs]);

    expect(result.nodes).toHaveLength(0);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ nodeId: base.id, reason: "concurrent-change" })
    ]);
  });
});
