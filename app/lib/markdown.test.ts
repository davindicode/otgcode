import { describe, expect, it } from "vitest";
import { renderMarkdown, rewriteLocalAssets, sanitizeHtml } from "./markdown";

const FILE = "/home/user/repo/README.md";

describe("rewriteLocalAssets", () => {
  it("rewrites a relative image src to the inline download URL", () => {
    const out = rewriteLocalAssets('<img src="public/logo.png">', FILE);
    // The serialized HTML escapes & as &amp; in the attribute; the browser
    // decodes it back to & when loading, so the URL still works.
    expect(out).toContain('src="/api/files/download?path=%2Fhome%2Fuser%2Frepo%2Fpublic%2Flogo.png&amp;inline=1"');
  });

  it("resolves parent-relative refs against the file directory", () => {
    const out = rewriteLocalAssets('<img src="../assets/x.gif">', "/home/user/repo/docs/page.md");
    expect(out).toContain("path=%2Fhome%2Fuser%2Frepo%2Fassets%2Fx.gif");
  });

  it("leaves external URLs untouched", () => {
    const src = '<img src="https://img.shields.io/badge/x.svg">';
    expect(rewriteLocalAssets(src, FILE)).toContain('src="https://img.shields.io/badge/x.svg"');
  });

  it("rewrites video and source tags", () => {
    const out = rewriteLocalAssets('<video><source src="media/demo.mp4"></video>', FILE);
    expect(out).toContain("path=%2Fhome%2Fuser%2Frepo%2Fmedia%2Fdemo.mp4");
  });

  it("rewrites local anchors and opens them in a new tab", () => {
    const out = rewriteLocalAssets('<a href="public/demo.gif">gif</a>', FILE);
    expect(out).toContain("path=%2Fhome%2Fuser%2Frepo%2Fpublic%2Fdemo.gif");
    expect(out).toContain('target="_blank"');
  });

  it("leaves in-page anchors untouched", () => {
    expect(rewriteLocalAssets('<a href="#usage">Usage</a>', FILE)).toContain('href="#usage"');
  });
});

describe("sanitising rendered markup", () => {
  it("drops a script a file brought with it", () => {
    const out = sanitizeHtml('<h1>Hi</h1><script>fetch("/api/files/read")</script>');
    expect(out).toContain("<h1>Hi</h1>");
    expect(out).not.toContain("script");
  });

  it("drops an event handler, which is the one that does not look dangerous", () => {
    // `marked` emits this verbatim from a markdown file, and it needs no
    // <script> tag to run: the browser fires it when the load fails.
    const out = sanitizeHtml('<img src=x onerror="alert(1)">');
    expect(out).toContain("<img");
    expect(out.toLowerCase()).not.toContain("onerror");
  });

  it("refuses javascript: in a link while keeping ordinary ones", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>').toLowerCase()).not.toContain("javascript:");
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toContain("https://example.com");
  });

  it("leaves the markup a README is actually made of alone", () => {
    const md = '<h2>Install</h2><pre><code>pnpm i</code></pre><ul><li><em>a</em></li></ul><img src="./a.png">';
    expect(sanitizeHtml(md)).toBe(md);
  });
});

describe("rendering maths", () => {
  it("typesets a display equation rather than printing its source", () => {
    const out = renderMarkdown("$$r_{i,t} = \\frac{c_{i,t}}{c_{i,t-1}} - 1$$");

    expect(out).toContain("katex-display");
    expect(out).toContain("mfrac");
    // The point of the exercise: no dollar signs left to read. (The TeX
    // itself survives once, inside the clipped MathML node — see the note on
    // the dropped <annotation> in markdown.ts.)
    expect(out).not.toContain("$$");
  });

  it("typesets a formula sitting in the middle of a sentence", () => {
    const out = renderMarkdown("the return $r_t$ is defined");

    expect(out).toContain("katex");
    expect(out).not.toContain("$r_t$");
  });

  it("leaves prices alone, which is what the loose delimiter rule would eat", () => {
    const out = renderMarkdown("Costs $5 and $9 per month.");

    expect(out).not.toContain("katex");
    expect(out).toContain("$5 and $9");
  });

  it("takes a display equation whose delimiters share the formula's lines", () => {
    // The shape `marked-katex-extension` misses, and the shape a paper's
    // equations arrive in.
    const out = renderMarkdown("$$L_t = L_{t-1}(1 + r),\n\\qquad L_0 = 1$$");

    expect(out).toContain("katex-display");
    expect(out).not.toContain("$$");
  });

  it("stops a display run at a blank line rather than eating the document", () => {
    const out = renderMarkdown("$$x = 1\n\nprose that follows\n\nmore prose");

    expect(out).toContain("prose that follows");
    expect(out).toContain("more prose");
  });

  it("leaves dollars inside code alone", () => {
    const out = renderMarkdown("```\nexport PS1='$ '\n```\n\nand `$HOME` too");

    expect(out).not.toContain("katex");
    expect(out).toContain("$HOME");
  });

  it("shows a half-typed formula in place instead of failing the document", () => {
    const out = renderMarkdown("before\n\n$$\\frac{unclosed$$\n\nafter");

    expect(out).toContain("katex-error");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  it("still takes the script out of what it renders", () => {
    const out = renderMarkdown('$x$ and <script>fetch("/api")</script>');

    expect(out).toContain("katex");
    expect(out).not.toContain("script");
  });
});
