import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node18",
  platform: "node",
  // Keep zod external (runtime dependency), bundle everything else.
  deps: { neverBundle: ["zod"] },
});
