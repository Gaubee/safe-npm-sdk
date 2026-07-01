# safe-npm-sdk

English | [简体中文](./README.zh-CN.md)

> A TypeScript SDK for the npm registry API, built from the **official OpenAPI
> spec scraped from [api-docs.npmjs.com](https://api-docs.npmjs.com)**.

This repository reverse-engineers the npm registry API the right way: the
authoritative source is not hand-written guesses but the **live OpenAPI 3.0.3
document embedded in npm's own documentation site**. That spec is checked in
here, rendered into a readable reference, and used to verify the SDK's request
and response shapes. Every endpoint in the SDK maps 1:1 to an operation in that
spec (32 operations across 10 tags).

## Where the API comes from

The npm registry API is documented at
[api-docs.npmjs.com](https://api-docs.npmjs.com), which renders an OpenAPI spec
with [Redoc](https://redocly.com/redoc). That spec is embedded inline in the
page HTML rather than published as a standalone file, so this repo extracts it
and keeps a frozen copy:

| File                                                   | What it is                                                                                           | How to regenerate                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`api-docs.npmjs.com.html`](./api-docs.npmjs.com.html) | The scraped docs page (the source of truth).                                                         | Download from api-docs.npmjs.com                     |
| [`openapi.json`](./openapi.json)                       | The extracted OpenAPI 3.0.3 spec — 32 operations, 11 schemas, base URL `https://registry.npmjs.org`. | Parse the `__redoc_state` blob out of the HTML above |
| [`api-docs.npmjs.com.md`](./api-docs.npmjs.com.md)     | A human-readable reference generated from the spec. **This is the API documentation.**               | `node scripts/gen-docs.mjs`                          |

👉 **Read [`api-docs.npmjs.com.md`](./api-docs.npmjs.com.md) for the full API
reference** — every endpoint's method, path, parameters, request body, response
fields, and examples, grouped by tag (Tokens, OIDC, Trust, Access, Audit, Org,
Team, Publish, Search, Stage).

## What's in this repo

A pnpm/Vite+ monorepo with two packages:

```
.
├── api-docs.npmjs.com.html   # scraped docs (source of truth)
├── openapi.json              # extracted OpenAPI spec
├── api-docs.npmjs.com.md     # generated human-readable API reference
├── scripts/                  # spec extraction + markdown generation
└── packages/
    ├── safe-npm-sdk/         # the published SDK (ESM + fetch + zod)
    └── web-example/          # private read-only browser playground
```

- **[`packages/safe-npm-sdk`](./packages/safe-npm-sdk)** — the SDK itself. Pure
  functions over a configurable client, zod-validated responses, first-class
  2FA / `npm-notice` / WebAuthn handling. See its
  [README](./packages/safe-npm-sdk/README.md) for usage.
- **[`packages/web-example`](./packages/web-example)** — a browser playground
  that exercises safe GET endpoints against the live registry (via a same-origin
  proxy that bypasses CORS and rejects non-GET requests).

## Why scrape the spec instead of hand-writing?

npm's published registry documentation is the only authoritative description of
the endpoints, their headers (2FA, `npm-otp`, `npm-notice`), and their response
shapes — including quirks that only surface against the live service. By
deriving the SDK from that spec and validating responses at runtime, this
project stays faithful to the real API and surfaces drift (e.g. a field the spec
types as a number but the registry returns as a numeric string) instead of
silently failing.

## Development

This repo uses [Vite+](https://viteplus.dev/) (`vp`) as its unified toolchain.

```bash
vp install        # install deps
vp check          # format + lint + type check
vp test           # vitest + msw (no real token needed)
vp build          # pack the SDK (js + d.ts), vp run --filter safe-npm-sdk build
vp dev            # run the browser playground, vp dev packages/web-example
```

## License

MIT — same as the upstream npm registry API documentation.
