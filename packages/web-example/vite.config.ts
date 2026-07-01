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
          // Defense in depth: allow GET (read-only) and DELETE only on the
          // token endpoint (needed by verifyCredentials' OTP probe). All other
          // write methods (PUT/POST for publish/create/trust/...) are rejected
          // so this playground can never publish, create, or mutate config.
          proxy.on("proxyReq", (proxyReq, req) => {
            const url = req.url ?? "";
            const isGet = req.method === "GET";
            const isTokenDelete =
              req.method === "DELETE" && /\/-\/npm\/v1\/tokens\/token\//.test(url);
            if (!isGet && !isTokenDelete) {
              proxyReq.destroy();
            }
          });
        },
      },
    },
  },
});
