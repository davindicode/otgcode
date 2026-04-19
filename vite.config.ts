import { readFileSync } from "fs";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  ssr: {
    noExternal: [],
    external: [
      "@xterm/xterm",
      "@xterm/addon-fit",
      "@xterm/addon-web-links",
      "socket.io-client",
      "@monaco-editor/react",
    ],
  },
});
