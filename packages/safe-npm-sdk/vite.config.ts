import { defineConfig } from "vite-plus";

export default defineConfig({
  // Library build (was tsdown.config.ts). zod stays external (runtime dep);
  // everything else is bundled.
  pack: {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node18",
    platform: "node",
    deps: { neverBundle: ["zod"] },
  },
  // Tests (was vitest.config.ts).
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
    },
  },
});
