import { describe, expect, it } from "vite-plus/test";
import { NpmApiError } from "../src/error";
import { err, ok } from "../src/result";

function makeHeaders(notice?: string): Headers {
  return new Headers(notice ? { "npm-notice": notice } : undefined);
}

describe("ok()", () => {
  it("builds a success result with data and response", () => {
    const r = ok(42, { status: 200, headers: makeHeaders(), body: 42 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(42);
  });

  it("unwrap returns data", () => {
    const r = ok("hello", { status: 200, headers: makeHeaders(), body: "hello" });
    expect(r.unwrap()).toBe("hello");
  });

  it("unwrapOr returns data (ignores fallback)", () => {
    const r = ok(7, { status: 200, headers: makeHeaders(), body: 7 });
    expect(r.unwrapOr(99)).toBe(7);
  });

  it("map transforms the success value", () => {
    const r = ok(2, { status: 200, headers: makeHeaders(), body: 2 });
    const mapped = r.map((n) => n * 3);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) expect(mapped.data).toBe(6);
  });
});

describe("err()", () => {
  function makeErr(status = 500, notice?: string): ReturnType<typeof err> {
    const e = new NpmApiError({
      status,
      message: "boom",
      body: { message: "boom" },
      headers: makeHeaders(notice),
    });
    return err(e, { status, headers: makeHeaders(notice), body: { message: "boom" } });
  }

  it("builds an error result", () => {
    const r = makeErr();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.status).toBe(500);
      expect(r.error.message).toBe("boom");
    }
  });

  it("unwrap throws NpmApiError", () => {
    const r = makeErr(404, "a notice");
    expect(() => r.unwrap()).toThrow(NpmApiError);
    // the thrown error still carries the notice header
    try {
      r.unwrap();
    } catch (e) {
      expect((e as NpmApiError).notice).toBe("a notice");
    }
  });

  it("unwrapOr returns fallback", () => {
    const r = makeErr();
    expect(r.unwrapOr("fallback")).toBe("fallback");
  });

  it("map passes errors through unchanged", () => {
    const r = makeErr(500);
    const mapped = r.map((data) => data);
    expect(mapped.ok).toBe(false);
  });

  it("exposes isClientError / isServerError helpers", () => {
    expect(makeErr(404).error.isClientError).toBe(true);
    expect(makeErr(404).error.isServerError).toBe(false);
    expect(makeErr(500).error.isServerError).toBe(true);
  });
});
