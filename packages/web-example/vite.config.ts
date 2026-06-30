import { defineConfig } from "vite-plus";
import { fileURLToPath } from "node:url";

// In dev, resolve the `safe-npm-sdk` workspace package straight to its source
// entry so changes hot-reload without a build step. zod resolves normally via
// node_modules.
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  resolve: {
    alias: {
      "safe-npm-sdk": fileURLToPath(new URL("../safe-npm-sdk/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
