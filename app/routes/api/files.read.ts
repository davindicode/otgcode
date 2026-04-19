import { readFile, stat } from "fs/promises";
import { lookup } from "mime-types";
import type { Route } from "./+types/files.read";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");

  if (!filePath) {
    return Response.json({ error: "Missing path parameter" }, { status: 400 });
  }

  try {
    const stats = await stat(filePath);
    const mimeType = lookup(filePath) || "application/octet-stream";
    const isText =
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType.includes("+json") ||
      mimeType === "application/javascript" ||
      mimeType === "application/typescript" ||
      mimeType === "application/xml" ||
      mimeType.includes("+xml") ||
      mimeType.includes("yaml") ||
      mimeType.includes("toml");

    if (isText || stats.size < 10 * 1024 * 1024) {
      const content = await readFile(filePath, "utf-8");
      return Response.json({ path: filePath, content, mimeType, size: stats.size });
    }

    return Response.json(
      { error: "File too large for text preview", size: stats.size, mimeType },
      { status: 413 }
    );
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
