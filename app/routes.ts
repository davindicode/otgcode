import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("api/files/list", "routes/api/files.list.ts"),
  route("api/files/read", "routes/api/files.read.ts"),
  route("api/files/write", "routes/api/files.write.ts"),
  route("api/files/rename", "routes/api/files.rename.ts"),
  route("api/files/delete", "routes/api/files.delete.ts"),
  route("api/files/upload", "routes/api/files.upload.ts"),
  route("api/files/download", "routes/api/files.download.ts"),
  route("api/files/mkdir", "routes/api/files.mkdir.ts"),
  route("api/tmux/sessions", "routes/api/tmux.sessions.ts"),
  route("api/tool-versions", "routes/api/tool-versions.ts"),
  route("api/system-info", "routes/api/system-info.ts"),
  route("api/terminal/cwd", "routes/api/terminal.cwd.ts"),
] satisfies RouteConfig;
