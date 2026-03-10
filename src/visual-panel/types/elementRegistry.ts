import type { ObjDoc, VisualBuilderElementBase } from "../../api/visualBuilder";

type Constructor<T> = new (...args: any[]) => T;

interface ShapeRegistryEntry<T extends VisualBuilderElementBase> {
  constructor: Constructor<T>;
  schema: ObjDoc;
}

const visualElemRegistry = new Map<string, ShapeRegistryEntry<VisualBuilderElementBase>>();

export function registerVisualElement<T extends VisualBuilderElementBase>(
  kind: string,
  constructor: Constructor<T>,
  schema: ObjDoc
) {
  visualElemRegistry.set(kind, {constructor, schema});
}

export function getConstructor(type: string): Constructor<VisualBuilderElementBase> | null{
  return visualElemRegistry.get(type)?.constructor ?? null;
}

export function getAllSchemas(): ObjDoc[] {
  return Array.from(visualElemRegistry.values()).map(entry => entry.schema);
}