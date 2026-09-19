import { rename } from "fs/promises";
import { errorMessage } from "~/lib/errors";
import type { Route } from "./+types/files.rename";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { oldPath, newPath } = await request.json();
  if (!oldPath || !newPath) {
    return Response.json({ error: "Missing oldPath or newPath" }, { status: 400 });
  }

  try {
    await rename(oldPath, newPath);
    return Response.json({ success: true });
  } catch (err: unknown) {
    return Response.json({ error: errorMessage(err) }, { status: 400 });
  }
}
