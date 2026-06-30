import { describe, expect, it } from "vite-plus/test";
import { createToken, deleteToken, listTokens } from "../src/operations/tokens";
import { HttpResponse, TOKEN, makeClient, reg, startServer } from "./helpers";

const server = startServer();

describe("tokens operations", () => {
  it("listTokens returns parsed token list", async () => {
    server.use(
      reg.get("/-/npm/v1/tokens", ({ request }) => {
        expect(request.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
        return HttpResponse.json({
          objects: [
            {
              key: "k1",
              name: "ci",
              token: "npm_aBcD...7890",
              readonly: true,
              created: "2025-01-01T00:00:00.000Z",
            },
          ],
          total: 1,
        });
      }),
    );
    const r = await listTokens(makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.objects).toHaveLength(1);
      expect(r.data.objects[0]?.name).toBe("ci");
      expect(r.data.total).toBe(1);
    }
  });

  it("listTokens tolerates null fields the live registry sends", async () => {
    // The registry returns null for some token fields (e.g. scopes[].name,
    // description) instead of omitting them; nullish() must accept these.
    server.use(
      reg.get("/-/npm/v1/tokens", () =>
        HttpResponse.json({
          objects: [
            {
              key: "k1",
              name: "ci",
              description: null,
              scopes: [{ type: "package", name: null }],
              permissions: [{ name: null, action: null }],
            },
          ],
          total: "1",
        }),
      ),
    );
    const r = await listTokens(makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.objects[0]?.description).toBeNull();
      expect(r.data.objects[0]?.scopes?.[0]?.name).toBeNull();
      // total also arrives as a numeric string and is coerced
      expect(r.data.total).toBe(1);
    }
  });

  it("createToken sends otp + body and returns the created token", async () => {
    server.use(
      reg.post("/-/npm/v1/tokens", async ({ request }) => {
        expect(request.headers.get("npm-otp")).toBe("987654");
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.name).toBe("my-token");
        return HttpResponse.json(
          { key: "newkey", name: "my-token", token: "npm_fulltokenvalue" },
          { status: 201, headers: { "npm-notice": "store it safely" } },
        );
      }),
    );
    const r = await createToken(
      { password: "pw", name: "my-token", packages: ["*"] },
      { otp: "987654" },
      makeClient({ onNotice: () => {} }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.token).toBe("npm_fulltokenvalue");
  });

  it("deleteToken sends otp and returns success", async () => {
    server.use(
      reg.delete("/-/npm/v1/tokens/token/:token", ({ request, params }) => {
        expect(request.headers.get("npm-otp")).toBe("111111");
        expect(params.token).toBe("npm_xyz");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const r = await deleteToken("npm_xyz", { otp: "111111" }, makeClient());
    expect(r.ok).toBe(true);
  });
});
