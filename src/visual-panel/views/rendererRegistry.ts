import React from "react";

export interface RenderableElement {
  type: string;
}

type ElementRenderFn<T extends RenderableElement> = (element: T) => React.ReactElement;

const registry = new Map<string, ElementRenderFn<RenderableElement>>();

export function registerRenderer<T extends RenderableElement>(
  kind: string,
  renderFn: ElementRenderFn<T>
) {
  registry.set(kind, renderFn as ElementRenderFn<RenderableElement>);
}

export function renderElement(element: RenderableElement): React.ReactElement {
  const renderFn = registry.get(element.type);
  if (!renderFn) throw new Error(`No renderer registered for kind: "${element.type}"`);
  return renderFn(element);
}