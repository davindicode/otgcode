import { mkdir } from "fs/promises";
import { errorMessage } from "~/lib/errors";
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
  } catch (err: unknown) {
    return Response.json({ error: errorMessage(err) }, { status: 400 });
  }
}
