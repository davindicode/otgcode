import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { lookup } from "mime-types";
import type { Route } from "./+types/files.download";

type ByteRange = { start: number; end: number };

export function parseByteRange(value: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }

  return { start, end: Math.min(requestedEnd, size - 1) };
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");

  if (!filePath) {
    return Response.json({ error: "Missing path" }, { status: 400 });
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      return Response.json({ error: "Path is not a file" }, { status: 400 });
    }
    const mimeType = lookup(filePath) || "application/octet-stream";
    const name = basename(filePath);
    const inline = url.searchParams.get("inline") === "1";
    const rangeHeader = request.headers.get("range");
    const range = rangeHeader ? parseByteRange(rangeHeader, fileStats.size) : undefined;
    const commonHeaders = {
      "Accept-Ranges": "bytes",
      "Content-Type": mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
    };

    if (rangeHeader && !range) {
      return new Response(null, {
        status: 416,
        headers: { ...commonHeaders, "Content-Range": `bytes */${fileStats.size}` },
      });
    }

    const start = range?.start ?? 0;
    const end = range?.end ?? fileStats.size - 1;
    const contentLength = fileStats.size === 0 ? 0 : end - start + 1;
    const headers: Record<string, string> = { ...commonHeaders, "Content-Length": String(contentLength) };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${fileStats.size}`;

    if (request.method === "HEAD" || fileStats.size === 0) {
      return new Response(null, { status: range ? 206 : 200, headers });
    }

    const stream = createReadStream(filePath, { start, end });

    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to read file" }, { status: 400 });
  }
}
