import { writeFile } from "fs/promises";
import type { Route } from "./+types/files.write";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const { path: filePath, content } = body;

  if (!filePath || content === undefined) {
    return Response.json({ error: "Missing path or content" }, { status: 400 });
  }

  try {
    await writeFile(filePath, content, "utf-8");
    return Response.json({ success: true, path: filePath });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
