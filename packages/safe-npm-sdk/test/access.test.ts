import { describe, expect, it } from "vite-plus/test";
import {
  createTeamPackageGrant,
  deleteTeamPackageGrant,
  getOrgPackages,
  getPackageCollaborators,
  getPackageVisibility,
  getTeamPackageGrants,
  setPackageAccess,
} from "../src/operations/access";
import { HttpResponse, makeClient, reg, startServer } from "./helpers";

const server = startServer();

describe("access operations", () => {
  it("getTeamPackageGrants", async () => {
    server.use(
      reg.get("/-/team/myorg/devs/package", () => HttpResponse.json({ "@scope/a": "read-write" })),
    );
    const r = await getTeamPackageGrants({ org: "myorg", team: "devs" }, makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data["@scope/a"]).toBe("read-write");
  });

  it("createTeamPackageGrant sends body", async () => {
    server.use(
      reg.put("/-/team/myorg/devs/package", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toEqual({ package: "@scope/a", permissions: "read-only" });
        return HttpResponse.json({ "@scope/a": "read-only" });
      }),
    );
    const r = await createTeamPackageGrant(
      { org: "myorg", team: "devs" },
      { package: "@scope/a", permissions: "read-only" },
      makeClient(),
    );
    expect(r.ok).toBe(true);
  });

  it("deleteTeamPackageGrant passes package as query", async () => {
    server.use(
      reg.delete("/-/team/myorg/devs/package", ({ request }) => {
        expect(new URL(request.url).searchParams.get("package")).toBe("@scope/a");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const r = await deleteTeamPackageGrant(
      { org: "myorg", team: "devs", package: "@scope/a" },
      makeClient(),
    );
    expect(r.ok).toBe(true);
  });

  it("getOrgPackages", async () => {
    server.use(
      reg.get("/-/org/myorg/package", () =>
        HttpResponse.json({ "@scope/a": "read-write", lodash: "read-only" }),
      ),
    );
    const r = await getOrgPackages("myorg", makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.lodash).toBe("read-only");
  });

  it("getPackageCollaborators escapes scoped names", async () => {
    server.use(
      reg.get("/-/package/@scope%2Fa/collaborators", () =>
        HttpResponse.json({ npm: "read-write" }),
      ),
    );
    const r = await getPackageCollaborators("@scope/a", makeClient());
    expect(r.ok).toBe(true);
  });

  it("getPackageVisibility", async () => {
    server.use(
      reg.get("/-/package/lodash/visibility", () => HttpResponse.json({ lodash: "public" })),
    );
    const r = await getPackageVisibility("lodash", makeClient());
    expect(r.ok).toBe(true);
  });

  it("setPackageAccess", async () => {
    server.use(
      reg.post("/-/package/lodash/access", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.publish_requires_tfa).toBe(true);
        return HttpResponse.json({ lodash: "public" });
      }),
    );
    const r = await setPackageAccess("lodash", { publish_requires_tfa: true }, makeClient());
    expect(r.ok).toBe(true);
  });
});
