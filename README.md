# @api-npm/sdk

A modern TypeScript SDK for the [npm registry API](https://github.com/npm/registry/blob/main/docs/download.md).

- **ESM + native `fetch` + `zod`** — zero heavyweight runtime deps, runs on Node 18+, Deno, Bun, browsers.
- **Pure functions** — `listTokens(client)`, or omit the client and use a global default.
- **Typed & validated** — every response is parsed with a zod schema; types are inferred.
- **`{ data, error, response }` results that never throw** — plus `.unwrap()` / `.unwrapOr()` / `.map()` for ergonomic chaining.
- **First-class 2FA, `npm-notice`, WebAuthn** — the npm-specific bits are modeled, not bolted on.

## Install

```bash
pnpm add @api-npm/sdk
# npm install @api-npm/sdk
# yarn add @api-npm/sdk
```

## Quick start

```ts
import { createClient, setDefaultClient, searchPackages, listTokens } from "@api-npm/sdk";

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
  timeout: 30_000,                          // default
  retries: 3,                               // default; 5xx + network errors
  onNotice: (n) => console.log("[npm-notice]", n),
});
```

## Results & chaining

Every operation returns a `Result<T>`:

```ts
type Result<T> =
  | { ok: true;  data: T;     response: ApiResponse<T> }
  | { ok: false; error: NpmApiError; response: ApiResponse<T> };
```

The `response` always exposes the raw `headers` and `status` — even on failure — because npm returns important data in error bodies and headers (e.g. the WebAuthn `authUrl`/`doneUrl` on a `401`, or the `npm-notice` header on token creation).

Chain helpers convert a result into the shape you want:

```ts
const r = await getPackageVisibility("@scope/pkg", client);

r.unwrap();              // throws NpmApiError if failed, returns data
r.unwrapOr({});          // returns {} on failure
const names = r.map(p => Object.keys(p)); // transform success data
```

## 2FA (OTP)

Mutating endpoints (token create/delete, trust, stage approve/delete) require a one-time password. Pass it as an explicit option so it can't be forgotten:

```ts
import { createToken } from "@api-npm/sdk";

const r = await createToken(
  { password, name: "ci", packages: ["*"] },
  { otp: "123456" },            // required
);
if (r.ok) console.log("store this once:", r.data.token); // full token, shown only now
```

The `npm-notice` response header (e.g. the token-reveal warning) is delivered to `onNotice` **and** available on the error/result via `response.headers`.

## WebAuthn flow

When 2FA is enabled and no OTP is sent, npm may respond `401` with a browser-auth challenge. Parse it and drive the flow yourself:

```ts
import { parseWebAuthnChallenge } from "@api-npm/sdk";

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

All 32 registry operations are implemented:

| Group | Operations |
| --- | --- |
| **Tokens** | `listTokens`, `createToken`, `deleteToken` |
| **OIDC** | `exchangeOidcToken` |
| **Trust** | `getTrustedPublishers`, `configureTrustedPublisher`, `deleteTrustedPublisher` |
| **Access** | `getTeamPackageGrants`, `createTeamPackageGrant`, `deleteTeamPackageGrant`, `getOrgPackages`, `getPackageCollaborators`, `getPackageVisibility`, `setPackageAccess` |
| **Audit** | `bulkAudit` |
| **Org** | `getOrgMembership`, `changeOrgMembership`, `deleteOrgMembership`, `getScopeTeams` |
| **Team** | `createTeam`, `deleteTeam`, `getTeamMembership`, `createTeamMembership`, `deleteTeamMembership` |
| **Publish** | `publish` |
| **Search** | `searchPackages` |
| **Stage** | `getStageItems`, `stagePackageVersion`, `getStagePackageVersion`, `deleteStagePackageVersion`, `approveStagePackageVersion`, `getStagePackageTarball` |

Scoped package names (`@scope/pkg`) are URL-escaped automatically.

## Examples

A safe, read-only browser playground lives in [`web-example/`](./web-example). After building, serve the repo root and open it:

```bash
pnpm build
pnpm exec serve .   # or: npx http-server -p 8080
# open http://localhost:8080/web-example/
```

It only exposes GET endpoints (search, list tokens, visibility, collaborators, org/team membership, staged items) — nothing here can publish, create, or delete. Your token goes straight from the browser to `registry.npmjs.org`.

## Development

```bash
pnpm install
pnpm test          # vitest + msw (59 tests, no real token needed)
pnpm typecheck     # tsc --noEmit (strict)
pnpm build         # tsdown → dist/index.mjs + dist/index.d.mts
pnpm lint          # biome
```

## License

MIT
