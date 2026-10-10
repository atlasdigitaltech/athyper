import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalJson,
  sha256,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { nativeReleaseFixture } from "../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js";
import {
  createNativeBootstrapProposalReader,
  createNativeBootstrapProposalResolver,
} from "./native-bootstrap-proposals.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function setup(
  edit?: (
    entry: Record<string, unknown>,
    document: Record<string, unknown>,
  ) => void,
) {
  const root = await mkdtemp(join(tmpdir(), "native-proposal-"));
  roots.push(root);
  const { graph } = nativeReleaseFixture();
  const input = {
    entityId: graph.authoringSource.entityId,
    changeSetId: graph.ownedLabels!.changeSetId,
    tenantId: null,
    actorId: "00000000-0000-4000-8000-000000000077",
    proposalHash: sha256(graph),
    idempotencyKey: "bootstrap-test-001",
  };
  const document: Record<string, unknown> = {
    schema: "entity.native-bootstrap-proposal/1",
    title: "Reference",
    branchCode: "native",
    baseReleaseId: null,
    registration: {
      moduleCode: "rel",
      entityCode: graph.entity.entityCode,
      entityClass: "reference",
      ownershipModel: "system",
    },
    graph,
  };
  const entry: Record<string, unknown> = {
    entityId: input.entityId,
    changeSetId: input.changeSetId,
    authorId: input.actorId,
    proposalHash: input.proposalHash,
    documentHash: sha256(document),
    file: "proposal.json",
  };
  edit?.(entry, document);
  const manifest = {
    schema: "entity.native-bootstrap-proposals/1",
    proposals: [entry],
  };
  await writeFile(join(root, "manifest.json"), canonicalJson(manifest));
  await writeFile(join(root, "proposal.json"), canonicalJson(document));
  const config = {
    root,
    manifest: "manifest.json",
    manifestHash: sha256(manifest),
    maximumBytes: 1024 * 1024,
  };
  return {
    root,
    input,
    document,
    manifest,
    config,
    read: createNativeBootstrapProposalReader(config),
  };
}
it("reads the exact author/coordinate-bound native proposal without granting resource authority", async () => {
  const f = await setup();
  const result = await f.read(f.input);
  expect(result.graph).toEqual(f.document.graph);
  expect(Object.keys(result).sort()).toEqual([
    "baseReleaseId",
    "branchCode",
    "graph",
    "registration",
    "title",
  ]);
  result.title = "mutated";
  expect((await f.read(f.input)).title).toBe("Reference");
});
it.each(["actorId", "changeSetId", "entityId", "proposalHash"] as const)(
  "rejects changed %s",
  async (key) => {
    const f = await setup();
    await expect(
      f.read({
        ...f.input,
        [key]:
          key === "proposalHash"
            ? "f".repeat(64)
            : "00000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow("NATIVE_BOOTSTRAP_PROPOSAL_UNAVAILABLE");
  },
);
it("rejects changed manifest and proposal metadata on later reads", async () => {
  const f = await setup();
  await f.read(f.input);
  await writeFile(
    join(f.root, "proposal.json"),
    canonicalJson({ ...f.document, title: "changed" }),
  );
  await expect(f.read(f.input)).rejects.toThrow(
    "NATIVE_BOOTSTRAP_PROPOSAL_UNAVAILABLE",
  );
  await writeFile(
    join(f.root, "manifest.json"),
    canonicalJson({ ...f.manifest, proposals: [] }),
  );
  await expect(f.read(f.input)).rejects.toThrow(
    "NATIVE_BOOTSTRAP_PROPOSAL_UNAVAILABLE",
  );
});
it("rejects envelope authority injection even when the document pin is supplied", async () => {
  const f = await setup((entry, document) => {
    document.compiler = {};
    entry.documentHash = sha256(document);
  });
  await expect(f.read(f.input)).rejects.toThrow(
    "NATIVE_BOOTSTRAP_PROPOSAL_UNAVAILABLE",
  );
});
it("rejects traversal, escaping symlinks and byte overflow", async () => {
  const f = await setup((entry) => {
    entry.file = "../outside.json";
  });
  await expect(f.read(f.input)).rejects.toThrow(
    "NATIVE_BOOTSTRAP_PROPOSAL_UNAVAILABLE",
  );
  const g = await setup();
  await rm(join(g.root, "proposal.json"));
  await symlink(join(f.root, "proposal.json"), join(g.root, "proposal.json"));
  await expect(g.read(g.input)).rejects.toThrow(
    "NATIVE_BOOTSTRAP_PROPOSAL_UNAVAILABLE",
  );
  await expect(
    createNativeBootstrapProposalReader({ ...g.config, maximumBytes: 8 })(
      g.input,
    ),
  ).rejects.toThrow("NATIVE_BOOTSTRAP_PROPOSAL_UNAVAILABLE");
});
it("rejects ambiguous proposal pins", async () => {
  const f = await setup();
  f.manifest.proposals.push(f.manifest.proposals[0]!);
  await writeFile(join(f.root, "manifest.json"), canonicalJson(f.manifest));
  await expect(
    createNativeBootstrapProposalReader({
      ...f.config,
      manifestHash: sha256(f.manifest),
    })(f.input),
  ).rejects.toThrow("NATIVE_BOOTSTRAP_PROPOSAL_UNAVAILABLE");
});
it("resolves resources only for the admitted author and rechecks files during qualification and prepare", async () => {
  const f = await setup();
  type Options = Parameters<typeof createNativeBootstrapProposalResolver>[0];
  const tx = { isTransaction: true } as Parameters<
    Options["resolveResources"]
  >[0];
  const context = { principalId: f.input.actorId } as Parameters<
    Options["resolveResources"]
  >[1];
  const qualify = vi.fn();
  const resolveResources = vi.fn().mockResolvedValue({
    schema: {},
    host: {},
    qualify,
    preparation: { reader: {}, compiler: {}, operations: {} },
  });
  const resolver = createNativeBootstrapProposalResolver({
    readProposal: f.read,
    maximumBytes: 1024 * 1024,
    resolveResources,
    audit: vi.fn(),
  });
  await expect(
    resolver.resolve(tx, { ...context, principalId: "other" }, f.input),
  ).rejects.toThrow();
  expect(resolveResources).not.toHaveBeenCalled();
  await expect(
    resolver.resolveRootRegistration(context, f.input),
  ).resolves.toEqual(f.document.registration);
  const { policy } = await resolver.resolve(tx, context, f.input);
  await policy.qualify(tx, f.input);
  expect(qualify).toHaveBeenCalledOnce();
  expect((await policy.prepare(tx, f.input)).graph).toEqual(f.document.graph);
  await expect(
    policy.prepare({ ...tx } as typeof tx, f.input),
  ).rejects.toThrow();
  await writeFile(
    join(f.root, "proposal.json"),
    canonicalJson({ ...f.document, title: "tampered" }),
  );
  await expect(policy.qualify(tx, f.input)).rejects.toThrow();
  await expect(policy.prepare(tx, f.input)).rejects.toThrow();
});
