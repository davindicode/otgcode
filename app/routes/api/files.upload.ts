import { writeFile } from "fs/promises";
import { join } from "path";
import { fsErrorMessage } from "~/lib/errors";
import type { Route } from "./+types/files.upload";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const dir = formData.get("dir") as string | null;

  if (!file || !dir) {
    return Response.json({ error: "Missing file or dir" }, { status: 400 });
  }

  const dest = join(dir, file.name);
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(dest, buffer);
    return Response.json({ success: true, path: dest });
  } catch (err: unknown) {
    return Response.json({ error: fsErrorMessage(err, "file", dest) }, { status: 400 });
  }
}
