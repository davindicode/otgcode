import { mkdir } from "fs/promises";
import type { Route } from "./+types/files.mkdir";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { path: dirPath } = await request.json();
  if (!dirPath) {
    return Response.json({ error: "Missing path" }, { status: 400 });
  }

  try {
    await mkdir(dirPath, { recursive: true });
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
