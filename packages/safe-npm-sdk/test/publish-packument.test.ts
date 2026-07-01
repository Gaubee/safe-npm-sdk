import { describe, expect, it } from "vite-plus/test";
import { buildPublishPackument } from "../src/publish-packument";
import { PublishPackumentSchema } from "../src/schemas/publish";

const TARBALL = new TextEncoder().encode("hello tarball");

describe("buildPublishPackument", () => {
  it("builds a complete packument with computed integrity/shasum", async () => {
    const manifest = { name: "my-pkg", version: "1.2.3", description: "a demo" };
    const p = await buildPublishPackument(manifest, TARBALL);

    expect(p.name).toBe("my-pkg");
    expect(p._id).toBe("my-pkg@1.2.3");
    expect(p["dist-tags"]).toEqual({ latest: "1.2.3" });
    expect(p.access).toBe("public");
    const v = p.versions?.["1.2.3"] as Record<string, unknown>;
    expect(v).toBeTruthy();
    expect(v._id).toBe("my-pkg@1.2.3");
    const dist = v.dist as Record<string, string>;
    // integrity is sha512-<base64>, decodes to a 64-byte digest
    expect(dist.integrity).toMatch(/^sha512-/);
    const digest = atob(dist.integrity.slice("sha512-".length));
    expect(digest.length).toBe(64);
    // shasum is a 40-char hex string
    expect(dist.shasum).toMatch(/^[0-9a-f]{40}$/);
    expect(dist.tarball).toBe("https://registry.npmjs.org/my-pkg/-/my-pkg-1.2.3.tgz");
    const att = p._attachments?.["my-pkg-1.2.3.tgz"] as Record<string, unknown>;
    expect(att.content_type).toBe("application/octet-stream");
    // base64 round-trips back to the original bytes
    const decoded = new TextEncoder().encode(atob(String(att.data)));
    expect(decoded).toEqual(TARBALL);
    expect(att.length).toBe(TARBALL.length);
  });

  it("produces stable integrity/shasum for the same input", async () => {
    const a = await buildPublishPackument({ name: "p", version: "1.0.0" }, TARBALL);
    const b = await buildPublishPackument({ name: "p", version: "1.0.0" }, TARBALL);
    const da = a.versions?.["1.0.0"] as Record<string, unknown>;
    const db = b.versions?.["1.0.0"] as Record<string, unknown>;
    expect((da.dist as Record<string, string>).integrity).toBe(
      (db.dist as Record<string, string>).integrity,
    );
    expect((da.dist as Record<string, string>).shasum).toBe(
      (db.dist as Record<string, string>).shasum,
    );
  });

  it("handles scoped package names (drops the scope/slash in the tarball filename)", async () => {
    const p = await buildPublishPackument({ name: "@scope/my-pkg", version: "0.1.0" }, TARBALL);
    expect(p.access).toBe("restricted"); // scoped default
    const v = p.versions?.["0.1.0"] as Record<string, unknown>;
    const dist = v.dist as Record<string, string>;
    // tarball filename: @scope/my-pkg → scope-my-pkg
    expect(dist.tarball).toBe("https://registry.npmjs.org/@scope/my-pkg/-/scope-my-pkg-0.1.0.tgz");
    expect(p._attachments).toHaveProperty("scope-my-pkg-0.1.0.tgz");
  });

  it("respects custom tag, access, and registry", async () => {
    const p = await buildPublishPackument({ name: "x", version: "2.0.0" }, TARBALL, {
      tag: "beta",
      access: "public",
      registry: "https://my.registry.com/",
    });
    expect(p["dist-tags"]).toEqual({ beta: "2.0.0" });
    expect(p.access).toBe("public");
    const v = p.versions?.["2.0.0"] as Record<string, unknown>;
    const dist = v.dist as Record<string, string>;
    expect(dist.tarball).toBe("https://my.registry.com/x/-/x-2.0.0.tgz");
  });

  it("produces output that validates against PublishPackumentSchema", async () => {
    const p = await buildPublishPackument({ name: "valid", version: "1.0.0" }, TARBALL);
    expect(() => PublishPackumentSchema.parse(p)).not.toThrow();
  });

  it("throws when name or version is missing", async () => {
    await expect(
      buildPublishPackument({ version: "1.0.0" } as Record<string, unknown>, TARBALL),
    ).rejects.toThrow();
    await expect(
      buildPublishPackument({ name: "x" } as Record<string, unknown>, TARBALL),
    ).rejects.toThrow();
  });
});
