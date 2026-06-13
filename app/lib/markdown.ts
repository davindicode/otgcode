import { dirname, isExternalUrl, resolvePath, toInlineDownloadUrl } from "./paths";

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
