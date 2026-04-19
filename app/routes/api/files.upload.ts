import { writeFile } from "fs/promises";
import { join } from "path";
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

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const dest = join(dir, file.name);
    await writeFile(dest, buffer);
    return Response.json({ success: true, path: dest });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
