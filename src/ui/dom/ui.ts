/**
 * Shared, logic-free DOM primitives for the module + plan pages (cards, forms,
 * stat rows, progress bars). Behaviour is wired by delegation in main.ts; these
 * only build elements and tag them with data-action / data-field / data-* hooks.
 * The Today dashboard (render.ts) keeps its own bespoke hero/ring helpers.
 */
import { h } from "./h";
import type { Child } from "./h";

export const pct = (frac: number): number =>
  Math.round(Math.max(0, Math.min(1, frac)) * 100);

export const card = (
  title: string,
  body: Child,
  opts?: { readonly count?: string | undefined; readonly cls?: string | undefined },
): HTMLElement =>
  h(
    "section",
    { class: `card ${opts?.cls ?? ""}`.trim() },
    h(
      "header",
      { class: "card-head" },
      h("h2", null, title),
      opts?.count !== undefined ? h("span", { class: "card-count" }, opts.count) : null,
    ),
    body,
  );

export const emptyLine = (text: string): HTMLElement =>
  h("p", { class: "empty-line" }, text);

export const pageHead = (title: string, subtitle: string): HTMLElement =>
  h(
    "div",
    { class: "page-head" },
    h("h1", { class: "page-title" }, title),
    h("p", { class: "page-sub" }, subtitle),
  );

export const bar = (frac: number, cls = ""): HTMLElement =>
  h(
    "span",
    { class: `bar ${cls}`.trim() },
    h("span", { class: "bar-fill", style: `width:${pct(frac)}%` }),
  );

export const stat = (label: string, value: string): HTMLElement =>
  h(
    "div",
    { class: "stat" },
    h("span", { class: "stat-value" }, value),
    h("span", { class: "stat-label" }, label),
  );

export interface FieldOpts {
  readonly type?: string;
  readonly placeholder?: string;
  readonly value?: string;
  readonly step?: string;
  readonly min?: string;
}
export const field = (label: string, name: string, opts: FieldOpts = {}): HTMLElement =>
  h(
    "label",
    { class: "fld" },
    h("span", { class: "fld-label" }, label),
    h("input", {
      class: "fld-input",
      "data-field": name,
      type: opts.type ?? "text",
      placeholder: opts.placeholder ?? "",
      autocomplete: "off",
      ...(opts.value !== undefined ? { value: opts.value } : {}),
      ...(opts.step !== undefined ? { step: opts.step } : {}),
      ...(opts.min !== undefined ? { min: opts.min } : {}),
    }),
  );

export const textareaField = (
  label: string,
  name: string,
  value: string | null,
  placeholder = "",
): HTMLElement =>
  h(
    "label",
    { class: "fld fld-wide" },
    h("span", { class: "fld-label" }, label),
    h(
      "textarea",
      { class: "fld-input", "data-field": name, rows: "2", placeholder },
      value ?? "",
    ),
  );

export const selectField = (
  label: string,
  name: string,
  options: readonly { readonly value: string; readonly label: string }[],
  selected?: string,
): HTMLElement =>
  h(
    "label",
    { class: "fld" },
    h("span", { class: "fld-label" }, label),
    h(
      "select",
      { class: "fld-input", "data-field": name },
      ...options.map((o) =>
        h(
          "option",
          { value: o.value, ...(o.value === selected ? { selected: "selected" } : {}) },
          o.label,
        ),
      ),
    ),
  );

export const submit = (label: string): HTMLElement =>
  h("button", { class: "btn btn-primary", "data-action": "form-submit" }, label);

export const form = (
  name: string,
  fields: readonly Child[],
  submitLabel: string,
  dataAttrs: Readonly<Record<string, string>> = {},
): HTMLElement =>
  h(
    "div",
    { class: "form", "data-form": name, ...dataAttrs },
    h("div", { class: "form-row" }, ...fields),
    h("div", { class: "form-actions" }, submit(submitLabel)),
  );

export const titleCase = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
