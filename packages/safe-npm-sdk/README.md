# safe-npm-sdk

A modern TypeScript SDK for the [npm registry API](https://github.com/npm/registry/blob/main/docs/download.md).

- **ESM + native `fetch` + `zod`** — zero heavyweight runtime deps, runs on Node 18+, Deno, Bun, browsers.
- **Pure functions** — `listTokens(client)`, or omit the client and use a global default.
- **Typed & validated** — every response is parsed with a zod schema; types are inferred.
- **`{ data, error, response }` results that never throw** — plus `.unwrap()` / `.unwrapOr()` / `.map()` for ergonomic chaining.
- **First-class 2FA, `npm-notice`, WebAuthn** — the npm-specific bits are modeled, not bolted on.

## Install

```bash
pnpm add safe-npm-sdk
# npm install safe-npm-sdk
# yarn add safe-npm-sdk
```

## Quick start

```ts
import { createClient, setDefaultClient, searchPackages, listTokens } from "safe-npm-sdk";

// 1. Create a client (token from https://www.npmjs.com/settings/~/tokens)
const client = createClient({ auth: { token: process.env.NPM_TOKEN! } });
setDefaultClient(client); // optional global default

// 2a. Result style — never throws, branch on .ok
const r = await searchPackages({ text: "zod", size: 5 });
if (r.ok) {
  for (const hit of r.data.objects) console.log(hit.package.name);
} else {
  console.error(r.error.status, r.error.message);
}

// 2b. Or unwrap to throw on failure
const tokens = await listTokens().unwrap();
```

## Auth

npm accepts several bearer token types. Pass the right one for your use case:

```ts
// npm session / granular access token (most endpoints)
createClient({ auth: { token: "npm_xxx" } });

// OIDC id_token (only for the OIDC token-exchange endpoint)
createClient({ auth: { oidcIdToken: "eyJhbGci..." } });
```

You can configure the registry, timeout, retries, and a `npm-notice` listener:

```ts
createClient({
  auth: { token },
  registry: "https://registry.npmjs.org", // default
  timeout: 30_000, // default
  retries: 3, // default; 5xx + network errors
  onNotice: (n) => console.log("[npm-notice]", n),
});
```

## Results & chaining

Every operation returns a `Result<T>`:

```ts
type Result<T> =
  | { ok: true; data: T; response: ApiResponse<T> }
  | { ok: false; error: NpmApiError; response: ApiResponse<T> };
```

The `response` always exposes the raw `headers` and `status` — even on failure — because npm returns important data in error bodies and headers (e.g. the WebAuthn `authUrl`/`doneUrl` on a `401`, or the `npm-notice` header on token creation).

Chain helpers convert a result into the shape you want:

```ts
const r = await getPackageVisibility("@scope/pkg", client);

r.unwrap(); // throws NpmApiError if failed, returns data
r.unwrapOr({}); // returns {} on failure
const names = r.map((p) => Object.keys(p)); // transform success data
```

## 2FA (OTP)

Mutating endpoints (token create/delete, trust, stage approve/delete) require a one-time password. Pass it as an explicit option so it can't be forgotten:

```ts
import { createToken } from "safe-npm-sdk";

const r = await createToken(
  { password, name: "ci", packages: ["*"] },
  { otp: "123456" }, // required
);
if (r.ok) console.log("store this once:", r.data.token); // full token, shown only now
```

The `npm-notice` response header (e.g. the token-reveal warning) is delivered to `onNotice` **and** available on the error/result via `response.headers`.

## WebAuthn flow

When 2FA is enabled and no OTP is sent, npm may respond `401` with a browser-auth challenge. Parse it and drive the flow yourself:

```ts
import { parseWebAuthnChallenge } from "safe-npm-sdk";

const r = await createToken({ password, name: "x" }, { otp: "" }, client);
if (!r.ok) {
  const challenge = parseWebAuthnChallenge(r.error.body);
  if (challenge) {
    console.log("Open this URL to authenticate:", challenge.authUrl);
    console.log("Then poll:", challenge.doneUrl);
  }
}
```

## Endpoint coverage

Every registry operation in the SDK maps 1:1 to an operation in the OpenAPI
spec, plus `unpublishPackage` for removing a live version. The table below is
generated from `src/operations/` — regenerate with `node scripts/gen-readme-fragments.mjs`.

<!-- BEGIN ENDPOINTS -->

| Group          | Operations                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tokens**     | `listTokens`, `createToken`, `deleteToken`                                                                                                                                         |
| **OIDC**       | `exchangeOidcToken`                                                                                                                                                                |
| **Trust**      | `getTrustedPublishers`, `configureTrustedPublisher`, `deleteTrustedPublisher`                                                                                                      |
| **Unpublish**  | `unpublishPackage`                                                                                                                                                                 |
| **Access**     | `getTeamPackageGrants`, `createTeamPackageGrant`, `deleteTeamPackageGrant`, `getOrgPackages`, `getPackageCollaborators`, `getPackageVisibility`, `setPackageAccess`                |
| **Audit**      | `bulkAudit`                                                                                                                                                                        |
| **Org & Team** | `getOrgMembership`, `changeOrgMembership`, `deleteOrgMembership`, `getScopeTeams`, `createTeam`, `deleteTeam`, `getTeamMembership`, `createTeamMembership`, `deleteTeamMembership` |
| **Publish**    | `publish`                                                                                                                                                                          |
| **Search**     | `searchPackages`                                                                                                                                                                   |
| **Stage**      | `getStageItems`, `stagePackageVersion`, `getStagePackageVersion`, `deleteStagePackageVersion`, `approveStagePackageVersion`, `getStagePackageTarball`                              |

<!-- END ENDPOINTS -->

Scoped package names (`@scope/pkg`) are URL-escaped automatically.

## Examples

This SDK lives in a Vite+ monorepo. A safe, read-only browser playground is in
[`packages/web-example`](../web-example). Start it with the dev server (hot-reload
from the SDK source — no build needed):

```bash
vp dev packages/web-example   # from the repo root
# open http://localhost:5173/
```

It only exposes GET endpoints (search, list tokens, visibility, collaborators,
org/team membership, staged items) — nothing here can publish, create, or delete.
Your token goes straight from the browser to `registry.npmjs.org`.

## Development

The repo uses [Vite+](https://viteplus.dev/) (`vp`) as its unified toolchain —
fmt (Oxfmt), lint (Oxlint), type check, test (Vitest 4) and build (tsdown)
all run through `vp`.

```bash
vp install         # install workspace dependencies
vp check           # format + lint + type check (prefer this loop)
vp test            # vitest + msw (59 tests, no real token needed)
vp run --filter safe-npm-sdk build   # pack → dist/index.mjs + dist/index.d.mts
```

## License

MIT
