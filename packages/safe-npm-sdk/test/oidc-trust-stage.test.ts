import { describe, expect, it } from "vite-plus/test";
import { createClient } from "../src/client";
import { exchangeOidcToken } from "../src/operations/oidc";
import {
  approveStagePackageVersion,
  deleteStagePackageVersion,
  getStageItems,
  getStagePackageTarball,
  getStagePackageVersion,
  stagePackageVersion,
} from "../src/operations/stage";
import {
  configureTrustedPublisher,
  deleteTrustedPublisher,
  getTrustedPublishers,
} from "../src/operations/trust";
import { HttpResponse, makeClient, reg, startServer } from "./helpers";

const server = startServer();

describe("oidc", () => {
  it("exchanges an id_token for a registry token", async () => {
    server.use(
      reg.post("/-/npm/v1/oidc/token/exchange/package/@scope%2Fpkg", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer my-jwt");
        return HttpResponse.json(
          { token_type: "oidc", token: "npm_exchange_token", created: "x", expires: "y" },
          { status: 201 },
        );
      }),
    );
    const c = createClient({ auth: { oidcIdToken: "my-jwt" }, retries: 0 });
    const r = await exchangeOidcToken("@scope/pkg", c);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.token).toBe("npm_exchange_token");
  });
});

describe("trust", () => {
  const githubCfg = {
    type: "github" as const,
    claims: { repository: "my-org/my-package" },
    permissions: ["createPackage" as const],
  };

  it("getTrustedPublishers requires otp", async () => {
    server.use(
      reg.get("/-/package/@scope%2Fpkg/trust", ({ request }) => {
        expect(request.headers.get("npm-otp")).toBe("333333");
        return HttpResponse.json([{ id: "12345678-1234-1234-1234-123456789abc", ...githubCfg }]);
      }),
    );
    const r = await getTrustedPublishers("@scope/pkg", { otp: "333333" }, makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toHaveLength(1);
  });

  it("configureTrustedPublisher posts a config", async () => {
    server.use(
      reg.post("/-/package/@scope%2Fpkg/trust", async ({ request }) => {
        expect(request.headers.get("npm-otp")).toBe("333333");
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.type).toBe("github");
        return HttpResponse.json([{ id: "12345678-1234-1234-1234-123456789abc", ...githubCfg }]);
      }),
    );
    const r = await configureTrustedPublisher(
      "@scope/pkg",
      githubCfg,
      { otp: "333333" },
      makeClient(),
    );
    expect(r.ok).toBe(true);
  });

  it("deleteTrustedPublisher", async () => {
    server.use(
      reg.delete("/-/package/@scope%2Fpkg/trust/:uuid", ({ request, params }) => {
        expect(request.headers.get("npm-otp")).toBe("333333");
        expect(params.uuid).toBe("u-1");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const r = await deleteTrustedPublisher(
      { package: "@scope/pkg", configUuid: "u-1" },
      { otp: "333333" },
      makeClient(),
    );
    expect(r.ok).toBe(true);
  });

  it("parses WebAuthn challenge from a 401 body", async () => {
    server.use(
      reg.get("/-/package/@scope%2Fpkg/trust", () =>
        HttpResponse.json(
          {
            authUrl: "https://www.npmjs.com/auth/cli/abc",
            doneUrl: "https://registry.npmjs.org/-/v1/done?authId=abc",
          },
          { status: 401 },
        ),
      ),
    );
    const r = await getTrustedPublishers("@scope/pkg", { otp: "bad" }, makeClient());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const body = r.error.body as Record<string, unknown>;
      expect(body.authUrl).toContain("/auth/cli/abc");
      expect(body.doneUrl).toContain("authId=abc");
    }
  });
});

describe("stage", () => {
  it("getStageItems supports query params", async () => {
    server.use(
      reg.get("/-/stage", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("package")).toBe("@scope/pkg");
        expect(url.searchParams.get("page")).toBe("0");
        return HttpResponse.json({
          items: [{ id: "11111111-1111-1111-1111-111111111111", packageName: "@scope/pkg" }],
          page: 0,
          perPage: 10,
          total: 1,
        });
      }),
    );
    const r = await getStageItems({ package: "@scope/pkg", page: 0 }, makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.items).toHaveLength(1);
  });

  it("stagePackageVersion posts a packument", async () => {
    server.use(
      reg.post("/-/stage/package/@scope%2Fpkg", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.name).toBe("@scope/pkg");
        return HttpResponse.json(
          {
            message: "Package version staged successfully.",
            stageId: "11111111-1111-1111-1111-111111111111",
          },
          { status: 201 },
        );
      }),
    );
    const r = await stagePackageVersion(
      "@scope/pkg",
      {
        name: "@scope/pkg",
        versions: { "1.0.0": { name: "@scope/pkg", version: "1.0.0" } },
        _attachments: { "@scope/pkg-1.0.0.tgz": { data: "BASE64" } },
      },
      makeClient(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.stageId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("getStagePackageVersion", async () => {
    server.use(
      reg.get("/-/stage/:id", () =>
        HttpResponse.json({
          id: "11111111-1111-1111-1111-111111111111",
          packageName: "@scope/pkg",
          version: "1.0.0",
        }),
      ),
    );
    const r = await getStagePackageVersion("11111111-1111-1111-1111-111111111111", makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.packageName).toBe("@scope/pkg");
  });

  it("deleteStagePackageVersion requires otp", async () => {
    server.use(
      reg.delete("/-/stage/:id", ({ request }) => {
        expect(request.headers.get("npm-otp")).toBe("444444");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const r = await deleteStagePackageVersion(
      "11111111-1111-1111-1111-111111111111",
      { otp: "444444" },
      makeClient(),
    );
    expect(r.ok).toBe(true);
  });

  it("approveStagePackageVersion requires otp", async () => {
    server.use(
      reg.post("/-/stage/:id/approve", ({ request }) => {
        expect(request.headers.get("npm-otp")).toBe("444444");
        return HttpResponse.json(
          { message: "Package version approved and published successfully." },
          { status: 201 },
        );
      }),
    );
    const r = await approveStagePackageVersion(
      "11111111-1111-1111-1111-111111111111",
      { otp: "444444" },
      makeClient(),
    );
    expect(r.ok).toBe(true);
  });

  it("getStagePackageTarball", async () => {
    server.use(
      reg.get(
        "/-/stage/:id/tarball",
        () =>
          new HttpResponse("binary-data", {
            headers: { "content-type": "application/octet-stream" },
          }),
      ),
    );
    const r = await getStagePackageTarball("11111111-1111-1111-1111-111111111111", makeClient());
    expect(r.ok).toBe(true);
  });
});
