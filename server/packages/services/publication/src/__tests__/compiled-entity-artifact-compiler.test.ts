import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { compileCompiledEntityArtifacts, compiledEntityRuntimeProjection } from "../compiled-entity-artifact-compiler.js";

const canonicalizer = {
  canonicalBytes(value: unknown) {
    return Buffer.from(JSON.stringify(normalize(value)), "utf8");
  },
  sha256(value: Uint8Array) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
  },
};
const registry = {
  handlers: new Set(["neon.example.read.v1"]),
  renderers: new Set(["platform.record-section.v1"]),
  resolvers: new Set<string>(),
  evaluators: new Set<string>(),
};
const artifact = (content: Record<string, unknown>, ref: string) => ({ ref, content });
const base = (artifactType: string, artifactKey: string, entityCode = "example") => ({
  schema: "athyper.compiled-entity-artifact/2.0-draft",
  schemaVersion: 2,
  contractStatus: "draft_for_review",
  artifactType,
  artifactKey,
  entityCode,
  plane: "neon",
  dependencies: [],
});
const release = {
  content: {
    schema: "athyper.compiled-entity-release/2.0-draft",
    contractStatus: "unsigned_review_only",
    releaseId: "example-review-release",
    releaseNo: 1,
    targetPlanes: ["neon"],
    externalDependencies: [],
  },
};

describe("compiled entity artifact compiler", () => {
  it("generates a deterministic immutable artifact and release set", () => {
    const input = {
      canonicalizer,
      registry,
      release,
      artifacts: [
        artifact({ ...base("core", "example/core"), fields: [{ key: "id" }] }, "example/core.json"),
        artifact({ ...base("operation", "example/operation"), operations: [{ key: "read", execution: { handlerKey: "neon.example.read.v1" } }] }, "example/operation.json"),
        artifact({ ...base("presentation_section", "example/presentation.section.overview"), dependencies: ["example/core"], sectionKey: "overview", coreRef: "example/core.json", rendererKey: "platform.record-section.v1", fieldBindings: [{ fieldKey: "id" }] }, "example/presentation.section.overview.json"),
      ],
    };
    const first = compileCompiledEntityArtifacts(input);
    const second = compileCompiledEntityArtifacts(input);
    expect(first.releaseDocument).toEqual(second.releaseDocument);
    expect(first.artifacts.map((item) => item.artifact.artifactHash)).toEqual(
      second.artifacts.map((item) => item.artifact.artifactHash),
    );
    expect(first.report.artifactKeys).toEqual([
      "example/core",
      "example/operation",
      "example/presentation.section.overview",
    ]);
    expect(compiledEntityRuntimeProjection(first, "2026-09-19T00:00:00.000Z", "example")).toMatchObject({
      entityCode: "example",
      release: first.release,
      artifacts: first.artifacts.map((item) => item.artifact),
    });
  });

  it("rejects a required reference that does not resolve", () => {
    expect(() => compileCompiledEntityArtifacts({
      canonicalizer,
      registry,
      release,
      artifacts: [artifact({ ...base("core", "example/core"), dependencies: ["missing/core"], fields: [] }, "example/core.json")],
    })).toThrowError(/Missing dependency/);
  });

  it("rebuilds the complete BP review package deterministically from hash-free authoring input", async () => {
    const root = new URL(
      "../../../../../../metadata/products/mdg/entities/",
      import.meta.url,
    );
    const paths = await jsonPaths(root);
    const documents = await Promise.all(paths.map(async (path) => ({
      path,
      value: JSON.parse((await readFile(new URL(path, root))).toString("utf8")) as Record<string, unknown>,
    })));
    const artifactDocuments = documents.filter(({ value }) =>
      ["core", "operation", "presentation_surface", "presentation_section", "flow"].includes(String(value.artifactType)),
    );
    const registryCatalog = JSON.parse(await readFile(new URL("../review/registry-catalog.json", root), "utf8"));
    const registryEntries = registryCatalog.entries as readonly { kind: string; key: string }[];
    const releaseDocument = documents.find(({ path }) => path === "business_partner/release.json")!.value;
    const result = compileCompiledEntityArtifacts({
      canonicalizer,
      registry: {
        permissions: new Set(registryEntries.filter((entry) => entry.kind === "permission").map((entry) => entry.key)),
        handlers: new Set(registryEntries.filter((entry) => entry.kind === "handler").map((entry) => entry.key)),
        renderers: new Set(registryEntries.filter((entry) => entry.kind === "renderer").map((entry) => entry.key)),
        resolvers: new Set(registryEntries.filter((entry) => entry.kind === "resolver").map((entry) => entry.key)),
        evaluators: new Set(registryEntries.filter((entry) => entry.kind === "evaluator").map((entry) => entry.key)),
      },
      artifacts: artifactDocuments.map(({ path, value }) => {
        const { artifactHash: _hash, ...content } = value;
        return { ref: path, content };
      }),
      release: { content: without(releaseDocument, ["artifacts", "releaseHash"]) },
    });
    const repeated = compileCompiledEntityArtifacts({
      canonicalizer,
      registry: {
        permissions: new Set(registryEntries.filter((entry) => entry.kind === "permission").map((entry) => entry.key)),
        handlers: new Set(registryEntries.filter((entry) => entry.kind === "handler").map((entry) => entry.key)),
        renderers: new Set(registryEntries.filter((entry) => entry.kind === "renderer").map((entry) => entry.key)),
        resolvers: new Set(registryEntries.filter((entry) => entry.kind === "resolver").map((entry) => entry.key)),
        evaluators: new Set(registryEntries.filter((entry) => entry.kind === "evaluator").map((entry) => entry.key)),
      },
      artifacts: artifactDocuments.map(({ path, value }) => {
        const { artifactHash: _hash, ...content } = value;
        return { ref: path, content };
      }),
      release: { content: without(releaseDocument, ["artifacts", "releaseHash"]) },
    });
    expect(result.artifacts).toHaveLength(artifactDocuments.length);
    expect(result.releaseDocument).toEqual(repeated.releaseDocument);
    expect(result.artifacts.map((item) => item.artifact.artifactHash)).toEqual(
      repeated.artifacts.map((item) => item.artifact.artifactHash),
    );
  });
});

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]));
}
function without(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}
async function jsonPaths(root: URL, prefix = ""): Promise<string[]> {
  const entries = await readdir(new URL(prefix, root), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory() ? jsonPaths(root, `${path}/`) : entry.isFile() && path.endsWith(".json") ? [path] : [];
  }));
  return nested.flat();
}
