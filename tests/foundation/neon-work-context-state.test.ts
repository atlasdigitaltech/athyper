import assert from "node:assert/strict";
import test from "node:test";
import type { NeonWorkContextBootstrap } from "../../packages/platform/foundation/api-client/src/work-context";
import {
  NeonWorkContextController,
  contextPreferenceStore,
  initialSelection,
  legalEntities,
  resolveSelection,
  type WorkSelection,
} from "../../packages/planes/neon/shell/src/work-context-state";

const catalog: NeonWorkContextBootstrap = {
  schemaVersion: 1,
  tenantId: "tenant",
  revision: "revision",
  supportsAllPermitted: true,
  companies: [
    ["a1", "a"],
    ["a2", "a"],
    ["b1", "b"],
  ].map(([id, le]) => ({
    companyCodeId: id!,
    code: id!,
    displayName: id!,
    legalEntityId: le!,
    legalEntityCode: le!,
    legalEntityName: `Legal ${le}`,
    functionalCurrency: "USD",
    capabilityGroups: [],
  })),
};
const a: WorkSelection = {
  mode: "legal_entity",
  legalEntityId: "a",
  companyCodeId: "a1",
};
const b: WorkSelection = {
  mode: "legal_entity",
  legalEntityId: "b",
  companyCodeId: "b1",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(
  options: {
    load?: (signal: AbortSignal) => Promise<NeonWorkContextBootstrap>;
    canLeave?: () => boolean | Promise<boolean>;
  } = {},
) {
  let stored: unknown = a;
  const writes: WorkSelection[] = [];
  const controller = new NeonWorkContextController({
    tenantId: "tenant",
    load: options.load ?? (async () => catalog),
    preferences: {
      read: () => stored,
      write: (value) => {
        stored = value;
        writes.push(value);
      },
    },
    canLeave: options.canLeave ?? (() => true),
  });
  return { controller, writes };
}

test("legal entities deduplicate company rows without granting all companies", () => {
  assert.deepEqual(
    legalEntities(catalog.companies).map((row) => row.id),
    ["a", "b"],
  );
  assert.deepEqual(initialSelection(catalog, { mode: "all_permitted" }), {
    mode: "unresolved",
  });
  assert.equal(
    resolveSelection(catalog, { ...a, companyCodeId: "b1" }),
    undefined,
  );
  assert.deepEqual(
    initialSelection(catalog, {
      mode: "company",
      companyCodeId: "b1",
      legalEntityId: "forged",
    }),
    b,
  );
});

test("a sole LE resolves without arbitrarily selecting one of its companies", () => {
  assert.deepEqual(
    initialSelection(
      { ...catalog, companies: catalog.companies.slice(0, 2) },
      null,
    ),
    { mode: "legal_entity", legalEntityId: "a" },
  );
  assert.deepEqual(
    initialSelection(
      { ...catalog, companies: catalog.companies.slice(2) },
      null,
    ),
    b,
  );
  assert.deepEqual(initialSelection({ ...catalog, companies: [] }, a), {
    mode: "unresolved",
  });
});

test("cancelled departure keeps committed identity, generation and storage", async () => {
  const { controller, writes } = fixture({ canLeave: () => false });
  await controller.refresh();
  const before = controller.getSnapshot();
  assert.equal(await controller.select(b), false);
  assert.deepEqual(controller.getSnapshot().selection, a);
  assert.equal(controller.getSnapshot().generation, before.generation);
  assert.equal(writes.length, 1);
  assert.equal(controller.getSnapshot().switching, false);
});

test("switch keeps old identity until fresh catalog resolves and then commits atomically", async () => {
  const pending = deferred<NeonWorkContextBootstrap>();
  let count = 0;
  const { controller, writes } = fixture({
    load: async () => (++count === 1 ? catalog : pending.promise),
  });
  await controller.refresh();
  const switching = controller.select(b);
  await Promise.resolve();
  assert.deepEqual(controller.getSnapshot().selection, a);
  assert.equal(controller.getSnapshot().switching, true);
  assert.equal(writes.length, 1);
  pending.resolve(catalog);
  assert.equal(await switching, true);
  assert.deepEqual(controller.getSnapshot().selection, b);
  assert.equal(controller.getSnapshot().generation, 2);
  assert.deepEqual(writes.at(-1), b);
});

test("late results from a superseded switch cannot change identity", async () => {
  const stale = deferred<NeonWorkContextBootstrap>();
  let count = 0;
  const { controller } = fixture({
    load: async () => (++count === 2 ? stale.promise : catalog),
  });
  await controller.refresh();
  const first = controller.select(b);
  await Promise.resolve();
  const target: WorkSelection = { ...a, companyCodeId: "a2" };
  assert.equal(await controller.select(target), true);
  stale.resolve(catalog);
  assert.equal(await first, false);
  assert.deepEqual(controller.getSnapshot().selection, target);
});

test("failed refresh of a switch retains the previous coherent snapshot", async () => {
  let count = 0;
  const { controller } = fixture({
    load: async () => {
      if (++count > 1) throw new Error("network");
      return catalog;
    },
  });
  await controller.refresh();
  assert.equal(await controller.select(b), false);
  assert.deepEqual(controller.getSnapshot().selection, a);
  assert.equal(controller.getSnapshot().error, "unavailable");
  assert.equal(controller.getSnapshot().generation, 1);
});

test("selecting the committed context cancels an in-flight destination", async () => {
  const stale = deferred<NeonWorkContextBootstrap>();
  let count = 0;
  const { controller } = fixture({
    load: async () => (++count === 1 ? catalog : stale.promise),
  });
  await controller.refresh();
  const first = controller.select(b);
  await Promise.resolve();
  assert.equal(await controller.select(a), true);
  stale.resolve(catalog);
  assert.equal(await first, false);
  assert.deepEqual(controller.getSnapshot().selection, a);
});

test("explicit access denial removes the old context instead of retaining it", async () => {
  let count = 0;
  const { controller } = fixture({
    load: async () => {
      if (++count > 1) throw { status: 403 };
      return catalog;
    },
  });
  await controller.refresh();
  assert.equal(await controller.select(b), false);
  assert.equal(controller.getSnapshot().status, "error");
  assert.equal(controller.getSnapshot().catalog, undefined);
  assert.deepEqual(controller.getSnapshot().selection, { mode: "unresolved" });
});

test("revocation clears both an invalid destination and a revoked previous selection", async () => {
  let count = 0;
  const { controller, writes } = fixture({
    load: async () => (++count === 1 ? catalog : { ...catalog, companies: [] }),
  });
  await controller.refresh();
  assert.equal(await controller.select(b), false);
  assert.deepEqual(controller.getSnapshot().selection, { mode: "unresolved" });
  assert.equal(controller.getSnapshot().error, "invalid_selection");
  assert.deepEqual(writes.at(-1), { mode: "unresolved" });
});

test("a revoked destination preserves the authorized previous page generation", async () => {
  let count = 0;
  const { controller } = fixture({ load: async () => ++count === 1 ? catalog : { ...catalog, companies: catalog.companies.slice(0, 2) } });
  await controller.refresh();
  assert.equal(await controller.select(b), false);
  assert.deepEqual(controller.getSnapshot().selection, a);
  assert.equal(controller.getSnapshot().generation, 1);
});

test("initial selection does not prompt to discard work that has not mounted", async () => {
  let departures = 0;
  const controller = new NeonWorkContextController({
    tenantId: "tenant", load: async () => catalog,
    preferences: { read: () => undefined, write: () => {} },
    canLeave: () => { departures++; return false; },
  });
  await controller.refresh();
  assert.equal(await controller.select(b), true);
  assert.equal(departures, 0);
});

test("wrong-tenant and disposed initialization cannot publish catalog data", async () => {
  const invalid = fixture({
    load: async () => ({ ...catalog, tenantId: "other" }),
  }).controller;
  await invalid.refresh();
  assert.equal(invalid.getSnapshot().status, "error");
  assert.equal(invalid.getSnapshot().catalog, undefined);
  const pending = deferred<NeonWorkContextBootstrap>();
  const disposed = fixture({ load: () => pending.promise }).controller;
  const ready = disposed.refresh();
  disposed.dispose();
  pending.resolve(catalog);
  await ready;
  assert.equal(disposed.getSnapshot().catalog, undefined);
});

test("tab storage migrates legacy company only once and tolerates unavailable storage", () => {
  const oldSession = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  const oldLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const session = new Map<string, string>();
  let legacyWrites = 0;
  try {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => session.set(key, value),
      },
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => JSON.stringify({ mode: "company", companyCodeId: "a1" }),
        setItem: () => legacyWrites++,
      },
    });
    const store = contextPreferenceStore("tenant", "principal");
    assert.deepEqual(store.read(), { mode: "company", companyCodeId: "a1" });
    store.write(b);
    assert.deepEqual(store.read(), b);
    assert.equal(legacyWrites, 0);
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get: () => {
        throw new Error("storage blocked");
      },
    });
    assert.doesNotThrow(() => store.write(a));
    assert.equal(store.read(), undefined);
  } finally {
    if (oldSession)
      Object.defineProperty(globalThis, "sessionStorage", oldSession);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
    if (oldLocal) Object.defineProperty(globalThis, "localStorage", oldLocal);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
