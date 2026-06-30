# npm Registry API

> Version: `1.0.0` · OpenAPI `3.0.3`
> License: [MIT](https://opensource.org/licenses/MIT)

Welcome to the npm registry API documentation!


- **Base URL:** `https://registry.npmjs.org`
- **Transport:** HTTPS · request/response bodies are JSON (some publish endpoints use multipart/form-data)

## Endpoints Overview

### Tokens

- `GET` `/-/npm/v1/tokens` — List npm access tokens
- `POST` `/-/npm/v1/tokens` — Create npm access token
- `DELETE` `/-/npm/v1/tokens/token/{token}` — Delete npm access token

### OIDC

- `POST` `/-/npm/v1/oidc/token/exchange/package/{package_name}` — Exchange OIDC id_token for npm registry token

### Trust

- `GET` `/-/package/{package}/trust` — Get all trusted publisher configurations for package
- `POST` `/-/package/{package}/trust` — Add trusted publisher configuration for package
- `DELETE` `/-/package/{package}/trust/{config-uuid}` — Delete trusted publisher configuration

### Access

- `GET` `/-/team/{orgName}/{teamName}/package` — Get all packages for a team
- `PUT` `/-/team/{orgName}/{teamName}/package` — Grant access to a package for a team
- `DELETE` `/-/team/{orgName}/{teamName}/package` — Remove access to a package for a team
- `GET` `/-/org/{orgName}/package` — Get all packages for an org
- `GET` `/-/package/{escapedPackageName}/collaborators` — Get all of the users that have access to a package, as well as the access level that user has for each package.
- `GET` `/-/package/{escapedPackageName}/visibility` — Get the visibility of a package.
- `POST` `/-/package/{escapedPackageName}/access` — Sets the various access levels for a package.

### Audit

- `POST` `/-/npm/v1/security/advisories/bulk` — Get advisories for packages

### Org

- `GET` `/-/org/{orgName}/user` — Get users in an org
- `PUT` `/-/org/{orgName}/user` — Set user membership in an org
- `DELETE` `/-/org/{orgName}/user` — Remove user membership in an org
- `GET` `/-/org/{orgName}/team` — Get teams in an org

### Publish

- `PUT` `/{escapedPackageName}` — Publish a new version of a package

### Search

- `GET` `/-/v1/search` — Search for packages on the registry

### Stage

- `GET` `/-/stage` — Fetch a list of all staged package versions for the authenticated user.
- `POST` `/-/stage/package/{package-name}` — Publishes a package version to staging to be reviewed by maintainers.
- `GET` `/-/stage/{stage-id}` — Get details about a specific staged package version.
- `DELETE` `/-/stage/{stage-id}` — Delete a staged package version.
- `POST` `/-/stage/{stage-id}/approve` — Approve a staged package version, publishing it to the npm registry.
- `GET` `/-/stage/{stage-id}/tarball` — Get the tarball for a staged package version.

### Team

- `PUT` `/-/org/{orgName}/team` — Create a new team
- `DELETE` `/-/org/{orgName}/{teamName}` — Delete a team
- `GET` `/-/org/{orgName}/{teamName}/user` — Get all users in a team
- `PUT` `/-/org/{orgName}/{teamName}/user` — Add a user to a team
- `DELETE` `/-/org/{orgName}/{teamName}/user` — Remove a user from a team

## Authentication

The npm registry API supports multiple types of bearer tokens for authentication:

**Token Types:**

**1. npm Session Token (`npmSessionToken`)**
Traditional npm session tokens created via `npm login`. These tokens:
- Are tied to a user account
- Inherit the user's permissions
- Have limited expiration
- **Required for:** User account management, token creation/management

**2. npm Access Token (`npmAccessToken`)**
Fine-grained tokens with specific permissions:
- Can be scoped to specific packages and organizations
- Can be scoped to specific operations (read, write, publish)
- Have configurable expiration
- **Supported for:** Most package operations where explicitly documented

**3. OIDC id_token (`oidcIdToken`)**
Tokens from supported Identity Providers (CI/CD systems):
- From GitHub Actions, GitLab CI, CircleCI, etc.
- Must have `aud` claim set to `npm:registry.npmjs.org`
- Short-lived tokens
- **Required for:** OIDC token exchange only

**4. OIDC Exchange Token (`oidcExchangeToken`)**
Short-lived tokens obtained from OIDC token exchange:
- Package-scoped permissions
- Limited lifetime (typically 1 hour)
- **Supported for:** Package publishing and management operations

**Endpoint Authorization:**

Each endpoint specifies which token types are accepted via security schemes.
Some endpoints may accept multiple token types, others are restricted to specific types.

**Example:**
- `/tokens` endpoint: Only accepts `npmSessionToken`
- `/oidc/token/exchange` endpoint: Only accepts `oidcIdToken`
- Package publishing: May accept `npmSessionToken`, `npmAccessToken`, or `oidcExchangeToken`


### Security Schemes

| Scheme | Type | Description |
| --- | --- | --- |
| `oidcIdToken` | http (bearer, JWT) | OIDC id_token from a supported Identity Provider (IdP) such as GitHub Actions, GitLab CI, or CircleCI. The `aud` (audience) claim must be set to `npm:registry.npmjs.org`. **Supported Identity Providers:** - GitHub Actions - GitLab CI - CircleCI  |
| `npmSessionToken` | http (bearer) | Traditional npm session token created via `npm login`. These tokens are tied to a user account and inherit the user's permissions.  |
| `npmAccessToken` | http (bearer) | Granular Access Token (GAT) with fine-grained permissions. These tokens can be scoped to specific packages and operations.  |
| `granularAccessToken` | http (bearer) | Granular Access Token (GAT) with fine-grained permissions. These tokens can be scoped to specific packages and operations. (Alias for npmAccessToken)  |
| `oidcExchangeToken` | http (bearer) | Short-lived npm registry token obtained by exchanging an OIDC id_token via the `/oidc/token/exchange` endpoint. These tokens are package-scoped and have limited lifetime (typically 1 hour).  |

## Endpoint Reference

### Tokens

Token management endpoints for creating, listing, and deleting npm access tokens.


#### `GET` `/-/npm/v1/tokens`

**Operation ID:** `listTokens`

> List npm access tokens

List all access tokens associated with the authenticated user's account.

**Requirements:**
- Must be authenticated with a valid Bearer token

**Response includes:**
- All responses include security notices via the `npm-notice` header
- Tokens are redacted for security: format is `npm_aBcD...7890` (first 8 chars including prefix + ... + last 4 chars)
- Supports pagination via query parameters


**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` |
| `page` | query | integer | No | Page number for pagination (0-indexed) |
| `perPage` | query | integer | No | Number of tokens to return per page |

##### Responses

**`200`** List of tokens retrieved successfully

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `objects` | object[] | No |  |
  | `objects[].name` | string | No | The name of the token. |
  | `objects[].description` | string | No | The description of the token. |
  | `objects[].expiry` | string | No | The expiration date of the token in ISO 8601 format. |
  | `objects[].key` | string | No | The token ID. |
  | `objects[].token` | string | No | Redacted token in format: npm_aBcD...7890 (first 8 chars + ... + last 4 chars) Example: `"npm_aBcD...7890"`. |
  | `objects[].readonly` | boolean | No | Indicates if the token has readonly permissions |
  | `objects[].bypass_2fa` | boolean | No | Indicates if the token can bypass 2FA requirements |
  | `objects[].cidr` | string[] | No | List of CIDR ranges that can use this token |
  | `objects[].revoked` | string (date-time) | No | Timestamp when the token was revoked. null for active tokens |
  | `objects[].created` | string (date-time) | No | Timestamp when the token was created |
  | `objects[].updated` | string (date-time) | No | Timestamp when the token was last updated |
  | `objects[].accessed` | string (date-time) | No | Timestamp when the token was last accessed |
  | `objects[].permissions` | object[] | No | List of permissions granted to this token |
  | `objects[].permissions[].name` | string | No | Permission name (e.g., "package") |
  | `objects[].permissions[].action` | string | No | Permission action ("read" or "write") |
  | `objects[].scopes` | object[] | No | List of scopes this token has access to |
  | `objects[].scopes[].type` | string | No | Scope type (e.g., "package", "org") |
  | `objects[].scopes[].name` | string | No | Scope name |
  | `total` | integer | No | Total number of tokens |
  | `urls` | object | No | Pagination URLs for next/previous pages |

**`401`** Unauthorized - Invalid or missing authentication

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `error` | string | No |  |

**`500`** Internal server error

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |


---

#### `POST` `/-/npm/v1/tokens`

**Operation ID:** `createToken`

> Create npm access token

Create a new npm access token with customizable permissions, scope restrictions,
expiration, and CIDR IP range limitations.

**Requirements:**
- Must be authenticated
- **Two-factor authentication is required for this endpoint**
  - If 2FA is enabled on your account, provide the OTP via the `npm-otp` header
  - If 2FA is not enabled, an email OTP will be sent and must be provided via the `npm-otp` header
  - For WebAuthn users, the OTP is returned in the `doneUrl` after authentication

**Important notices:**
- All responses include security notices via the `npm-notice` header regarding token limitations


**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |
| `npm-otp` | header | string | Yes | One-time password for two-factor authentication. Always required for this endpoint. **How to obtain the OTP:** - If 2FA is enabled on your account, provide the OTP from your configured 2FA method - If 2FA is not enabled, an email OTP will be sent and must be provided (format: `<8-digit-otp-from-email>`) - For WebAuthn users, the OTP is returned by polling the `doneUrl` which returns an OTP code after hardware authentication (format: `<16-digit-otp>`) |
| `npm-auth-type` | header | string enum: `"web"` | No | Authentication type for web-based flow. When set to "web", enables browser-based authentication flow for WebAuthn users. |
| `npm-command` | header | string enum: `"token"` | No | Command context for the request. When set to "token", indicates this is a token creation command. |

##### Request Body

**Content-Type:** `application/json` *(required)*

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `password` | string | No | User password for authentication |
| `name` | string | No | Human-readable name for the token |
| `token_description` | string | No | Detailed description of token purpose |
| `expires` | number \| string | No | Expiration in days (number) or ISO date string. Read-write tokens: maximum 90 days, defaults to 7 days. Read-only tokens: unlimited maximum, defaults to 30 days |
| `bypass_2fa` | boolean | No | Allow token to bypass 2FA requirements Default: `false`. |
| `cidr` | string[] | No | IP ranges that can use this token |
| `packages` | string[] | No | Specific packages this token can access. Use ["*"] for all packages. Empty arrays are treated as not provided |
| `scopes` | string[] | No | Scoped packages this token can access. Empty arrays are treated as not provided |
| `orgs` | string[] | No | Organizations this token can access. Empty arrays are treated as not provided |
| `packages_and_scopes_permission` | string enum [`"read-only"`, `"read-write"`, `"no-access"`] | No | Permission for packages and scopes. Defaults to "read-only" if packages/scopes arrays have length > 0, otherwise "no-access" |
| `orgs_permission` | string enum [`"read-only"`, `"read-write"`, `"no-access"`] | No | Permission for organizations. Defaults to "read-only" if orgs array has length > 0, otherwise "no-access" |

##### Responses

**`201`** Token created successfully

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `key` | string | No | The token ID (UUID format). Example: `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`. |
  | `name` | string | No | Human-readable name for the token. |
  | `description` | string | No | Detailed description of token purpose. |
  | `token` | string | No | The full token value. IMPORTANT: This is the only time you will see the complete token - store it securely. Format: npm_<40 characters> Example: `"npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890"`. |
  | `expiry` | string (date-time) | No | The expiration date of the token in ISO 8601 format. |
  | `cidr` | string[] | No | List of CIDR ranges that can use this token. |
  | `bypass_2fa` | boolean | No | Indicates if the token can bypass 2FA requirements. |
  | `revoked` | string (date-time) | No | Timestamp when the token was revoked. null for active tokens. |
  | `created` | string (date-time) | No | Timestamp when the token was created. |
  | `updated` | string (date-time) | No | Timestamp when the token was last updated. null on creation. |
  | `accessed` | string (date-time) | No | Timestamp when the token was last accessed. null on creation. |
  | `permissions` | object[] | No | List of permissions granted to this token. |
  | `permissions[].name` | string | No | Permission name (e.g., "package"). |
  | `permissions[].action` | string | No | Permission action ("read" or "write"). |
  | `scopes` | object[] | No | List of scopes this token has access to. |
  | `scopes[].type` | string | No | Scope type (e.g., "package", "org"). |
  | `scopes[].name` | string | No | Scope name. |

**`400`** Bad request - Invalid parameters or validation failure

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `error` | string | No |  |

**`401`** 

**`500`** Internal server error

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `error` | string | No |  |


---

#### `DELETE` `/-/npm/v1/tokens/token/{token}`

**Operation ID:** `deleteToken`

> Delete npm access token

Delete an npm access token. The token can be specified as:
- A UUID (token identifier)
- An npm-prefixed token (format: `npm_` followed by 36 alphanumeric characters)

**Requirements:**
- Must be authenticated with a valid Bearer token
- May require 2FA OTP depending on user settings

**Web authentication flow:**
- When `npm-auth-type=web` and `npm-command=token` headers are present and 2FA is required,
  returns authentication URLs instead of an error


**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `token` | path | string | Yes | The token identifier to delete. Can be: - A UUID (e.g., `12345678-1234-1234-1234-123456789abc`) - An npm token (e.g., `npm_abcdefghijklmnopqrstuvwxyz0123456789`) |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` |
| `npm-otp` | header | string | No | One-time password for two-factor authentication. Required if the user has 2FA enabled. |
| `npm-auth-type` | header | string enum: `"web"` | No | Authentication type for web-based flow. When set to "web", enables browser-based authentication flow for WebAuthn users. |
| `npm-command` | header | string enum: `"token"` | No | Command context for the request. When set to "token", indicates this is a token deletion command. |

##### Responses

**`204`** Token deleted successfully

**`400`** Bad request - Invalid token format or token not found

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |

**`401`** Unauthorized - Invalid authentication or missing OTP

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | **variant: Error response for missing authentication or OTP** | | | |
  | `error` | string | Yes |  |
  | **variant: Web authentication flow response** | | | |
  | `authUrl` | string (uri) | Yes | URL to authenticate via web browser |
  | `doneUrl` | string (uri) | Yes | URL to poll for completion of authentication |

**`404`** Not found - Token does not exist

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |

**`500`** Internal server error

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |


---

### OIDC

OpenID Connect (OIDC) token exchange endpoints for CI/CD integrations.


#### `POST` `/-/npm/v1/oidc/token/exchange/package/{package_name}`

**Operation ID:** `exchangeOidcToken`

> Exchange OIDC id_token for npm registry token

Exchange a valid OIDC id_token (provided as a Bearer token) for a short-lived npm registry access token for the specified package.

**OIDC Token Requirements:**
- The Bearer token must be an OIDC id_token from a [supported Identity Provider (IdP)](https://docs.npmjs.com/trusted-publishers#supported-cicd-providers)
- The `aud` (audience) claim must be set to `npm:registry.npmjs.org`

**Important:** The Bearer token must be an OIDC id_token from an Identity Provider (IdP) npm supports. This endpoint differs from the rest of the API, which expects a standard npm access token.


**Auth:** `oidcIdToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `package_name` | path | string | Yes | Name of the npm package, url-encoded |

##### Responses

**`201`** Success

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `token_type` | string enum [`"oidc"`] | No |  |
  | `token` | string | No |  |
  | `created` | string (date-time) | No |  Example: `"2025-07-18T10:30:00.000Z"`. |
  | `expires` | string (date-time) | No |  Example: `"2025-07-18T11:30:00.000Z"`. |

**`400`** Bad request

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  Example: `"OIDC token exchange error - bad request"`. |

**`401`** Unauthorized

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  Example: `"OIDC token exchange error - unauthorized"`. |

**`404`** Package not found

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  Example: `"OIDC token exchange error - package not found"`. |

**`500`** Internal server error

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  Example: `"OIDC token exchange error - internal server error"`. |


---

### Trust

Trust-related endpoints for managing package trust and security settings.


#### `GET` `/-/package/{package}/trust`

**Operation ID:** `getTrustedPublishers`

> Get all trusted publisher configurations for package

Retrieve all trusted publisher configurations for a package.

This endpoint allows users with write permission to the package to view all existing trusted publisher
configurations that have been set up for OIDC token exchange for their package.

## Configuration Structure

The structure of the payload follows a specific design. Each trusted provider has their own unique set of claims.
In order to keep things clear and consistent, the properties to create a provider match the claims structure.
The caveat is when a claim requires partial matching through parsing.

- All configurations MUST include a `type`, `claims` object, and `permissions` array
- Top-level "claims" MUST match the cloud provider's exact claim properties
- Claims MAY use exact string matching when supported
- Claims MAY use an object structure to define one or multiple partial matching rules
- Partial matching properties MUST be defined and documented by this API specification
- This documentation SHALL only provide matches for specifically defined claim items

## Requirements
- Package MUST exist
- User MUST have write permission to the package
- MUST have 2FA enabled on their account
- User MUST be authenticated


**Auth:** `npmAccessToken`, `granularAccessToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `package` | path | string | Yes | Name of the npm package, url-encoded |
| `Authorization` | header | string | Yes | Authentication header. Supports both Bearer authentication. **Formats:** - `Bearer <token>` - npm access token or granular access token **Accepted token types:** - npm access token (traditional user token) |
| `npm-otp` | header | string | Yes | One-time password for two-factor authentication. Always required for this endpoint. When not provided for users with 2FA enabled, the API responds with 2FA polling payload. |

##### Responses

**`200`** Trusted publisher configurations retrieved successfully

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | **when type = github** | | | |
  | `id` | string (uuid) | Yes | Unique identifier for the configuration |
  | `type` | string enum [`"github"`] | Yes | Type of the trusted publisher |
  | `claims` | object | Yes |  |
  | `claims.repository` | string | Yes | GitHub repository in format 'owner/repo' Example: `"my-org/my-package"`. |
  | `claims.workflow_ref` | string \| object | No | Reference to the GitHub Actions workflow |
  | `claims.environment` | string | No | GitHub environment name Example: `"production"`. |
  | `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |
  | **when type = gitlab** | | | |
  | `id` | string (uuid) | Yes | Unique identifier for the configuration |
  | `type` | string enum [`"gitlab"`] | Yes | Type of the trusted publisher |
  | `claims` | object | Yes |  |
  | `claims.project_path` | string | Yes | GitLab project path in format 'group/project' Example: `"my-group/my-package"`. |
  | `claims.ci_config_ref_uri` | string \| object | No | Reference to the GitLab CI configuration |
  | `claims.environment` | string | No | GitLab environment name Example: `"production"`. |
  | `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |
  | **when type = circleci** | | | |
  | `id` | string (uuid) | Yes | Unique identifier for the configuration |
  | `type` | string enum [`"circleci"`] | Yes | Type of the trusted publisher |
  | `claims` | object | Yes |  |
  | `claims.oidc.circleci.com/org-id` | string (uuid) | Yes | The UUID of the CircleCI organization Example: `"94b40e60-cfd5-486f-a04b-507abf27a83d"`. |
  | `claims.oidc.circleci.com/project-id` | string (uuid) | Yes | The UUID of the CircleCI project Example: `"ff4d0d0d-5033-48c5-81e6-7c14a4715837"`. |
  | `claims.oidc.circleci.com/pipeline-definition-id` | string (uuid) | Yes | The UUID of the pipeline definition Id Example: `"c959a6e7-5b83-4bc1-b46f-37bf13513490"`. |
  | `claims.oidc.circleci.com/context-ids` | string (uuid)[] | No | Optional array of CircleCI context UUIDs. Example: `["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]`. |
  | `claims.oidc.circleci.com/vcs-origin` | string | Yes | The origin repository where the CI job runs, in the format `<vcs-provider>/<org>/<repo>`. Example: `"github.com/myorg/myrepo"`. |
  | `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |

**`401`** Unauthorized - missing or invalid authentication / OTP

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | **variant: Error response for missing authentication or OTP** | | | |
  | `message` | string | Yes |  |
  | **variant: Web authentication flow response** | | | |
  | `authUrl` | string (uri) | Yes | URL to authenticate via web browser |
  | `doneUrl` | string (uri) | Yes | URL to poll for completion of authentication |

**`403`** 2fa required or insufficient permissions

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |

**`404`** Package not found

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |


---

#### `POST` `/-/package/{package}/trust`

**Operation ID:** `configureTrustedPublisher`

> Add trusted publisher configuration for package

Configure trusted publisher settings for a package to enable OIDC token exchange.

This endpoint allows users with write permission to the package to establish trust with CI/CD providers
(GitHub Actions, GitLab CI, CircleCI, etc.) so that those services can publish to the package
without requiring long-lived npm tokens. The configuration also defines the specific permissions
granted to the trusted publisher, controlling what actions it is allowed to perform.

## Requirements
- Package MUST exist
- User MUST have write permission to the package
- MUST have 2FA enabled on their account
- User MUST be authenticated


**Auth:** `npmAccessToken`, `granularAccessToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `package` | path | string | Yes | Name of the npm package, url-encoded |
| `Authorization` | header | string | Yes | Authentication header. Supports both Bearer authentication. **Formats:** - `Bearer <token>` - npm access token or granular access token **Accepted token types:** - npm access token (traditional user token) |
| `npm-otp` | header | string | Yes | One-time password for two-factor authentication. Always required for this endpoint. When not provided for users with 2FA enabled, the API responds with 2FA polling payload. |

##### Request Body

**Content-Type:** `application/json` *(required)*

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| **when type = github** | | | |
| `type` | string enum [`"github"`] | Yes | Type of the trusted publisher |
| `claims` | object | Yes |  |
| `claims.repository` | string | Yes | GitHub repository in format 'owner/repo' Example: `"my-org/my-package"`. |
| `claims.workflow_ref` | string \| object | No | Reference to the GitHub Actions workflow |
| `claims.environment` | string | No | GitHub environment name Example: `"production"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |
| **when type = gitlab** | | | |
| `type` | string enum [`"gitlab"`] | Yes | Type of the trusted publisher |
| `claims` | object | Yes |  |
| `claims.project_path` | string | Yes | GitLab project path in format 'group/project' Example: `"my-group/my-package"`. |
| `claims.ci_config_ref_uri` | string \| object | No | Reference to the GitLab CI configuration |
| `claims.environment` | string | No | GitLab environment name Example: `"production"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |
| **when type = circleci** | | | |
| `type` | string enum [`"circleci"`] | Yes | Type of the trusted publisher |
| `claims` | object | Yes |  |
| `claims.oidc.circleci.com/org-id` | string (uuid) | Yes | The UUID of the CircleCI organization Example: `"94b40e60-cfd5-486f-a04b-507abf27a83d"`. |
| `claims.oidc.circleci.com/project-id` | string (uuid) | Yes | The UUID of the CircleCI project Example: `"ff4d0d0d-5033-48c5-81e6-7c14a4715837"`. |
| `claims.oidc.circleci.com/pipeline-definition-id` | string (uuid) | Yes | The UUID of the pipeline definition Id Example: `"c959a6e7-5b83-4bc1-b46f-37bf13513490"`. |
| `claims.oidc.circleci.com/context-ids` | string (uuid)[] | No | Optional array of CircleCI context UUIDs. Example: `["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]`. |
| `claims.oidc.circleci.com/vcs-origin` | string | Yes | The origin repository where the CI job runs, in the format `<vcs-provider>/<org>/<repo>`. Example: `"github.com/myorg/myrepo"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |

##### Responses

**`200`** Trusted publisher configuration created successfully

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | **when type = github** | | | |
  | `id` | string (uuid) | Yes | Unique identifier for the configuration |
  | `type` | string enum [`"github"`] | Yes | Type of the trusted publisher |
  | `claims` | object | Yes |  |
  | `claims.repository` | string | Yes | GitHub repository in format 'owner/repo' Example: `"my-org/my-package"`. |
  | `claims.workflow_ref` | string \| object | No | Reference to the GitHub Actions workflow |
  | `claims.environment` | string | No | GitHub environment name Example: `"production"`. |
  | `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |
  | **when type = gitlab** | | | |
  | `id` | string (uuid) | Yes | Unique identifier for the configuration |
  | `type` | string enum [`"gitlab"`] | Yes | Type of the trusted publisher |
  | `claims` | object | Yes |  |
  | `claims.project_path` | string | Yes | GitLab project path in format 'group/project' Example: `"my-group/my-package"`. |
  | `claims.ci_config_ref_uri` | string \| object | No | Reference to the GitLab CI configuration |
  | `claims.environment` | string | No | GitLab environment name Example: `"production"`. |
  | `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |
  | **when type = circleci** | | | |
  | `id` | string (uuid) | Yes | Unique identifier for the configuration |
  | `type` | string enum [`"circleci"`] | Yes | Type of the trusted publisher |
  | `claims` | object | Yes |  |
  | `claims.oidc.circleci.com/org-id` | string (uuid) | Yes | The UUID of the CircleCI organization Example: `"94b40e60-cfd5-486f-a04b-507abf27a83d"`. |
  | `claims.oidc.circleci.com/project-id` | string (uuid) | Yes | The UUID of the CircleCI project Example: `"ff4d0d0d-5033-48c5-81e6-7c14a4715837"`. |
  | `claims.oidc.circleci.com/pipeline-definition-id` | string (uuid) | Yes | The UUID of the pipeline definition Id Example: `"c959a6e7-5b83-4bc1-b46f-37bf13513490"`. |
  | `claims.oidc.circleci.com/context-ids` | string (uuid)[] | No | Optional array of CircleCI context UUIDs. Example: `["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]`. |
  | `claims.oidc.circleci.com/vcs-origin` | string | Yes | The origin repository where the CI job runs, in the format `<vcs-provider>/<org>/<repo>`. Example: `"github.com/myorg/myrepo"`. |
  | `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |

**`400`** Bad request body

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |

**`401`** Unauthorized - missing or invalid authentication / OTP

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | **variant: Error response for missing authentication or OTP** | | | |
  | `message` | string | Yes |  |
  | **variant: Web authentication flow response** | | | |
  | `authUrl` | string (uri) | Yes | URL to authenticate via web browser |
  | `doneUrl` | string (uri) | Yes | URL to poll for completion of authentication |

**`403`** 2fa required

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |

**`404`** Package not found

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |

**`409`** Conflict - Configuration already exists

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |


---

#### `DELETE` `/-/package/{package}/trust/{config-uuid}`

**Operation ID:** `deleteTrustedPublisher`

> Delete trusted publisher configuration

Delete a specific trusted publisher configuration for a package by its UUID.

This endpoint allows users with write permission to the package to remove an existing trusted publisher
configuration that was previously set up for OIDC token exchange.

## Requirements
- Package MUST exist
- User MUST have write permission to the package
- MUST have 2FA enabled on their account
- User MUST be authenticated


**Auth:** `npmAccessToken`, `granularAccessToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `package` | path | string | Yes | Name of the npm package, url-encoded |
| `config-uuid` | path | string (uuid) | Yes | UUID of the trusted publisher configuration to delete |
| `Authorization` | header | string | Yes | Authentication header. Supports both Bearer authentication. **Formats:** - `Bearer <token>` - npm access token or granular access token **Accepted token types:** - npm access token (traditional user token) |
| `npm-otp` | header | string | Yes | One-time password for two-factor authentication. Always required for this endpoint. When not provided for users with 2FA enabled, the API responds with 2FA polling payload. |

##### Responses

**`204`** Trusted publisher configuration deleted successfully

**`400`** Bad request

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |

**`401`** Unauthorized - missing or invalid authentication / OTP

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | **variant: Error response for missing authentication or OTP** | | | |
  | `message` | string | Yes |  |
  | **variant: Web authentication flow response** | | | |
  | `authUrl` | string (uri) | Yes | URL to authenticate via web browser |
  | `doneUrl` | string (uri) | Yes | URL to poll for completion of authentication |

**`403`** 2fa required or insufficient permissions

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |

**`404`** Package or configuration not found

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |


---

### Access

#### `GET` `/-/team/{orgName}/{teamName}/package`

**Operation ID:** `getTeamPackageGrants`

> Get all packages for a team

Get all of the packages a team has access to, as well as the access level that team has for each package.

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `teamName` | path | string | Yes | Name of a team |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Responses

**`200`** 

**`401`** 


---

#### `PUT` `/-/team/{orgName}/{teamName}/package`

**Operation ID:** `createTeamPackageGrant`

> Grant access to a package for a team

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `teamName` | path | string | Yes | Name of a team |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Request Body

**Content-Type:** `application/json` *(required)*

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `package` | string | No | The name of the package to give access to |
| `permissions` | string enum [`"read-only"`, `"read-write"`] | No | The access level of the package to grant to the team |

##### Responses

**`201`** 

**`401`** 


---

#### `DELETE` `/-/team/{orgName}/{teamName}/package`

**Operation ID:** `deleteTeamPackageGrant`

> Remove access to a package for a team

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `teamName` | path | string | Yes | Name of a team |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Responses

**`204`** 

**`401`** 


---

#### `GET` `/-/org/{orgName}/package`

**Operation ID:** `getOrgPackages`

> Get all packages for an org

Get all of the packages an org has access to, as well a the access level that org has for each pacakge.

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Responses

**`200`** 

**`401`** 


---

#### `GET` `/-/package/{escapedPackageName}/collaborators`

**Operation ID:** `getPackageCollaborators`

> Get all of the users that have access to a package, as well as the access level that user has for each package.

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `escapedPackageName` | path | string | Yes | The name of a package.  Scoped packages need "/" to be url encoded to "%2F" |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Responses

**`200`** 

**`401`** 


---

#### `GET` `/-/package/{escapedPackageName}/visibility`

**Operation ID:** `getPackageVisibility`

> Get the visibility of a package.

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `escapedPackageName` | path | string | Yes | The name of a package.  Scoped packages need "/" to be url encoded to "%2F" |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Responses

**`200`** 

**`401`** 


---

#### `POST` `/-/package/{escapedPackageName}/access`

**Operation ID:** `setPackageAccess`

> Sets the various access levels for a package.

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `escapedPackageName` | path | string | Yes | The name of a package.  Scoped packages need "/" to be url encoded to "%2F" |

##### Request Body

**Content-Type:** `application/json` *(required)*

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `access` | string enum [`"public"`, `"private"`] | No | Visibility of a package |
| `publish_requires_tfa` | boolean | No | Whether publishing this package requires multifactor auth |
| `automation_token_overrides_tfa` | boolean | No | Whether or not automation tokens override the requirement for multifactor auth |

##### Responses

**`200`** 

**`401`** 


---

### Audit

#### `POST` `/-/npm/v1/security/advisories/bulk`

**Operation ID:** `bulkAudit`

> Get advisories for packages

Get advisories for a list of packages and version ranges

##### Request Body

Packages with their versions

**Content-Type:** `application/json` *(required)*

Type: `object`

##### Responses

**`200`** 

**`400`** 


---

### Org

#### `GET` `/-/org/{orgName}/user`

**Operation ID:** `getOrgMembership`

> Get users in an org

Get all of the users in an org, along with their access levels in that org

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Responses

**`200`** 

**`401`** 


---

#### `PUT` `/-/org/{orgName}/user`

**Operation ID:** `changeOrgMembership`

> Set user membership in an org

Set a user's membership in an org. If the user is not already a member, an invite will be sent.

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Request Body

**Content-Type:** `application/json` *(required)*

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `user` | string | No | Username to grant membership to org |
| `role` | string enum [`"developer"`, `"admin"`, `"owner"`] | No | Role to give user in org |

##### Responses

**`201`** 

**`401`** 


---

#### `DELETE` `/-/org/{orgName}/user`

**Operation ID:** `deleteOrgMembership`

> Remove user membership in an org

Remove a user's membership in an org

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Request Body

**Content-Type:** `application/json` *(required)*

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `user` | string | No | Username to remove from the org |

##### Responses

**`204`** 

**`401`** 


---

#### `GET` `/-/org/{orgName}/team`

**Operation ID:** `getScopeTeams`

> Get teams in an org

Get all of the teams in an org

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Responses

**`200`** 

**`401`** 


---

### Publish

#### `PUT` `/{escapedPackageName}`

**Operation ID:** `publish`

> Publish a new version of a package

**Auth:** `npmAccessToken`, `npmSessionToken`, `granularAccessToken`, `oidcIdToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `escapedPackageName` | path | string | Yes | The name of a package.  Scoped packages need "/" to be url encoded to "%2F" |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Request Body

**Content-Type:** `application/json` *(required)*

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `_id` | string | No | The name and version of the package being published Example: `"npm@2.0.0"`. |
| `name` | string | No | The name of the package being published Example: `"npm"`. |
| `description` | string | No | The description of the package being published Example: `"a package manager for JavaScript"`. |
| `dist-tags` | object | No | dist-tag to apply for this new version Example: `{"latest":"2.0.0"}`. |
| `dist` | object | No |  |
| `dist.integrity` | string (sha512) | No | sha512 integrity string for this version's tarball Example: `"sha512-0p99G5Mu9FC3ixLarvgfU0O8xoc386LBll2UixE8rbSJrKRFoXbJFbGSOBN9exJiFXryiLDFFhCKjOOBxQ/dsQ=="`. |
| `dist.shasum` | string (sha1) | No | sha1 hex digest for this version's tarball Example: `"f783874393588901af1a4824a145fa009f174d9d"`. |
| `dist.tarball` | string (url) | No | url for the tarball will live. This is overwritten by the registry. Example: `"https://registry.npmjs.org/npm/-/npm-2.0.0.tgz"`. |
| `versions` | any | No | manifest (package.json) of the package to be published, indexed by the version being published Example: `{"2.0.0":{"name":"npm","version":"2.0.0","description":"A package manager for node"}}`. |
| `access` | string enum [`"public"`, `"restricted"`] | No | Access level for this package. Whether it is public or not. Example: `"public"`. |
| `_attachments` | object | No | Tarball and provenance attestation attachments Example: `{"npm-2.0.0.tgz":{"content_type":"application/octet-stream","data":"ZXhhbXBsZQo=","length":13},"npm-2.0.0.sigstore":{"content_type":"application/vnd.dev.sigstore.bundle+json;version=0.2","data":"ZXhhbXBsZQo=","length":13}}`. |

##### Responses

**`200`** 

**`401`** 


---

### Search

#### `GET` `/-/v1/search`

**Operation ID:** `getsearch`

> Search for packages on the registry

Search for packages on the registry

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `text` | query | string | Yes | The search query text |
| `size` | query | number | No | The number of search results to return |
| `from` | query | number | No | The starting index of the search results |

##### Responses

**`200`** 

**`400`** 


---

### Stage

#### `GET` `/-/stage`

**Operation ID:** `getStageItems`

> Fetch a list of all staged package versions for the authenticated user.

Retrieve staged package versions that are awaiting maintainer review.

This endpoint returns only items visible to the authenticated user. Results will be returned 
in the order of most recently staged first in a descending order. Results are
paginated and can be filtered by package name using the `package` query parameter.

## Requirements
- User MUST be authenticated with a valid npm token


**Auth:** `npmAccessToken`, `granularAccessToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `Authorization` | header | string | Yes | Authentication header. Supports both Bearer authentication. **Formats:** - `Bearer <token>` - npm access token or granular access token **Accepted token types:** - npm access token (traditional user token) |
| `package` | query | string | No | Filter the entire list of staged package versions by package name, url-encoded. |
| `page` | query | integer | No | Page number for pagination (0-indexed) |
| `perPage` | query | integer | No | Number of items to return per page |

##### Responses

**`200`** A list of staged package versions for the authenticated user.

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `items` | object[] | No | List of staged package versions for the authenticated user. |
  | `items[].id` | string (uuid) | No | Unique identifier for the staged package version. |
  | `items[].packageName` | string | No | The name of the package. |
  | `items[].version` | string | No | The version of the package that is being staged. |
  | `items[].tag` | string | No | The dist-tag associated with the staged package version. |
  | `items[].createdAt` | string (date-time) | No | Timestamp when the item was staged. |
  | `items[].actor` | string | No | The username of the user who staged the package version. |
  | `items[].actorType` | string | No | The type of the actor (e.g., user, trusted automation). |
  | `items[].access` | string enum [`"public"`, `"private"`] | No | The access level for the staged package version. 'public' or 'private'. |
  | `items[].shasum` | string | No | The shasum of the package tarball. |
  | `page` | integer | No | The current page number (0-indexed). |
  | `perPage` | integer | No | The number of items returned per page. |
  | `total` | integer | No | The total number of staged package versions available. |

**`401`** 

**`500`** 


---

#### `POST` `/-/stage/package/{package-name}`

**Operation ID:** `stagePackageVersion`

> Publishes a package version to staging to be reviewed by maintainers.

Submit a package version to staging for maintainer review.

The request body must contain a publish-style packument payload, including version
metadata and package attachments. The staged item can then be reviewed, inspected,
approved, or deleted by authorized maintainers.

## Requirements
- Package MUST exist or be creatable by the authenticated publisher
- User MUST be authenticated with a valid npm token
- Request body MUST include required fields in `StagedPackumentRequest`


**Auth:** `npmAccessToken`, `granularAccessToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `Authorization` | header | string | Yes | Authentication header. Supports both Bearer authentication. **Formats:** - `Bearer <token>` - npm access token or granular access token **Accepted token types:** - npm access token (traditional user token) |
| `package-name` | path | string | Yes | The name of the package to stage, including scope if applicable, url-encoded and slash-escaped. |

##### Request Body

**Content-Type:** `application/json` *(required)*

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `_id` | string | No | The package name, including scope if applicable. |
| `name` | string | No | The name of the package, including scope if applicable. |
| `description` | string | No | A short description of the package. |
| `version` | string | No | The latest version string. Informational; the actual version to publish is determined by the first key in the `versions` object. |
| `access` | string enum [`"public"`, `"private"`] | No | The access level for the package. 'public' or 'private'. |
| `versions` | object | No | An object where each key is a semver version string and the value is the version metadata. The registry assumes the FIRST key in this object is the newest version being published. Only include the single new version being published. |
| `dist-tags` | object | No | Mapping of distribution tags to semver version strings. e.g., {"latest": "1.2.3"} |
| `readme` | string | No | The README content for the package. |
| `maintainers` | object[] | No | List of package maintainers. |
| `maintainers[].name` | string | No |  |
| `maintainers[].email` | string | No |  |
| `author` | string | No | The package author. |
| `license` | string | No | The SPDX license identifier. |
| `repository` | object | No | The source code repository. |
| `repository.type` | string | No |  |
| `repository.url` | string | No |  |
| `main` | string | No | The entry point module. |
| `scripts` | object | No | Package scripts. |
| `_nodeVersion` | string | No | The version of node used to publish the package. |
| `_npmVersion` | string | No | The version of npm used to publish the package. |
| `_attachments` | object | No | An object containing the binary attachments. Each key is an attachment name (typically `{version}.tgz` for the tarball). The first attachment with `content_type: 'application/octet-stream'` is treated as the tarball; if no content_type is set, the first attachment is used. An optional sigstore provenance bundle attachment may also be included. |
| `_rev` | string | No | Packument document revision. May be included when updating an existing package. |

##### Responses

**`201`** The package version was successfully staged for review.

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  Example: `"Package version staged successfully."`. |
  | `stageId` | string (uuid) | No | Unique identifier for the staged package version, used for subsequent review actions. |

**`400`** Bad Request - The request body is missing required fields or contains invalid data.

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  |

**`401`** 

**`404`** 

**`409`** 

**`429`** 

**`500`** 


---

#### `GET` `/-/stage/{stage-id}`

**Operation ID:** `getStagePackageVersion`

> Get details about a specific staged package version.

Retrieve detailed metadata for a single staged package version.

Use this endpoint to inspect a staged item before taking action, including package
identity, version, dist-tag, creator, and tarball information.

## Requirements
- `stage-id` MUST reference an existing staged package version
- User MUST be authenticated with a valid npm token


**Auth:** `npmAccessToken`, `granularAccessToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `stage-id` | path | string (uuid) | Yes | Unique identifier for the staged package version. |
| `Authorization` | header | string | Yes | Authentication header. Supports both Bearer authentication. **Formats:** - `Bearer <token>` - npm access token or granular access token **Accepted token types:** - npm access token (traditional user token) |

##### Responses

**`200`** Details about the staged package version.

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `id` | string (uuid) | No | Unique identifier for the staged package version. |
  | `packageName` | string | No | The name of the package. |
  | `version` | string | No | The version of the package that is being staged. |
  | `tag` | string | No | The dist-tag associated with the staged package version. |
  | `createdAt` | string (date-time) | No | Timestamp when the item was staged. |
  | `actor` | string | No | The username of the user who staged the package version. |
  | `actorType` | string | No | The type of the actor (e.g., user, trusted automation). |
  | `access` | string enum [`"public"`, `"private"`] | No | The access level for the staged package version. 'public' or 'private'. |
  | `shasum` | string | No | The shasum of the package tarball. |

**`401`** 

**`404`** 

**`500`** 


---

#### `DELETE` `/-/stage/{stage-id}`

**Operation ID:** `deleteStagePackageVersion`

> Delete a staged package version.

Remove a staged package version from review.

This endpoint permanently deletes the staging record identified by `stage-id`.
Once deleted, the staged version can no longer be approved unless it is staged again.

## Requirements
- `stage-id` MUST reference an existing staged package version
- User MUST be authenticated with a valid npm token
- User MUST provide a valid `npm-otp` value for 2FA accounts


**Auth:** `npmAccessToken`, `granularAccessToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `stage-id` | path | string (uuid) | Yes | Unique identifier for the staged package version. |
| `Authorization` | header | string | Yes | Authentication header. Supports both Bearer authentication. **Formats:** - `Bearer <token>` - npm access token or granular access token **Accepted token types:** - npm access token (traditional user token) |
| `npm-otp` | header | string | Yes | One-time password for two-factor authentication. Always required for this endpoint. When not provided for users with 2FA enabled, the API responds with 2FA polling payload. |

##### Responses

**`204`** The staged package version was successfully deleted.

**`401`** 

**`403`** 

**`404`** 

**`409`** 

**`500`** 


---

#### `POST` `/-/stage/{stage-id}/approve`

**Operation ID:** `approveStagePackageVersion`

> Approve a staged package version, publishing it to the npm registry.

Approve a staged package version and publish it to the npm registry.

This endpoint moves a version from staged review state to a published package
version. On success, the staged record will be processed and the package version will become
installable.

## Requirements
- `stage-id` MUST reference an existing staged package version
- User MUST have permissions to approve and publish the package
- User MUST be authenticated with a valid npm token
- User MUST provide a valid `npm-otp` value for 2FA accounts


**Auth:** `npmAccessToken`, `granularAccessToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `stage-id` | path | string (uuid) | Yes | Unique identifier for the staged package version. |
| `Authorization` | header | string | Yes | Authentication header. Supports both Bearer authentication. **Formats:** - `Bearer <token>` - npm access token or granular access token **Accepted token types:** - npm access token (traditional user token) |
| `npm-otp` | header | string | Yes | One-time password for two-factor authentication. Always required for this endpoint. When not provided for users with 2FA enabled, the API responds with 2FA polling payload. |

##### Responses

**`201`** The staged package version was successfully approved and published to the npm registry.

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `message` | string | No |  Example: `"Package version approved and published successfully."`. |

**`401`** 

**`403`** 

**`404`** 

**`409`** 

**`429`** 

**`500`** 


---

#### `GET` `/-/stage/{stage-id}/tarball`

**Operation ID:** `getStagePackageTarball`

> Get the tarball for a staged package version.

Download the package tarball for a staged package version.

This endpoint allows maintainers to inspect the contents of the staged package version
by downloading the tarball directly from staging storage before approving it.

## Requirements
- `stage-id` MUST reference an existing staged package version
- User MUST be authenticated with a valid npm token


**Auth:** `npmAccessToken`, `granularAccessToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `stage-id` | path | string (uuid) | Yes | Unique identifier for the staged package version. |
| `Authorization` | header | string | Yes | Authentication header. Supports both Bearer authentication. **Formats:** - `Bearer <token>` - npm access token or granular access token **Accepted token types:** - npm access token (traditional user token) |

##### Responses

**`200`** The tarball for the staged package version.

- Content-Type: `application/octet-stream`
  - Type: `string (binary)`
**`401`** 

**`404`** 

**`500`** 


---

### Team

#### `PUT` `/-/org/{orgName}/team`

**Operation ID:** `putScopeTeam`

> Create a new team

Create a new team for an org

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Request Body

**Content-Type:** `application/json` *(required)*

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | No | The name of the team to create |
| `description` | string | No | The description of the team to create |

##### Responses

**`201`** Team was created successfully

- Content-Type: `application/json`

  | Field | Type | Required | Description |
  | --- | --- | --- | --- |
  | `name` | string | No | The name of the team that was created |

**`401`** 


---

#### `DELETE` `/-/org/{orgName}/{teamName}`

**Operation ID:** `deleteTeam`

> Delete a team

Delete a team from a given org

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `teamName` | path | string | Yes | Name of a team |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Responses

**`204`** 

**`401`** 


---

#### `GET` `/-/org/{orgName}/{teamName}/user`

**Operation ID:** `getTeamMembership`

> Get all users in a team

Get all users in a team

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `teamName` | path | string | Yes | Name of a team |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Responses

**`200`** 

**`401`** 


---

#### `PUT` `/-/org/{orgName}/{teamName}/user`

**Operation ID:** `createTeamMembership`

> Add a user to a team

Add a user to a team in an org. The user must already be a member of the org.

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `teamName` | path | string | Yes | Name of a team |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Request Body

**Content-Type:** `application/json` *(required)*

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `user` | string | No | The username of the user to add to the team |

##### Responses

**`201`** 

**`401`** 


---

#### `DELETE` `/-/org/{orgName}/{teamName}/user`

**Operation ID:** `deleteTeamMembership`

> Remove a user from a team

**Auth:** `npmSessionToken`

##### Parameters

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `orgName` | path | string | Yes | Name of an org |
| `teamName` | path | string | Yes | Name of a team |
| `Authorization` | header | string | Yes | Bearer token for authentication. Must be an npm access token. **Format:** `Bearer <token>` **Accepted token types:** - npm access token (traditional user token created via `npm login`) |

##### Request Body

**Content-Type:** `application/json` *(required)*

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `user` | string | No | The username of the user to remove from the team |

##### Responses

**`204`** 

**`401`** 


---

## Schemas

### `StagePackageList`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `items` | object[] | No | List of staged package versions for the authenticated user. |
| `items[].id` | string (uuid) | No | Unique identifier for the staged package version. |
| `items[].packageName` | string | No | The name of the package. |
| `items[].version` | string | No | The version of the package that is being staged. |
| `items[].tag` | string | No | The dist-tag associated with the staged package version. |
| `items[].createdAt` | string (date-time) | No | Timestamp when the item was staged. |
| `items[].actor` | string | No | The username of the user who staged the package version. |
| `items[].actorType` | string | No | The type of the actor (e.g., user, trusted automation). |
| `items[].access` | string enum [`"public"`, `"private"`] | No | The access level for the staged package version. 'public' or 'private'. |
| `items[].shasum` | string | No | The shasum of the package tarball. |
| `page` | integer | No | The current page number (0-indexed). |
| `perPage` | integer | No | The number of items returned per page. |
| `total` | integer | No | The total number of staged package versions available. |

### `StagePackageVersion`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | No | Unique identifier for the staged package version. |
| `packageName` | string | No | The name of the package. |
| `version` | string | No | The version of the package that is being staged. |
| `tag` | string | No | The dist-tag associated with the staged package version. |
| `createdAt` | string (date-time) | No | Timestamp when the item was staged. |
| `actor` | string | No | The username of the user who staged the package version. |
| `actorType` | string | No | The type of the actor (e.g., user, trusted automation). |
| `access` | string enum [`"public"`, `"private"`] | No | The access level for the staged package version. 'public' or 'private'. |
| `shasum` | string | No | The shasum of the package tarball. |

### `StagedPackumentRequest`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `_id` | string | No | The package name, including scope if applicable. |
| `name` | string | No | The name of the package, including scope if applicable. |
| `description` | string | No | A short description of the package. |
| `version` | string | No | The latest version string. Informational; the actual version to publish is determined by the first key in the `versions` object. |
| `access` | string enum [`"public"`, `"private"`] | No | The access level for the package. 'public' or 'private'. |
| `versions` | object | No | An object where each key is a semver version string and the value is the version metadata. The registry assumes the FIRST key in this object is the newest version being published. Only include the single new version being published. |
| `dist-tags` | object | No | Mapping of distribution tags to semver version strings. e.g., {"latest": "1.2.3"} |
| `readme` | string | No | The README content for the package. |
| `maintainers` | object[] | No | List of package maintainers. |
| `maintainers[].name` | string | No |  |
| `maintainers[].email` | string | No |  |
| `author` | string | No | The package author. |
| `license` | string | No | The SPDX license identifier. |
| `repository` | object | No | The source code repository. |
| `repository.type` | string | No |  |
| `repository.url` | string | No |  |
| `main` | string | No | The entry point module. |
| `scripts` | object | No | Package scripts. |
| `_nodeVersion` | string | No | The version of node used to publish the package. |
| `_npmVersion` | string | No | The version of npm used to publish the package. |
| `_attachments` | object | No | An object containing the binary attachments. Each key is an attachment name (typically `{version}.tgz` for the tarball). The first attachment with `content_type: 'application/octet-stream'` is treated as the tarball; if no content_type is set, the first attachment is used. An optional sigstore provenance bundle attachment may also be included. |
| `_rev` | string | No | Packument document revision. May be included when updating an existing package. |

### `OidcConfigs`

Array of OIDC trusted publisher configurations

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| **when type = github** | | | |
| `id` | string (uuid) | Yes | Unique identifier for the configuration |
| `type` | string enum [`"github"`] | Yes | Type of the trusted publisher |
| `claims` | object | Yes |  |
| `claims.repository` | string | Yes | GitHub repository in format 'owner/repo' Example: `"my-org/my-package"`. |
| `claims.workflow_ref` | string \| object | No | Reference to the GitHub Actions workflow |
| `claims.environment` | string | No | GitHub environment name Example: `"production"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |
| **when type = gitlab** | | | |
| `id` | string (uuid) | Yes | Unique identifier for the configuration |
| `type` | string enum [`"gitlab"`] | Yes | Type of the trusted publisher |
| `claims` | object | Yes |  |
| `claims.project_path` | string | Yes | GitLab project path in format 'group/project' Example: `"my-group/my-package"`. |
| `claims.ci_config_ref_uri` | string \| object | No | Reference to the GitLab CI configuration |
| `claims.environment` | string | No | GitLab environment name Example: `"production"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |
| **when type = circleci** | | | |
| `id` | string (uuid) | Yes | Unique identifier for the configuration |
| `type` | string enum [`"circleci"`] | Yes | Type of the trusted publisher |
| `claims` | object | Yes |  |
| `claims.oidc.circleci.com/org-id` | string (uuid) | Yes | The UUID of the CircleCI organization Example: `"94b40e60-cfd5-486f-a04b-507abf27a83d"`. |
| `claims.oidc.circleci.com/project-id` | string (uuid) | Yes | The UUID of the CircleCI project Example: `"ff4d0d0d-5033-48c5-81e6-7c14a4715837"`. |
| `claims.oidc.circleci.com/pipeline-definition-id` | string (uuid) | Yes | The UUID of the pipeline definition Id Example: `"c959a6e7-5b83-4bc1-b46f-37bf13513490"`. |
| `claims.oidc.circleci.com/context-ids` | string (uuid)[] | No | Optional array of CircleCI context UUIDs. Example: `["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]`. |
| `claims.oidc.circleci.com/vcs-origin` | string | Yes | The origin repository where the CI job runs, in the format `<vcs-provider>/<org>/<repo>`. Example: `"github.com/myorg/myrepo"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |

### `OidcConfigsCreate`

Array of OIDC trusted publisher configurations to create

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| **when type = github** | | | |
| `type` | string enum [`"github"`] | Yes | Type of the trusted publisher |
| `claims` | object | Yes |  |
| `claims.repository` | string | Yes | GitHub repository in format 'owner/repo' Example: `"my-org/my-package"`. |
| `claims.workflow_ref` | string \| object | No | Reference to the GitHub Actions workflow |
| `claims.environment` | string | No | GitHub environment name Example: `"production"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |
| **when type = gitlab** | | | |
| `type` | string enum [`"gitlab"`] | Yes | Type of the trusted publisher |
| `claims` | object | Yes |  |
| `claims.project_path` | string | Yes | GitLab project path in format 'group/project' Example: `"my-group/my-package"`. |
| `claims.ci_config_ref_uri` | string \| object | No | Reference to the GitLab CI configuration |
| `claims.environment` | string | No | GitLab environment name Example: `"production"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |
| **when type = circleci** | | | |
| `type` | string enum [`"circleci"`] | Yes | Type of the trusted publisher |
| `claims` | object | Yes |  |
| `claims.oidc.circleci.com/org-id` | string (uuid) | Yes | The UUID of the CircleCI organization Example: `"94b40e60-cfd5-486f-a04b-507abf27a83d"`. |
| `claims.oidc.circleci.com/project-id` | string (uuid) | Yes | The UUID of the CircleCI project Example: `"ff4d0d0d-5033-48c5-81e6-7c14a4715837"`. |
| `claims.oidc.circleci.com/pipeline-definition-id` | string (uuid) | Yes | The UUID of the pipeline definition Id Example: `"c959a6e7-5b83-4bc1-b46f-37bf13513490"`. |
| `claims.oidc.circleci.com/context-ids` | string (uuid)[] | No | Optional array of CircleCI context UUIDs. Example: `["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]`. |
| `claims.oidc.circleci.com/vcs-origin` | string | Yes | The origin repository where the CI job runs, in the format `<vcs-provider>/<org>/<repo>`. Example: `"github.com/myorg/myrepo"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | Yes | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |

### `GitHubActionsConfig`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | No | Unique identifier for the configuration |
| `type` | string enum [`"github"`] | No | Type of the trusted publisher |
| `claims` | object | No |  |
| `claims.repository` | string | Yes | GitHub repository in format 'owner/repo' Example: `"my-org/my-package"`. |
| `claims.workflow_ref` | string \| object | No | Reference to the GitHub Actions workflow |
| `claims.environment` | string | No | GitHub environment name Example: `"production"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | No | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |

### `GitHubActionsConfigCreate`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string enum [`"github"`] | No | Type of the trusted publisher |
| `claims` | object | No |  |
| `claims.repository` | string | Yes | GitHub repository in format 'owner/repo' Example: `"my-org/my-package"`. |
| `claims.workflow_ref` | string \| object | No | Reference to the GitHub Actions workflow |
| `claims.environment` | string | No | GitHub environment name Example: `"production"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | No | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |

### `GitLabPipelinesConfig`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | No | Unique identifier for the configuration |
| `type` | string enum [`"gitlab"`] | No | Type of the trusted publisher |
| `claims` | object | No |  |
| `claims.project_path` | string | Yes | GitLab project path in format 'group/project' Example: `"my-group/my-package"`. |
| `claims.ci_config_ref_uri` | string \| object | No | Reference to the GitLab CI configuration |
| `claims.environment` | string | No | GitLab environment name Example: `"production"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | No | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |

### `CircleCIConfig`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | No | Unique identifier for the configuration |
| `type` | string enum [`"circleci"`] | No | Type of the trusted publisher |
| `claims` | object | No |  |
| `claims.oidc.circleci.com/org-id` | string (uuid) | Yes | The UUID of the CircleCI organization Example: `"94b40e60-cfd5-486f-a04b-507abf27a83d"`. |
| `claims.oidc.circleci.com/project-id` | string (uuid) | Yes | The UUID of the CircleCI project Example: `"ff4d0d0d-5033-48c5-81e6-7c14a4715837"`. |
| `claims.oidc.circleci.com/pipeline-definition-id` | string (uuid) | Yes | The UUID of the pipeline definition Id Example: `"c959a6e7-5b83-4bc1-b46f-37bf13513490"`. |
| `claims.oidc.circleci.com/context-ids` | string (uuid)[] | No | Optional array of CircleCI context UUIDs. Example: `["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]`. |
| `claims.oidc.circleci.com/vcs-origin` | string | Yes | The origin repository where the CI job runs, in the format `<vcs-provider>/<org>/<repo>`. Example: `"github.com/myorg/myrepo"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | No | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |

### `GitLabPipelinesConfigCreate`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string enum [`"gitlab"`] | No | Type of the trusted publisher |
| `claims` | object | No |  |
| `claims.project_path` | string | Yes | GitLab project path in format 'group/project' Example: `"my-group/my-package"`. |
| `claims.ci_config_ref_uri` | string \| object | No | Reference to the GitLab CI configuration |
| `claims.environment` | string | No | GitLab environment name Example: `"production"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | No | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |

### `CircleCIConfigCreate`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string enum [`"circleci"`] | No | Type of the trusted publisher |
| `claims` | object | No |  |
| `claims.oidc.circleci.com/org-id` | string (uuid) | Yes | The UUID of the CircleCI organization Example: `"94b40e60-cfd5-486f-a04b-507abf27a83d"`. |
| `claims.oidc.circleci.com/project-id` | string (uuid) | Yes | The UUID of the CircleCI project Example: `"ff4d0d0d-5033-48c5-81e6-7c14a4715837"`. |
| `claims.oidc.circleci.com/pipeline-definition-id` | string (uuid) | Yes | The UUID of the pipeline definition Id Example: `"c959a6e7-5b83-4bc1-b46f-37bf13513490"`. |
| `claims.oidc.circleci.com/context-ids` | string (uuid)[] | No | Optional array of CircleCI context UUIDs. Example: `["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]`. |
| `claims.oidc.circleci.com/vcs-origin` | string | Yes | The origin repository where the CI job runs, in the format `<vcs-provider>/<org>/<repo>`. Example: `"github.com/myorg/myrepo"`. |
| `permissions` | string enum [`"createPackage"`, `"createStagedPackage"`] | No | List of permissions granted to the trusted publisher configuration Example: `["createPackage","createStagedPackage"]`. |
