import { readFile, stat } from "fs/promises";
import { lookup } from "mime-types";
import { basename } from "path";
import type { Route } from "./+types/files.download";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");

  if (!filePath) {
    return Response.json({ error: "Missing path" }, { status: 400 });
  }

  try {
    await stat(filePath); // Check it exists
    const data = await readFile(filePath);
    const mimeType = lookup(filePath) || "application/octet-stream";
    const name = basename(filePath);
    const inline = url.searchParams.get("inline") === "1";

    return new Response(data, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      },
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
