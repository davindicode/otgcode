import { rm } from "fs/promises";
import { errorMessage } from "~/lib/errors";
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
  } catch (err: unknown) {
    return Response.json({ error: errorMessage(err) }, { status: 400 });
  }
}
