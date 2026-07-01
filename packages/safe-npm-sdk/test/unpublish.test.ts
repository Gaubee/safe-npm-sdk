import { describe, expect, it } from "vite-plus/test";
import { unpublishPackage } from "../src/operations/unpublish";
import { HttpResponse, makeClient, reg, startServer } from "./helpers";

const server = startServer();

/** Build a minimal packument for the mock registry. */
function packument(
  versions: string[],
  opts: { latest?: string; rev?: string } = {},
): Record<string, unknown> {
  const latest = opts.latest ?? versions[versions.length - 1];
  const time: Record<string, string> = {
    created: "2025-01-01T00:00:00Z",
    modified: "2025-01-02T00:00:00Z",
  };
  const verObj: Record<string, unknown> = {};
  for (const v of versions) {
    time[v] = "2025-01-01T00:00:00Z";
    verObj[v] = {
      name: "demo-pkg",
      version: v,
      dist: {
        integrity: "sha512-xxx",
        shasum: "abc",
        tarball: `https://registry.npmjs.org/demo-pkg/-/demo-pkg-${v}.tgz`,
      },
    };
  }
  return {
    _id: "demo-pkg",
    _rev: opts.rev ?? "1-aaaa",
    name: "demo-pkg",
    "dist-tags": { latest },
    versions: verObj,
    time,
  };
}

describe("unpublishPackage", () => {
  it("removes one version from a multi-version package (full 5-step protocol)", async () => {
    let rev = "1-aaaa";
    let putBody: unknown;
    let putPath = "";
    let deletedTarball = "";

    server.use(
      // Step 1: initial GET (and step 4 re-GET share this handler via rev change).
      // latest is explicitly 2.0.0 (greatest); removing 1.0.0 (non-latest) leaves it.
      reg.get("/demo-pkg", () =>
        HttpResponse.json(packument(["1.0.0", "1.5.0", "2.0.0"], { latest: "2.0.0", rev })),
      ),
      // Step 3: PUT modified packument
      reg.put("/demo-pkg/-rev/:rev", async ({ request, params }) => {
        putPath = `/demo-pkg/-rev/${String(params.rev)}`;
        putBody = await request.json();
        rev = "2-bbbb"; // bump rev after write
        return HttpResponse.json({ ok: true });
      }),
      // Step 5: DELETE the tarball
      reg.delete("/demo-pkg/-/demo-pkg-1.0.0.tgz/-rev/:rev", ({ request }) => {
        deletedTarball = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );

    const r = await unpublishPackage("demo-pkg", "1.0.0", { otp: "123456" }, makeClient());

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.removedVersion).toBe("1.0.0");
      expect(r.data.packageRemoved).toBe(false);
      // latest was "2.0.0" (not the removed one) so it stays; if it WERE removed
      // it would have been reassigned to "2.0.0" (greatest remaining).
      expect(r.data.newRev).toBe("2-bbbb");
    }
    // PUT used the original rev
    expect(putPath).toBe("/demo-pkg/-rev/1-aaaa");
    // PUT body no longer contains the removed version
    const body = putBody as { versions: Record<string, unknown>; "dist-tags": { latest: string } };
    expect("1.0.0" in body.versions).toBe(false);
    expect("2.0.0" in body.versions).toBe(true);
    expect(body["dist-tags"].latest).toBe("2.0.0");
    // tarball was deleted at the new rev
    expect(deletedTarball).toBe("/demo-pkg/-/demo-pkg-1.0.0.tgz/-rev/2-bbbb");
  });

  it("reassigns latest to the greatest remaining version when latest is removed", async () => {
    let rev = "1-aaaa";
    let putBody: unknown;
    server.use(
      reg.get("/demo-pkg", () =>
        HttpResponse.json(packument(["1.0.0", "1.2.0", "1.10.0"], { latest: "1.10.0", rev })),
      ),
      reg.put("/demo-pkg/-rev/:rev", async ({ request }) => {
        putBody = await request.json();
        rev = "2-bbbb";
        return HttpResponse.json({ ok: true });
      }),
      reg.delete("/demo-pkg/-/demo-pkg-1.10.0.tgz/-rev/:rev", () =>
        HttpResponse.json({ ok: true }),
      ),
    );

    // remove the current latest (1.10.0); remaining are 1.0.0 and 1.2.0
    const r = await unpublishPackage("demo-pkg", "1.10.0", { otp: "123456" }, makeClient());
    expect(r.ok).toBe(true);
    const body = putBody as { "dist-tags": { latest: string } };
    // 1.2.0 > 1.0.0 numerically (1.10.0 was removed)
    expect(body["dist-tags"].latest).toBe("1.2.0");
  });

  it("fully removes the package when its only version is deleted", async () => {
    let rev = "1-aaaa";
    let wholeDeleted = "";
    server.use(
      reg.get("/demo-pkg", () => HttpResponse.json(packument(["0.1.0"], { rev }))),
      reg.put("/demo-pkg/-rev/:rev", () => {
        rev = "2-bbbb";
        return HttpResponse.json({ ok: true });
      }),
      // whole-package DELETE
      reg.delete("/demo-pkg/-rev/:rev", ({ request }) => {
        wholeDeleted = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );

    const r = await unpublishPackage("demo-pkg", "0.1.0", { otp: "123456" }, makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.packageRemoved).toBe(true);
    }
    // deleted the whole package at the fresh rev
    expect(wholeDeleted).toBe("/demo-pkg/-rev/2-bbbb");
  });

  it("returns ok early when the version does not exist", async () => {
    let putCalled = false;
    let deleteCalled = false;
    server.use(
      reg.get("/demo-pkg", () => HttpResponse.json(packument(["1.0.0"]))),
      reg.put("/demo-pkg/-rev/:rev", () => {
        putCalled = true;
        return HttpResponse.json({ ok: true });
      }),
      reg.delete("/demo-pkg/-/demo-pkg-9.9.9.tgz/-rev/:rev", () => {
        deleteCalled = true;
        return HttpResponse.json({ ok: true });
      }),
    );

    const r = await unpublishPackage("demo-pkg", "9.9.9", { otp: "123456" }, makeClient());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.removedVersion).toBe("9.9.9");
      expect(r.data.packageRemoved).toBe(false);
    }
    // no write requests should have fired
    expect(putCalled).toBe(false);
    expect(deleteCalled).toBe(false);
  });
});
