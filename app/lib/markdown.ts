import DOMPurify from "dompurify";
import katex from "katex";
import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import { dirname, isExternalUrl, resolvePath, toInlineDownloadUrl } from "./paths";

/**
 * `throwOnError` off because the file is being read, not compiled: a
 * half-typed formula shows in red where it stands and the rest of the
 * document still renders.
 *
 * `nonStandard` deliberately left off. It would let `word$x$word` parse, but
 * it drops the requirement for whitespace around the delimiters, and then
 * "costs $5 and $9" typesets "5 and" as an equation. Prices in a README are
 * commoner than maths jammed against a word, and the standard rule still
 * takes `$r_t$` in the middle of a sentence.
 */
const KATEX_OPTIONS = { throwOnError: false };

/**
 * Display maths whose delimiters sit on the same lines as the formula.
 *
 * `marked-katex-extension` matches two shapes: `$$` alone on lines of their
 * own, and a whole formula on one line. It does not match the third — `$$`
 * opening a formula that runs onto the next line and closing it at the end of
 * a later one — because its inline rule rejects newlines outright. That third
 * shape is what a page of equations lifted out of a paper looks like, and
 * every other renderer accepts it, so a preview that leaves half the
 * equations as dollar signs and backslashes is the bug being fixed here.
 *
 * The run stops at a blank line. Display maths spanning paragraphs is not a
 * thing anyone writes, and the alternative is one stray `$$` swallowing the
 * rest of the document.
 */
const multilineDisplayMath = {
  name: "blockKatexMultiline",
  level: "block" as const,
  tokenizer(src: string) {
    const match = /^\$\$((?:[^\n]|\n(?![ \t]*\n))+?)\$\$[ \t]*(?:\n|$)/.exec(src);
    if (!match) return undefined;
    return { type: "blockKatexMultiline", raw: match[0], text: match[1].trim() };
  },
  renderer(token: { text: string }) {
    return `${katex.renderToString(token.text, { ...KATEX_OPTIONS, displayMode: true })}\n`;
  },
};

marked.use({ breaks: true, gfm: true }, { extensions: [multilineDisplayMath] }, markedKatex(KATEX_OPTIONS));

/**
 * Rendered markup with the script taken out, for anything bound for
 * `dangerouslySetInnerHTML`.
 *
 * `marked` passes raw HTML through — documented, not a bug in it — and so do
 * a notebook's own HTML outputs. Injected as they came, a `<script>` or an
 * `onerror` in a file ran in the app's own origin: the origin holding the
 * session that drives the terminals. The files are on your own host, but you
 * did not necessarily write them — a README from a repo you cloned, or
 * anything an agent wrote, is enough — and "preview this file" should not be
 * a sentence that can reach a shell.
 *
 * Not hand-rolled, because an HTML sanitiser is the last thing to hand-roll.
 * DOMPurify needs a DOM and reports `isSupported` false without one, handing
 * its input straight back; these previews only have content after a
 * client-side fetch, but nothing is the right answer to being unable to
 * check, rather than the input unexamined.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.isSupported ? DOMPurify.sanitize(html) : "";
}

/**
 * Markdown to markup fit for `dangerouslySetInnerHTML`.
 *
 * The one place `marked` is configured, because a preview that renders
 * differently depending on which component called it is a bug waiting for a
 * report: a notebook's markdown cells get the same line breaks and the same
 * maths as a `.md` file.
 *
 * `$...$` and `$$...$$` go through KaTeX, which is most of why this exists —
 * a paper's worth of equations rendered as literal dollar signs and
 * backslashes is not a preview. `nonStandard` matters for prose: strict TeX
 * wants no space after the opening `$`, which also means it ignores `$x$`
 * written tight against a word, i.e. how inline maths is actually typed.
 * `throwOnError` off because the file is being read, not compiled — a
 * half-typed formula shows in red where it is and the rest of the document
 * still renders.
 *
 * Sanitised on the way out, and KaTeX's markup survives that: spans, classes
 * and MathML are all on DOMPurify's own allowlist. The one casualty is the
 * `<annotation>` wrapper holding the original TeX, dropped as an mXSS vector
 * and rightly so; its text stays behind inside the MathML, which KaTeX's own
 * stylesheet clips to a pixel. Invisible either way, and weakening the
 * sanitiser that stands in front of the terminals to tidy up a node nobody
 * sees would be a bad trade.
 */
export function renderMarkdown(src: string): string {
  return sanitizeHtml(marked.parse(src) as string);
}

// Rewrite local media/links in rendered markdown HTML so they load through the
// file download API. Relative references (e.g. `public/logo.png` in a README)
// are resolved against the markdown file's directory; absolute on-disk paths are
// served as-is. External URLs (http(s)/data/blob), protocol-relative URLs, and
// in-page anchors are left untouched.
//
// Without this, a relative `<img src="public/logo.png">` would resolve against
// the app's route URL and 404 (the broken-media icon), since local files are
// only served via /api/files/download.
export function rewriteLocalAssets(html: string, filePath: string): string {
  if (typeof DOMParser === "undefined") return html; // SSR / no DOM available
  const dir = dirname(filePath);
  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const el of Array.from(doc.querySelectorAll("img, video, audio, source"))) {
    const src = el.getAttribute("src");
    if (src && !isExternalUrl(src)) {
      el.setAttribute("src", toInlineDownloadUrl(resolvePath(dir, src)));
    }
  }

  // Anchors wrapping local media (common in READMEs) — open via the inline URL.
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href");
    if (href && !isExternalUrl(href)) {
      a.setAttribute("href", toInlineDownloadUrl(resolvePath(dir, href)));
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noreferrer");
    }
  }

  return doc.body.innerHTML;
}
