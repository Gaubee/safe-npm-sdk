import { describe, expect, it } from "vite-plus/test";
import {
  changeOrgMembership,
  createTeam,
  createTeamMembership,
  deleteOrgMembership,
  deleteTeam,
  deleteTeamMembership,
  getOrgMembership,
  getScopeTeams,
  getTeamMembership,
} from "../src/operations/org-team";
import { HttpResponse, makeClient, reg, startServer } from "./helpers";

const server = startServer();

describe("org operations", () => {
  it("getOrgMembership", async () => {
    server.use(
      reg.get("/-/org/myorg/user", () => HttpResponse.json({ alice: "owner", bob: "developer" })),
    );
    const r = await getOrgMembership("myorg", makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.alice).toBe("owner");
  });

  it("changeOrgMembership sends body", async () => {
    server.use(
      reg.put("/-/org/myorg/user", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toEqual({ user: "carol", role: "admin" });
        return HttpResponse.json(
          { org: { name: "myorg", size: "3" }, user: "carol", role: "admin" },
          { status: 201 },
        );
      }),
    );
    const r = await changeOrgMembership("myorg", { user: "carol", role: "admin" }, makeClient());
    expect(r.ok).toBe(true);
  });

  it("deleteOrgMembership", async () => {
    server.use(
      reg.delete("/-/org/myorg/user", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.user).toBe("carol");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const r = await deleteOrgMembership("myorg", { user: "carol" }, makeClient());
    expect(r.ok).toBe(true);
  });

  it("getScopeTeams", async () => {
    server.use(
      reg.get("/-/org/myorg/team", () => HttpResponse.json(["@myorg:devs", "@myorg:ops"])),
    );
    const r = await getScopeTeams("myorg", makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual(["@myorg:devs", "@myorg:ops"]);
  });
});

describe("team operations", () => {
  it("createTeam", async () => {
    server.use(
      reg.put("/-/org/myorg/team", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toEqual({ name: "devs", description: "dev team" });
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const r = await createTeam("myorg", { name: "devs", description: "dev team" }, makeClient());
    expect(r.ok).toBe(true);
  });

  it("deleteTeam", async () => {
    server.use(reg.delete("/-/org/myorg/devs", () => new HttpResponse(null, { status: 204 })));
    const r = await deleteTeam({ org: "myorg", team: "devs" }, makeClient());
    expect(r.ok).toBe(true);
  });

  it("getTeamMembership", async () => {
    server.use(reg.get("/-/org/myorg/devs/user", () => HttpResponse.json(["alice", "bob"])));
    const r = await getTeamMembership({ org: "myorg", team: "devs" }, makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual(["alice", "bob"]);
  });

  it("createTeamMembership", async () => {
    server.use(
      reg.put("/-/org/myorg/devs/user", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toEqual({ user: "dave" });
        return new HttpResponse(null, { status: 201 });
      }),
    );
    const r = await createTeamMembership(
      { org: "myorg", team: "devs" },
      { user: "dave" },
      makeClient(),
    );
    expect(r.ok).toBe(true);
  });

  it("deleteTeamMembership", async () => {
    server.use(
      reg.delete("/-/org/myorg/devs/user", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toEqual({ user: "dave" });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const r = await deleteTeamMembership(
      { org: "myorg", team: "devs" },
      { user: "dave" },
      makeClient(),
    );
    expect(r.ok).toBe(true);
  });
});
