# safe-npm-sdk

A modern TypeScript SDK for the [npm registry API](https://github.com/npm/registry/blob/main/docs/download.md).

- **ESM + native `fetch` + `zod`** — zero heavyweight runtime deps, runs on Node 18+, Deno, Bun, browsers.
- **Pure functions** — `listTokens(client)`, or omit the client and use a global default.
- **Typed & validated** — every response is parsed with a zod schema; types are inferred.
- **`{ data, error, response }` results that never throw** — plus `.unwrap()` / `.unwrapOr()` / `.map()` for ergonomic chaining.
- **First-class 2FA, `npm-notice`, WebAuthn** — the npm-specific bits are modeled, not bolted on.
- **Cross-platform** — hashing uses the Web Crypto API (`globalThis.crypto.subtle`), so the SDK has **zero Node-only imports** and runs natively in browsers, Node 18+, Deno, and Bun.

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

// Anonymous — no Authorization header (public endpoints like search)
createClient({});
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

## `null` vs `undefined` convention

The SDK distinguishes `null` from `undefined` deliberately — they are **not**
interchangeable, and TypeScript (`exactOptionalPropertyTypes`) enforces it:

| Value        | Meaning                                                                    |
| ------------ | -------------------------------------------------------------------------- |
| `undefined`  | **Omitted / fallback.** Use the default (global client, endpoint default). |
| `null`       | **Explicit empty.** Deliberately clear or skip the value.                  |
| a real value | Use it as provided.                                                        |

### `client`

Every operation's last argument is `client`. The type tells you whether the
operation may run anonymously:

- `client?: NpmClient` — authentication **required** (e.g. `listTokens`,
  `getProfile`, `publish`). Passing `null` is a **type error**.
- `client?: NpmClient | null` — anonymous access is **allowed** (e.g.
  `searchPackages`, `loginCouch`, `loginWeb`).

```ts
setDefaultClient(createClient({ auth: { token } }));

listTokens(); // undefined → uses the global default client
listTokens(myClient); // an explicit client
searchPackages({}, null); // null      → an ANONYMOUS client (no token),
//              even though a default is set
```

`null` gives you a stateless anonymous client (no `Authorization` header, public
registry) regardless of any global default — useful for public reads or the
login flow (login _obtains_ a token, so none is assumed).

### `otp`

The same rule applies to `otp?: string | null` on 2FA options:

```ts
createToken(input, { otp: "123456" }); // send this OTP
createToken(input, { otp: null }); // explicitly skip the OTP
createToken(input, {}); // omitted → endpoint default; the
//   registry will challenge (EOTP) if 2FA is required
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

Mutating endpoints (token create/delete, trust, stage approve/delete, publish, unpublish, profile update/password-change/2FA, couch login re-PUT) require a one-time password. npm write operations generally require 2FA, so pass the OTP code. `otp` follows the [`null` vs `undefined` convention](#null-vs-undefined-convention): a string sends it, `null` explicitly skips it, and omitting it lets the registry challenge you with an `EOTP` if 2FA is required:

```ts
import { createToken } from "safe-npm-sdk";

const r = await createToken(
  { password, name: "ci", packages: ["*"] },
  { otp: "123456" }, // required — the 6-digit code, or null to skip
);
if (r.ok) console.log("store this once:", r.data.token); // full token, shown only now
```

When a request fails, the error message reports `auth=yes|anonymous` and `otp=yes|no` so you can spot a missing OTP at a glance (a missing OTP is the #1 cause of mysterious 404s from `publish`).

The `npm-notice` response header (e.g. the token-reveal warning) is delivered to `onNotice` **and** available on the error/result via `response.headers`.

## Publishing with buildPublishPackument

Building the publish body by hand (integrity, shasum, base64, `_id`, `dist-tags`, `_attachments`) is tedious. `buildPublishPackument` is a **pure utility** (no client needed) that does it all — mirroring npm's own `libnpmpublish`. It's **async** (hashing goes through the Web Crypto API), so it works cross-platform with no Node-only imports:

```ts
import { readFileSync } from "node:fs";
import { buildPublishPackument, publish } from "safe-npm-sdk";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const tarball = readFileSync("my-pkg-1.0.0.tgz");

// Pure async function: manifest + tarball buffer → complete publish body.
const packument = await buildPublishPackument(manifest, tarball);

await publish(manifest.name, packument, { otp: "123456" });
```

It computes the `sha512-` integrity and `sha1` shasum from the tarball, base64-encodes it, and assembles `_id`/`dist-tags`/`versions`/`_attachments`/`access`. Scoped-package tarball names are handled automatically.

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

## Resolving avatars

NPM no longer exposes a reliable anonymous avatar endpoint. `lookupAvatar`
walks a fallback chain and returns the first hit, tagged with its source so
you can decide how much to trust it:

```ts
import { lookupAvatar } from "safe-npm-sdk";

const r = await lookupAvatar("gaubee", client); // client optional; null → anonymous
if (r.ok && r.data.avatarUrl) {
  console.log(r.data.avatarUrl, "via", r.data.source);
}
```

| Source                  | How it resolved                                                             |
| ----------------------- | --------------------------------------------------------------------------- |
| `authenticated-profile` | The authenticated profile's `email` → verified Gravatar URL.                |
| `registry-profile`      | An `avatar` field on `/-/user/{name}` (or the `org.couchdb.user:` form).    |
| `maintainer-gravatar`   | A registry `maintainer:{name}` search → matching email → verified Gravatar. |
| `none`                  | Every link missed; `avatarUrl` is `null`.                                   |

A few notes:

- **Best-effort, never throws.** A total miss returns `ok({ avatarUrl: null,
source: "none" })`, not an error. Only an unresolvable client (none passed,
  no default set) yields `err`.
- **Anonymous-friendly.** `client?: NpmClient | null`. With `null` (or an
  anonymous client) the authenticated-profile link is skipped.
- **Gravatar via SHA-256 + Web Crypto**, not MD5 — so there are zero Node-only
  imports (the legacy `/avatar/{md5}` paths npm still emits are rewritten to a
  Gravatar URL directly from that hash). The Gravatar verification is an
  external `HEAD` request with `?d=404`, so unverified users return `null`.
- **No caching.** The SDK resolves the URL only; cache the `avatarUrl` and
  download the image on your side.

## Endpoint coverage

Most registry operations in the SDK map 1:1 to an operation in the OpenAPI
spec. The SDK extensions — `unpublishPackage` (live version removal), the
**Profile** and **Login** operations — go beyond the official `openapi.json`
and are documented in `openapi-ext.json`. The table below is generated from
`src/operations/` — regenerate with `node scripts/gen-readme-fragments.mjs`.

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
| **Profile**    | `getProfile`, `updateProfile`, `changePassword`, `enableTwoFactor`, `disableTwoFactor`, `lookupAvatar`                                                                             |
| **Login**      | `loginCouch`, `loginWeb`                                                                                                                                                           |

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
vp test            # vitest + msw (120 tests, no real token needed)
vp run --filter safe-npm-sdk build   # pack → dist/index.mjs + dist/index.d.mts
```

## License

MIT
