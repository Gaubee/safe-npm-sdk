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
    proxy: {
      // Same-origin proxy to the npm registry. The browser can't call
      // registry.npmjs.org directly (no CORS), so requests go to /api/... on
      // this dev server and are forwarded server-side.
      "/api": {
        target: "https://registry.npmjs.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
        // headers are forwarded by default (Authorization, npm-otp, ...)
        configure: (proxy) => {
          // Defense in depth: this example only exposes GET endpoints. Reject
          // any write method so a frontend bug can never publish/delete.
          proxy.on("proxyReq", (proxyReq, req) => {
            if (req.method !== "GET") {
              proxyReq.destroy();
            }
          });
        },
      },
    },
  },
});
