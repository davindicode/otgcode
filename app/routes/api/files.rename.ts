import { rename } from "fs/promises";
import { fsErrorMessage } from "~/lib/errors";
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
    // A rename fails on the destination far more often than the source —
    // the name is taken, or the folder it names is missing.
    return Response.json({ error: fsErrorMessage(err, "path", newPath) }, { status: 400 });
  }
}
