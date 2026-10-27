import { describe, expect, it } from "vitest";
import { rewriteLocalAssets, sanitizeHtml } from "./markdown";

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
