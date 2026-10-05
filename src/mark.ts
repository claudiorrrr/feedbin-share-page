import { parseHTML } from "linkedom";
import type { Highlight } from "./highlights";

const TEXT_NODE = 3;

// Admin marks carry the highlight id so they can be removed. Public marks are
// plain: the shared page runs no script.
export enum MarkMode {
  Public,
  Admin,
}

function textNodes(root: Node): Text[] {
  const found: Text[] = [];
  const walk = (parent: Node) => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === TEXT_NODE) {
        found.push(child as Text);
        continue;
      }

      walk(child);
    }
  };
  walk(root);

  return found;
}

// Finds where the quote starts. The same text can appear many times, so the
// occurrence whose surrounding text matches best wins.
function locate(full: string, h: Highlight): number {
  let best = -1;
  let bestScore = -1;

  for (let i = full.indexOf(h.exact); i !== -1; i = full.indexOf(h.exact, i + 1)) {
    const end = i + h.exact.length;
    const before = full.slice(Math.max(0, i - h.prefix.length), i);
    const after = full.slice(end, end + h.suffix.length);
    const score = Number(before === h.prefix) + Number(after === h.suffix);

    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
    if (score === 2) {
      break;
    }
  }

  return best;
}

type Style = { cls: string; id: string; n?: number };

// Wraps [start, end) of the concatenated text in <mark>. A highlight can span
// several text nodes (bold, links...), so each piece gets its own mark.
// n numbers a comment: only its last piece carries it (CSS draws "[n]").
function wrap(doc: Document, nodes: Text[], start: number, end: number, style: Style): void {
  let pos = 0;
  let last: Element | null = null;

  for (const node of nodes) {
    const text = node.data;
    const from = Math.max(start - pos, 0);
    const to = Math.min(end - pos, text.length);
    pos += text.length;

    // Nodes before or after the range give an empty or inverted slice.
    if (to <= from) {
      continue;
    }

    const piece = text.slice(from, to);
    if (!piece.trim()) {
      continue;
    }

    const mark = doc.createElement("mark");
    mark.className = style.cls;
    if (style.id) {
      mark.setAttribute("data-id", style.id);
    }
    mark.textContent = piece;
    last = mark;

    const parts: Node[] = [];
    if (from > 0) {
      parts.push(doc.createTextNode(text.slice(0, from)));
    }
    parts.push(mark);
    if (to < text.length) {
      parts.push(doc.createTextNode(text.slice(to)));
    }
    node.replaceWith(...parts);
  }

  if (style.n && last) {
    last.setAttribute("data-n", String(style.n));
  }
}

export function markHighlights(
  html: string,
  highlights: Highlight[],
  comments: Highlight[],
  mode: MarkMode,
): string {
  if (!html || (highlights.length === 0 && comments.length === 0)) {
    return html;
  }

  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);

  // The parser splits text at entities (&amp;); merge so one quote = one mark.
  document.body.normalize();

  const admin = mode === MarkMode.Admin;
  const quotes = [
    ...highlights.map((h) => ({ h, cls: "hl", n: 0 })),
    ...comments.map((h, i) => ({ h, cls: "cm", n: i + 1 })),
  ];

  for (const { h, cls, n } of quotes) {
    // Marks split text nodes, so re-read them for every quote.
    const nodes = textNodes(document.body);
    const start = locate(nodes.map((t) => t.data).join(""), h);
    if (start === -1) {
      continue;
    }

    wrap(document, nodes, start, start + h.exact.length, { cls, id: admin ? h.id : "", n });
  }

  return document.body.innerHTML;
}
