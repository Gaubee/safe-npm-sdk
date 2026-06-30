import { describe, expect, it } from "vitest";
import { bulkAudit } from "../src/operations/audit";
import { publish } from "../src/operations/publish";
import { searchPackages } from "../src/operations/search";
import { HttpResponse, makeClient, reg, startServer } from "./helpers";

const server = startServer();

describe("publish", () => {
  it("publishes with escaped package name and otp", async () => {
    server.use(
      reg.put("/@scope%2Fpkg", async ({ request }) => {
        expect(request.headers.get("npm-otp")).toBe("222222");
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.name).toBe("@scope/pkg");
        return HttpResponse.json({ success: true });
      }),
    );
    const r = await publish(
      "@scope/pkg",
      {
        name: "@scope/pkg",
        versions: { "1.0.0": { name: "@scope/pkg", version: "1.0.0" } },
        _attachments: {
          "@scope/pkg-1.0.0.tgz": { data: "BASE64", content_type: "application/octet-stream" },
        },
      },
      { otp: "222222" },
      makeClient(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.success).toBe(true);
  });
});

describe("searchPackages", () => {
  it("returns parsed search results", async () => {
    server.use(
      reg.get("/-/v1/search", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("text")).toBe("zod");
        expect(url.searchParams.get("size")).toBe("5");
        return HttpResponse.json({
          objects: [
            {
              package: { name: "zod", version: "3.0.0" },
              searchScore: 10,
              score: { final: 10 },
            },
          ],
          total: 1,
        });
      }),
    );
    const r = await searchPackages({ text: "zod", size: 5 }, makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.objects).toHaveLength(1);
      expect(r.data.objects[0]?.package.name).toBe("zod");
    }
  });

  it("unwrap() throws on a 400 error", async () => {
    server.use(
      reg.get("/-/v1/search", () =>
        HttpResponse.json(
          { error: "'text' query parameter is required", code: "ERR_TEXT_MISSING" },
          { status: 400 },
        ),
      ),
    );
    const r = await searchPackages({ text: "" }, makeClient());
    expect(r.ok).toBe(false);
    expect(() => r.unwrap()).toThrow();
  });
});

describe("bulkAudit", () => {
  it("returns advisories per package", async () => {
    server.use(
      reg.post("/-/npm/v1/security/advisories/bulk", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body).toEqual({ lodash: ["4.17.0"] });
        return HttpResponse.json({
          lodash: [
            {
              id: 1,
              url: "https://github.com/advisories/x",
              title: "Prototype Pollution",
              severity: "high",
              vulnerable_versions: "<4.17.21",
            },
          ],
        });
      }),
    );
    const r = await bulkAudit({ lodash: ["4.17.0"] }, makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.lodash).toHaveLength(1);
      expect(r.data.lodash?.[0]?.severity).toBe("high");
    }
  });
});
