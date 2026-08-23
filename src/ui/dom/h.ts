/**
 * Minimal hyperscript helper. The DOM layer is intentionally logic-free: it only
 * turns view-model data into elements and tags interactive nodes with data-action
 * attributes. All behaviour is wired via event delegation in main.ts, and all
 * decisions live in Phase 1 / the view model.
 */
export type Child = string | number | Node | null | undefined | Child[];

const appendChild = (parent: Node, child: Child): void => {
  if (child === null || child === undefined) return;
  if (Array.isArray(child)) {
    for (const c of child) appendChild(parent, c);
    return;
  }
  if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(document.createTextNode(String(child)));
    return;
  }
  parent.appendChild(child);
};

export const h = (
  tag: string,
  props?: Readonly<Record<string, string | undefined>> | null,
  ...children: Child[]
): HTMLElement => {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined) continue;
      el.setAttribute(k, v);
    }
  }
  for (const child of children) appendChild(el, child);
  return el;
};

/** Clear and replace the children of a node. */
export const mount = (host: HTMLElement, ...children: Child[]): void => {
  host.replaceChildren();
  for (const child of children) appendChild(host, child);
};
