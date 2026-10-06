import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  coreFixtureContext,
  coreFixtureId,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { layoutFixtureContext } from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./authoring/product.js";
import { sha256 } from "./deterministic.js";
import {
  convertLegacySurfaceIdentity,
  compileNativeSurfaceIdentity,
  type LegacySurfaceIdentity,
  type NativeSurfaceIdentityContext,
} from "./native-surface-identity.js";
function fixture() {
  const c = layoutFixtureContext(),
    core = coreFixtureContext();
  const identity: NativeSurfaceIdentityContext = {
    entityId: core.entityId,
    tenantId: core.tenantId,
    maximumFields: 10,
    fields: c.core.field,
    identities: core.identities,
    presentation: c.fieldPresentation,
    resource: {
      owner: "synthetic-tests",
      key: "readable-fields",
      version: 1,
      hash: "f".repeat(64),
    },
  };
  return { c, identity };
}
it.each(["country", "state_region"])(
  "maps %s's explicit list/detail identity and icons",
  (name) => {
    const product = parseSharedReferenceProduct(
      JSON.parse(
        readFileSync(
          new URL(
            "../../../../../../metadata/entities/common/reference/" +
              name +
              "/definition.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    const graph = compileSharedReferenceProduct(product, "studio").graph,
      f = fixture();
    const list = graph.surfaces!.find(
      (s) => s.surfaceKind === "list",
    )!.layoutConfig!;
    const detail = graph.surfaces!.find((s) => s.surfaceKind === "detail")!
      .layoutConfig!.recordPresentation as Record<string, string>;
    const sources: LegacySurfaceIdentity[] = [
      {
        identityField: list.identityField as string,
        ...(list.iconKey === undefined
          ? {}
          : { iconKey: list.iconKey as string }),
      },
      {
        titleField: detail.titleField!,
        codeField: detail.codeField!,
        ...(detail.iconKey === undefined ? {} : { iconKey: detail.iconKey! }),
      },
    ];
    for (const [i, source] of sources.entries()) {
      const surface = f.c.core.surface[i]!;
      expect(
        compileNativeSurfaceIdentity(
          convertLegacySurfaceIdentity(
            source,
            surface,
            f.identity,
            sha256(source),
          ),
          f.identity,
          Object.keys(source) as (keyof LegacySurfaceIdentity)[],
        ),
      ).toEqual(source);
    }
  },
);
it("uses typed field identities for changed headers, preserving code-field absence", () => {
  const f = fixture(),
    surface = f.c.core.surface[1]!;
  const source = { titleField: "name" };
  const target = convertLegacySurfaceIdentity(
    source,
    surface,
    f.identity,
    sha256(source),
  );
  expect(
    compileNativeSurfaceIdentity(target, f.identity, ["titleField"]),
  ).toEqual(source);
  expect(
    compileNativeSurfaceIdentity(
      { ...target, titleFieldId: coreFixtureId(2) },
      f.identity,
      ["titleField"],
    ),
  ).toEqual({ titleField: "code" });
});
it("rejects UUID, omitted or masked header fields and missing/cross-tenant identities", () => {
  const f = fixture(),
    surface = f.c.core.surface[0]!;
  for (const display of ["masked", "omitted"] as const) {
    const source = { identityField: "code" };
    expect(() =>
      convertLegacySurfaceIdentity(
        source,
        surface,
        {
          ...f.identity,
          presentation: f.identity.presentation.map((p) => ({ ...p, display })),
        },
        sha256(source),
      ),
    ).toThrow("NATIVE_SURFACE_IDENTITY_READ_DENIED");
  }
  const source = { identityField: "id" };
  expect(() =>
    convertLegacySurfaceIdentity(source, surface, f.identity, sha256(source)),
  ).toThrow("NATIVE_SURFACE_IDENTITY_READ_DENIED");
  expect(() =>
    compileNativeSurfaceIdentity(
      surface,
      {
        ...f.identity,
        identities: f.identity.identities.map((i) => ({
          ...i,
          tenantId: coreFixtureId(999),
        })),
      },
      ["identityField"],
    ),
  ).toThrow("NATIVE_SURFACE_IDENTITY_SCOPE_INVALID");
  expect(() =>
    compileNativeSurfaceIdentity(
      surface,
      {
        ...f.identity,
        identities: [...f.identity.identities, f.identity.identities[0]!],
      },
      ["identityField"],
    ),
  ).toThrow("NATIVE_SURFACE_IDENTITY_SCOPE_INVALID");
});
it("rejects source drift, missing declarations and unsupported variants", () => {
  const f = fixture(),
    surface = f.c.core.surface[0]!;
  expect(() =>
    convertLegacySurfaceIdentity(
      { identityField: "code" },
      surface,
      f.identity,
      "0".repeat(64),
    ),
  ).toThrow("NATIVE_SURFACE_IDENTITY_SOURCE_HASH_MISMATCH");
  const source = { identityField: "unknown" };
  expect(() =>
    convertLegacySurfaceIdentity(source, surface, f.identity, sha256(source)),
  ).toThrow("NATIVE_SURFACE_IDENTITY_FIELD_UNKNOWN");
  expect(() => compileNativeSurfaceIdentity(surface, f.identity, [])).toThrow(
    "NATIVE_SURFACE_IDENTITY_VARIANT_INVALID",
  );
  expect(() =>
    compileNativeSurfaceIdentity(surface, f.identity, ["titleField"]),
  ).toThrow("NATIVE_SURFACE_IDENTITY_VARIANT_INVALID");
  expect(() =>
    compileNativeSurfaceIdentity(
      { ...surface, identityFieldId: null },
      f.identity,
      ["identityField"],
    ),
  ).toThrow("NATIVE_SURFACE_IDENTITY_INCOMPLETE");
});
