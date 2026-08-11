import { v7 as uuidv7, validate as validateUuid, version as uuidVersion } from "uuid";

export type EntityId = string & { readonly __brand: "EntityId" };

export function createEntityId(): EntityId {
  return uuidv7() as EntityId;
}

export function parseEntityId(value: string): EntityId {
  if (!validateUuid(value) || uuidVersion(value) !== 7) {
    throw new Error(`无效的 UUIDv7：${value}`);
  }

  return value as EntityId;
}

export function isEntityId(value: string): value is EntityId {
  return validateUuid(value) && uuidVersion(value) === 7;
}
