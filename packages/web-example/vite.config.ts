import { defineConfig } from "vite-plus";
import { fileURLToPath } from "node:url";

// `safe-npm-sdk` resolves through the pnpm workspace link to the built
// dist/index.mjs (declared via `exports` in the SDK package.json). The SDK is
// marked `sideEffects: false`, so Vite tree-shakes the unused, Node-only
// `buildPublishPackument` (which needs node:crypto) out of the browser bundle.
// Rebuild the SDK (`vp run --filter safe-npm-sdk build`) to pick up changes.
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  build: {
    minify: true,
  },
  experimental: {
    bundledDev: true, // 开启实验性打包开发模式
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
