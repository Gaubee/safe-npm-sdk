import { defineConfig } from "vite-plus";

export default defineConfig({
  // Run checks on staged files before committing.
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    // Vendor/asset files that should keep their own formatting.
    ignorePatterns: [
      "dist/**",
      "api-docs.npmjs.com.html",
      "api-docs.npmjs.com.md",
      "openapi.json",
      "scripts/gen-docs.mjs",
      "pnpm-lock.yaml",
    ],
    singleQuote: false,
    semi: true,
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: [
      "dist/**",
      "api-docs.npmjs.com.html",
      "api-docs.npmjs.com.md",
      "openapi.json",
      "scripts/gen-docs.mjs",
    ],
  },
});
