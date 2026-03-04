import React from "react";
import type { VisualBuilderElementBase } from "../../types/visualBuilder";

type ElementRenderFn<T extends VisualBuilderElementBase> = (element: T) => React.ReactElement;

const registry = new Map<string, ElementRenderFn<VisualBuilderElementBase>>();

export function registerRenderer<T extends VisualBuilderElementBase>(
  kind: string,
  renderFn: ElementRenderFn<T>
) {
  registry.set(kind, renderFn as ElementRenderFn<VisualBuilderElementBase>);
}

export function renderElement(element: VisualBuilderElementBase): React.ReactElement {
  const renderFn = registry.get(element.type);
  if (!renderFn) throw new Error(`No renderer registered for kind: "${element.type}"`);
  return renderFn(element);
}