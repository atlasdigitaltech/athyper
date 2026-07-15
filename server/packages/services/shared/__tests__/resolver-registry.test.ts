import { afterEach, describe, expect, it, vi } from "vitest";
import { asResolverCode } from "@athyper/cascade";
import {
  registerResolver,
  lookupResolver,
  lookupResolverContract,
  listResolverContracts,
  resetRegistryForTests,
  runResolver,
  type ResolverContext,
} from "../resolvers/index.js";

const noopCtx: ResolverContext = {
  tenantId: "t1",
  userId:   "u1",
  // Kysely is unused in the trivial resolver impls below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:       {} as any,
};

afterEach(() => {
  resetRegistryForTests();
});

describe("resolver registry", () => {
  it("registers and looks up a resolver by code", async () => {
    const code = asResolverCode("supplier.test_one");
    registerResolver(
      { code, description: "test", requiredSources: ["supplier_id"], outputType: "uuid", targetEntity: "supplier" },
      async (inputs) => `${inputs["supplier_id"]}-ok`,
    );

    const impl = lookupResolver(code);
    expect(impl).not.toBeNull();
    const contract = lookupResolverContract(code);
    expect(contract?.code).toBe(code);

    const value = await impl!({ supplier_id: "S1" }, noopCtx);
    expect(value).toBe("S1-ok");
  });

  it("throws on duplicate registration", () => {
    const code = asResolverCode("supplier.dup");
    registerResolver(
      { code, description: "", requiredSources: [], outputType: "uuid" },
      async () => null,
    );
    expect(() => registerResolver(
      { code, description: "", requiredSources: [], outputType: "uuid" },
      async () => null,
    )).toThrow(/already registered/);
  });

  it("listResolverContracts returns codes sorted", () => {
    registerResolver(
      { code: asResolverCode("z.alpha"), description: "", requiredSources: [], outputType: "uuid" },
      async () => null,
    );
    registerResolver(
      { code: asResolverCode("a.alpha"), description: "", requiredSources: [], outputType: "uuid" },
      async () => null,
    );
    const codes = listResolverContracts().map((c) => c.code);
    expect(codes).toEqual(["a.alpha", "z.alpha"]);
  });
});

describe("runResolver", () => {
  it("returns RESOLVER_NOT_FOUND for unknown code", async () => {
    const result = await runResolver("does.not_exist", {}, noopCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("RESOLVER_NOT_FOUND");
  });

  it("returns RESOLVER_MISSING_INPUTS when required inputs absent", async () => {
    registerResolver(
      { code: asResolverCode("supplier.needs_two"), description: "", requiredSources: ["a", "b"], outputType: "uuid" },
      async () => null,
    );
    const result = await runResolver("supplier.needs_two", { a: "x" }, noopCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("RESOLVER_MISSING_INPUTS");
      expect(result.missingKeys).toEqual(["b"]);
    }
  });

  it("treats empty string and null as missing", async () => {
    registerResolver(
      { code: asResolverCode("supplier.needs_x"), description: "", requiredSources: ["x"], outputType: "uuid" },
      async () => "ok",
    );
    const emptyStr = await runResolver("supplier.needs_x", { x: "" }, noopCtx);
    const nullVal  = await runResolver("supplier.needs_x", { x: null }, noopCtx);
    expect(emptyStr.ok).toBe(false);
    expect(nullVal.ok).toBe(false);
  });

  it("returns RESOLVER_FAILED when impl throws", async () => {
    registerResolver(
      { code: asResolverCode("supplier.throws"), description: "", requiredSources: [], outputType: "uuid" },
      async () => { throw new Error("boom"); },
    );
    const result = await runResolver("supplier.throws", {}, noopCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("RESOLVER_FAILED");
      expect(result.message).toMatch(/boom/);
    }
  });

  it("returns ok with value on success", async () => {
    const spy = vi.fn(async () => "computed");
    registerResolver(
      { code: asResolverCode("supplier.ok_one"), description: "", requiredSources: ["a"], outputType: "string" },
      spy,
    );
    const result = await runResolver("supplier.ok_one", { a: "1" }, noopCtx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("computed");
    expect(spy).toHaveBeenCalledWith({ a: "1" }, noopCtx);
  });
});
