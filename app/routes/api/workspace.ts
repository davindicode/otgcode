import { loadWorkspace, saveWorkspace } from "~/lib/workspace.server";
import type { Route } from "./+types/workspace";

export async function loader() {
  return Response.json(loadWorkspace());
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST" && request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    return Response.json(saveWorkspace(await request.json()));
  } catch {
    return Response.json({ error: "Invalid workspace payload" }, { status: 400 });
  }
}
