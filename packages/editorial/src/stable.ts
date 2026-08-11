import { createHash } from "node:crypto";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

export function stableStringify(value: unknown, spaces?: number): string {
  return JSON.stringify(stableValue(value), null, spaces);
}

export function digest(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function equalValue(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

export function flattenDiff(left: unknown, right: unknown, prefix = ""): string[] {
  if (equalValue(left, right)) return [];
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return [prefix || "record"];
  if (Array.isArray(left) || Array.isArray(right)) return [prefix || "record"];
  const keys = new Set([...Object.keys(left as object), ...Object.keys(right as object)]);
  return [...keys].flatMap((key) => flattenDiff(
    (left as Record<string, unknown>)[key],
    (right as Record<string, unknown>)[key],
    prefix ? `${prefix}.${key}` : key
  ));
}
