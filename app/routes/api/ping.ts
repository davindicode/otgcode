/**
 * Smallest possible endpoint, purely for measuring round-trip latency from
 * the browser. No-store so a proxy (or Cloudflare, over the tunnel) can't
 * serve a cached reply and make the connection look faster than it is.
 */
export async function loader() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" },
  });
}
