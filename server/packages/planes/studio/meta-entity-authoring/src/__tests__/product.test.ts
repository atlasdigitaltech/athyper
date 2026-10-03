import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  parseSharedReferenceProduct,
  compileSharedReferenceProduct,
} from "../authoring/product.js";
import { isCanonicalEntityCode } from "@athyper/contract-platform-entity-runtime";

const root = new URL(
  "../../../../../../../metadata/products/shared/entities/country/",
  import.meta.url,
);
const source = () =>
  JSON.parse(readFileSync(new URL("definition.json", root), "utf8"));
const capabilities = () =>
  JSON.parse(readFileSync(new URL("capabilities.json", root), "utf8"));
describe("shared reference metadata products", () => {
  it("keeps Country plane identity, permissions and explicit target selection", () => {
    const product = parseSharedReferenceProduct(source());
    const ids = new Set<string>();
    for (const plane of ["studio", "neon", "mesh"] as const) {
      const result = compileSharedReferenceProduct(product, plane);
      ids.add(result.graph.runtimeProfiles![0]!.id!);
      expect(result.graph.runtimeProfiles![0]!.storagePlane).toBe(plane);
      expect(result.graph.entity.entityCode).toBe("country");
      expect(
        result.graph.operationPermissions.every((p) => p.targetPlane === plane),
      ).toBe(true);
      expect(
        result.graph.operationScopeBindings.every(
          (p) => p.targetPlane === plane && p.missingValueBehavior === "deny",
        ),
      ).toBe(true);
      expect(result.graph.operations.map((o) => o.operationKey)).toEqual([
        "list",
        "read",
      ]);
    }
    expect(ids.size).toBe(3);
    const neonOnly = { ...source(), planes: ["neon"] };
    expect(() =>
      compileSharedReferenceProduct(
        parseSharedReferenceProduct(neonOnly),
        "mesh",
      ),
    ).toThrow("REFERENCE_PRODUCT_TARGET_EXCLUDED");
  });
  it("uses the canonical native entity grammar before graph compilation", () => {
    for (const entityCode of [
      "country",
      "Country",
      "c",
      "example.country",
      "example-country",
      "a".repeat(64),
      "country ",
    ]) {
      const input = source();
      input.definition.entityCode = entityCode;
      if (isCanonicalEntityCode(entityCode))
        expect(parseSharedReferenceProduct(input).definition.entityCode).toBe(
          entityCode,
        );
      else
        expect(() => parseSharedReferenceProduct(input)).toThrow(
          "REFERENCE_PRODUCT_ENTITY_CODE_INVALID",
        );
    }
  });
  it("preserves explicit navigation in every target graph without inventing defaults", () => {
    const input = source();
    const navigation = {
      mode: "scroll",
      tabs: [
        {
          key: "details",
          label: "Details",
          sectionKeys: input.definition.sections.map(
            (section: { key: string }) => section.key,
          ),
        },
      ],
    };
    input.definition.navigation = navigation;
    for (const plane of ["studio", "neon", "mesh"] as const) {
      const result = compileSharedReferenceProduct(
        parseSharedReferenceProduct(input),
        plane,
      );
      expect(
        result.graph.surfaces.find((surface) => surface.surfaceKey === "detail")
          ?.layoutConfig,
      ).toMatchObject({ recordPresentation: { navigation } });
      expect(result.artifact.descriptor).toMatchObject({
        recordPresentation: { navigation },
      });
    }
    input.definition.navigation.tabs[0].sectionKeys.push("unknown");
    expect(() => parseSharedReferenceProduct(input)).toThrow();
  });
  it.each([
    [
      "studio",
      "430c50b88335d28d215465610679aa014214adf9f730dee2bc412efa7d91f6af",
    ],
    [
      "neon",
      "31469d475d5bdf07cfebb07a8cb82fdbe5c534f6ffe8b8fdf589b183471f8205",
    ],
    [
      "mesh",
      "33a83cb44cb0690820d4fbcc11d0fe52e83317ffa38de7cfc8e0eb88f2f40a56",
    ],
  ] as const)(
    "preserves the reviewed source candidate on %s",
    (plane, hash) => {
      // Reconstruct the historical shape, rather than rewriting its reviewed hash.
      const historical = source();
      delete historical.definition.ai;
      delete historical.definition.runtimeBindings;
      delete historical.definition.navigation;
      delete historical.definition.entityLabel;
      delete historical.definition.iconKey;
      const fallbackLabel = (value: string | { defaultText: string }) =>
        typeof value === "string" ? value : value.defaultText;
      historical.definition.title = fallbackLabel(historical.definition.title);
      for (const field of historical.definition.fields) {
        field.label = fallbackLabel(field.label);
        if (field.key === "status") {
          field.type = "string";
          delete field.choices;
          delete field.domainCode;
          delete field.semanticRole;
        }
      }
      for (const section of historical.definition.sections)
        section.label = fallbackLabel(section.label);
      const previous = capabilities();
      const comments = previous[0].binding,
        files = previous[1].binding;
      // Public is a newer source proposal, not part of this reviewed private-default baseline.
      comments.defaultAudience = "private";
      comments.actions = comments.actions.filter((a: { key: string }) =>
        ["read", "create", "update_own", "archive_own"].includes(a.key),
      );
      comments.maxDepth = 0;
      comments.reactionCodes = [];
      delete comments.draftRetentionDays;
      for (const key of Object.keys(comments.features))
        comments.features[key] = key === "edits";
      files.actions = files.actions.filter((a: { key: string }) =>
        ["read", "create", "finalize", "download", "archive"].includes(a.key),
      );
      files.folders = files.versioning = files.rename = false;
      files.processing = {
        preview: false,
        extraction: false,
        search: false,
        renditions: [],
      };
      const product = parseSharedReferenceProduct(historical, previous);
      const result = compileSharedReferenceProduct(product, plane);
      expect(result.artifact.descriptorHash).toBe(hash);
      expect(result.graph.fields).toHaveLength(22);
      expect(result.graph.operations.map((o) => o.operationKey)).toEqual([
        "list",
        "read",
      ]);
    },
  );
  it("compiles advanced source capabilities and optional provider summaries without inventing cards", () => {
    const input = source();
    expect(
      compileSharedReferenceProduct(
        parseSharedReferenceProduct(input, capabilities()),
        "neon",
      ).artifact.descriptor.recordPresentation,
    ).not.toHaveProperty("summaryView");
    input.definition.summaryView = {
      schemaVersion: 1,
      cards: [
        {
          key: "identity",
          label: "Identity",
          provider: "platform.record.identity.v1",
          rendererKey: "platform.record.identity.v1",
        },
      ],
    };
    for (const plane of ["studio", "neon", "mesh"] as const) {
      const compiled = compileSharedReferenceProduct(
        parseSharedReferenceProduct(input, capabilities()),
        plane,
      );
      expect(compiled.artifact.descriptor.recordPresentation).toHaveProperty(
        "summaryView",
        input.definition.summaryView,
      );
      expect(
        compiled.graph.capabilities?.find(
          (c) => c.capabilityKey === "attachments",
        )?.binding,
      ).toMatchObject({
        processing: { preview: true, extraction: true, search: true },
        scanRequired: true,
      });
    }
  });
  it("uses the same code for a different reference entity", () => {
    const input = source();
    input.definition.entityCode = "reference_example";
    input.definition.storageObject = "reference_example";
    const product = parseSharedReferenceProduct(input);
    expect(
      compileSharedReferenceProduct(product, "mesh").graph.entity.entityCode,
    ).toBe("reference_example");
  });
  it.each(["studio", "neon", "mesh"] as const)(
    "emits explicit callable bindings on %s without changing historical unbound graphs",
    (plane) => {
      const input = source();
      const result = compileSharedReferenceProduct(
        parseSharedReferenceProduct(input),
        plane,
      );
      expect(result.artifact.descriptor.authorizationRuntime).toEqual({
        schemaVersion: 1,
        runtimeVersion: "entity-authorization.v1",
        bindings: input.definition.runtimeBindings,
      });
      input.definition.runtimeBindings[0].resolver = "organization.record.v1";
      expect(() => parseSharedReferenceProduct(input)).toThrow(
        "META_ENTITY_GRAPH_INVALID",
      );
    },
  );
  it("rejects duplicate, incomplete and executable binding declarations", () => {
    const input = source();
    input.definition.runtimeBindings.pop();
    expect(() => parseSharedReferenceProduct(input)).toThrow();
    const duplicate = source();
    duplicate.definition.runtimeBindings[1] =
      duplicate.definition.runtimeBindings[0];
    expect(() => parseSharedReferenceProduct(duplicate)).toThrow();
    const executable = source();
    executable.definition.runtimeBindings[0].sql = "SELECT 1";
    expect(() => parseSharedReferenceProduct(executable)).toThrow();
  });
  it("rejects unrecognized keys, arbitrary SQL names and invalid targets", () => {
    const input = source();
    expect(() =>
      parseSharedReferenceProduct({ ...input, sql: "anything" }),
    ).toThrow();
    expect(() =>
      parseSharedReferenceProduct({ ...input, planes: ["production"] }),
    ).toThrow();
    input.definition.storageObject = "country; drop table x";
    expect(() => parseSharedReferenceProduct(input)).toThrow();
  });
  it("rejects mutable/wrong identity fields and duplicate declarations", () => {
    const input = source();
    input.definition.fields[0].type = "string";
    expect(() => parseSharedReferenceProduct(input)).toThrow(
      "IDENTITY_INVALID",
    );
    const duplicate = source();
    duplicate.definition.fields.push(duplicate.definition.fields[0]);
    expect(() => parseSharedReferenceProduct(duplicate)).toThrow();
    const writable = source();
    writable.definition.fields[0].writeMode = "generic";
    expect(() => parseSharedReferenceProduct(writable)).toThrow();
  });
  it("does not accept a capability owned by a different entity or permission namespace", () => {
    const members = capabilities();
    members[0].declaration.ownerEntityCode = "different";
    expect(() => parseSharedReferenceProduct(source(), members)).toThrow();
    const bad = capabilities();
    bad[0].binding.actions[0].permissionCode = "common.arbitrary.write";
    expect(() => parseSharedReferenceProduct(source(), bad)).toThrow();
  });
  it("revalidates changed caller objects and excluded targets", () => {
    const input = source();
    input.planes = ["neon"];
    const product = parseSharedReferenceProduct(input);
    expect(() => compileSharedReferenceProduct(product, "mesh")).toThrow(
      "TARGET_EXCLUDED",
    );
    (product.definition.fields[0] as { type: string }).type = "string";
    expect(() => compileSharedReferenceProduct(product, "neon")).toThrow(
      "IDENTITY_INVALID",
    );
  });
  it("enforces a closed dependency boundary for reference product authoring", () => {
    const path = new URL("../authoring/product.ts", import.meta.url);
    const content = readFileSync(path, "utf8");
    const file = ts.createSourceFile(
      path.pathname,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    const imports: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) {
          expect(ts.isStringLiteral(node.moduleSpecifier)).toBe(true);
          if (ts.isStringLiteral(node.moduleSpecifier))
            imports.push(node.moduleSpecifier.text);
        }
      }
      if (ts.isCallExpression(node))
        expect(
          node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) &&
              node.expression.text === "require"),
        ).toBe(false);
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(imports.sort()).toEqual(
      [
        "@athyper/contract-platform-entity-runtime",
        "@athyper/server-contract-meta-entity-authoring",
        "@athyper/server-contract-metadata",
        "./graph-builder.js",
        "./product-localization.js",
        "../deterministic.js",
      ].sort(),
    );
    expect(content).not.toMatch(/\b(country|currency|business_partner)\b/);
  });
});
