// Writing to the page every frame: each write is skipped when nothing changed.

const memo = new WeakMap<Element, Record<string, string>>();

function seen(n: Element): Record<string, string> {
  let m = memo.get(n);
  if (!m) memo.set(n, (m = {}));
  return m;
}

export function setStyle(n: HTMLElement, prop: string, v: string): void {
  const m = seen(n);
  if (m[prop] !== v) {
    m[prop] = v;
    n.style.setProperty(prop, v);
  }
}

export function setText(n: Element, text: string): void {
  const m = seen(n);
  if (m.text !== text) {
    m.text = text;
    n.textContent = text;
  }
}

export function setHTML(n: Element, html: string): void {
  const m = seen(n);
  if (m.html !== html) {
    m.html = html;
    n.innerHTML = html;
  }
}

export function setAttr(n: Element, name: string, v: string | null): void {
  const m = seen(n);
  const key = `@${name}`;
  const s = v ?? '\u0000';
  if (m[key] !== s) {
    m[key] = s;
    if (v === null) n.removeAttribute(name);
    else n.setAttribute(name, v);
  }
}

/** Fades an element, hiding it outright once it is all but gone. */
export function show(n: HTMLElement, op: number): void {
  setStyle(n, 'opacity', op.toFixed(3));
  setStyle(n, 'visibility', op > 0.002 ? 'visible' : 'hidden');
}

export const css = (c: number[], a?: number) =>
  a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const $$ = <T extends Element = HTMLElement>(q: string, root: ParentNode = document) => [...root.querySelectorAll<T & Element>(q)] as T[];
