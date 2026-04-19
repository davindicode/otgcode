import { rm } from "fs/promises";
import type { Route } from "./+types/files.delete";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { path: filePath } = await request.json();
  if (!filePath) {
    return Response.json({ error: "Missing path" }, { status: 400 });
  }

  try {
    await rm(filePath, { recursive: true });
    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
