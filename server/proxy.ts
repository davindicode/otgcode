import type { Express } from "express";
import { createProxyMiddleware, type RequestHandler } from "http-proxy-middleware";
import type { Server } from "http";

const BLOCKED_PORTS = new Set<number>();
for (let p = 1; p <= 1023; p++) {
  if (p !== 80 && p !== 443) BLOCKED_PORTS.add(p);
}

// Headers that prevent iframe embedding
const STRIP_HEADERS = ["x-frame-options", "content-security-policy"];

// Cache proxy instances per port to avoid memory leaks
const proxyCache = new Map<number, RequestHandler>();
const wsProxyCache = new Map<number, RequestHandler>();

function getProxy(port: number): RequestHandler {
  let proxy = proxyCache.get(port);
  if (!proxy) {
    proxy = createProxyMiddleware({
      target: `http://127.0.0.1:${port}`,
      changeOrigin: true,
      selfHandleResponse: true,
      pathRewrite: (_path, req) => {
        const originalUrl = (req as any).originalUrl || req.url || "";
        const prefix = `/proxy/${port}`;
        return originalUrl.startsWith(prefix) ? originalUrl.slice(prefix.length) || "/" : originalUrl;
      },
      on: {
        proxyRes: (proxyRes, _req, res) => {
          const contentType = proxyRes.headers["content-type"] || "";
          const isText = contentType.match(/text\/|javascript|json|xml|css/i);

          // Copy headers, stripping iframe-blocking ones
          const headers = { ...proxyRes.headers };
          for (const h of STRIP_HEADERS) {
            delete headers[h];
          }
          if (isText) delete headers["content-length"];
          (res as any).writeHead(proxyRes.statusCode || 200, headers);

          if (isText) {
            const chunks: Buffer[] = [];
            proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on("end", () => {
              let body = Buffer.concat(chunks).toString("utf-8");
              const prefix = `/proxy/${port}`;

              // Rewrite absolute paths in src, href, action attributes (HTML)
              body = body.replace(
                /((?:src|href|action)\s*=\s*["'])\/((?!proxy\/)[^"']*["'])/gi,
                `$1${prefix}/$2`
              );

              // Rewrite CSS url() with absolute paths
              body = body.replace(
                /url\(\s*['"]?\/((?!proxy\/)[^'")]+)['"]?\s*\)/gi,
                `url('${prefix}/$1')`
              );

              // Rewrite ES module imports: import "x", import x from "x", import * as x from "x"
              body = body.replace(
                /(\bimport\s+(?:[\w*{}\s,]+\s+from\s+)?["'])\/((?!proxy\/)[^"']+["'])/g,
                `$1${prefix}/$2`
              );

              // Rewrite dynamic import("/path")
              body = body.replace(
                /(\bimport\s*\(\s*["'])\/((?!proxy\/)[^"']+["']\s*\))/g,
                `$1${prefix}/$2`
              );

              // Rewrite export ... from "/path"
              body = body.replace(
                /(\bexport\s+(?:[\w*{}\s,]+\s+)?from\s+["'])\/((?!proxy\/)[^"']+["'])/g,
                `$1${prefix}/$2`
              );

              // Rewrite manifest/config paths
              body = body.replace(
                /"manifestPath"\s*:\s*"\/((?!proxy\/)[^"]+)"/g,
                `"manifestPath":"${prefix}/$1"`
              );

              // Rewrite new URL("/path", ...) patterns
              body = body.replace(
                /(new\s+URL\s*\(\s*["'])\/((?!proxy\/)[^"']+["'])/g,
                `$1${prefix}/$2`
              );

              (res as any).end(body);
            });
          } else {
            proxyRes.pipe(res as any);
          }
        },
        error: (_err, _req, res) => {
          if ("writeHead" in res) {
            (res as any).writeHead(502);
            (res as any).end(`Cannot reach localhost:${port}`);
          }
        },
      },
    });
    proxyCache.set(port, proxy);
  }
  return proxy;
}

function getWsProxy(port: number): RequestHandler {
  let proxy = wsProxyCache.get(port);
  if (!proxy) {
    proxy = createProxyMiddleware({
      target: `http://127.0.0.1:${port}`,
      ws: true,
      changeOrigin: true,
      pathRewrite: (_path) => {
        const prefix = `/proxy/${port}`;
        return _path.startsWith(prefix) ? _path.slice(prefix.length) || "/" : _path;
      },
    });
    wsProxyCache.set(port, proxy);
  }
  return proxy;
}

export function mountProxy(app: Express, httpServer: Server, otgPort: number): void {
  BLOCKED_PORTS.add(otgPort);

  app.use("/proxy/:port", (req, res, next) => {
    const port = parseInt(req.params.port, 10);
    if (isNaN(port) || BLOCKED_PORTS.has(port)) {
      res.status(403).json({ error: `Port ${port} is not allowed` });
      return;
    }
    getProxy(port)(req, res, next);
  });

  // WebSocket upgrade for proxy
  httpServer.on("upgrade", (req, socket, head) => {
    const url = req.url || "";
    const match = url.match(/^\/proxy\/(\d+)(\/.*)?$/);
    if (!match) return;

    const port = parseInt(match[1], 10);
    if (BLOCKED_PORTS.has(port)) {
      socket.destroy();
      return;
    }

    (getWsProxy(port) as any).upgrade(req, socket, head);
  });
}
