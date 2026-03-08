/** Maps Python _elem_id → list of handler names (e.g. ["on_click"]) */
let handlers: Record<number, string[]> = {};

export function setHandlers(raw: Record<string, string[]>) {
  handlers = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [Number(k), v])
  ) as Record<number, string[]>;
}

export function hasHandler(elemId: number, handlerName: string): boolean {
  return handlers[elemId]?.includes(handlerName) ?? false;
}
