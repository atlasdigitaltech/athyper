import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { nativeReleaseFixture } from "../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js";
import { createNativeBootstrapProposalReader } from "./native-bootstrap-proposals.js";
import { buildNativeBootstrapProposalBundle } from "./native-bootstrap-bundle.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
function fixture() {
  const { graph } = nativeReleaseFixture();
  const second = JSON.parse(
    JSON.stringify(graph).replaceAll(
      "00000000-0000-7000-8000-",
      "11111111-0000-7000-8000-",
    ),
  );
  second.entity.entityCode = "second_reference";
  const authorId = "00000000-0000-4000-8000-000000000077";
  return {
    maximumBytes: 1024 * 1024,
    maximumMembers: 10000,
    proposals: [graph, second].map((graph) => ({
      authorId,
      proposal: {
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
      },
    })),
  };
}
it("constructs complete two-proposal input read back by the existing production reader", async () => {
  const input = fixture();
  const original = structuredClone(input);
  const bundle = buildNativeBootstrapProposalBundle(input);
  const root = await mkdtemp(join(tmpdir(), "native-bundle-"));
  roots.push(root);
  for (const [name, content] of Object.entries(bundle.files))
    await writeFile(join(root, name), content, { flag: "wx", mode: 0o600 });
  const read = createNativeBootstrapProposalReader({
    root,
    manifest: "manifest.json",
    manifestHash: bundle.manifestHash,
    maximumBytes: input.maximumBytes,
  });
  for (const command of bundle.commands) {
    const selected = input.proposals.find(
      (p) => p.proposal.graph.authoringSource.entityId === command.entityId,
    )!;
    expect(
      await read({ ...command, actorId: selected.authorId, tenantId: null }),
    ).toEqual(selected.proposal);
  }
  expect(input).toEqual(original);
  expect(
    buildNativeBootstrapProposalBundle({
      ...input,
      proposals: [...input.proposals].reverse(),
    }).manifestHash,
  ).toBe(bundle.manifestHash);
  expect(buildNativeBootstrapProposalBundle(input).commands).toEqual(
    bundle.commands,
  );
});
it("rejects duplicate draft/entity selections", () => {
  const input = fixture();
  input.proposals[1] = input.proposals[0]!;
  expect(() => buildNativeBootstrapProposalBundle(input)).toThrow(
    "BUNDLE_INVALID",
  );
});
it("rejects dangling local references rather than producing an installable-looking manifest", () => {
  const input = fixture();
  input.proposals[0]!.proposal.graph.fields.pop();
  expect(() => buildNativeBootstrapProposalBundle(input)).toThrow();
});
it("rejects partial typed rows and changed ownership", () => {
  const input = fixture();
  input.proposals[0]!.proposal.graph.fields[0]!.dataType = null as never;
  expect(() => buildNativeBootstrapProposalBundle(input)).toThrow();
  const other = fixture();
  other.proposals[0]!.proposal.graph.authoringSource.tenantId =
    other.proposals[0]!.authorId;
  expect(() => buildNativeBootstrapProposalBundle(other)).toThrow();
});
it("rejects extra resource authority and protected controls in authoring input", () => {
  const input = fixture();
  Object.assign(input.proposals[0]!.proposal, { compiler: {} });
  expect(() => buildNativeBootstrapProposalBundle(input)).toThrow(
    "BUNDLE_INVALID",
  );
  const other = fixture();
  Object.assign(other.proposals[0]!.proposal.graph.operations[0]!, {
    requiresMfa: false,
  });
  expect(() => buildNativeBootstrapProposalBundle(other)).toThrow();
});
it.each([
  { maximumMembers: 1 },
  { maximumBytes: 32 },
  { maximumBytes: 0 },
  { maximumMembers: 100001 },
])("enforces bundle budgets %j", (limits) => {
  expect(() =>
    buildNativeBootstrapProposalBundle({ ...fixture(), ...limits }),
  ).toThrow();
});
it("changes the document pin for title edits while preserving graph hash", () => {
  const input = fixture();
  const before = buildNativeBootstrapProposalBundle(input);
  input.proposals[0]!.proposal.title = "Another title";
  const after = buildNativeBootstrapProposalBundle(input);
  expect(after.manifestHash).not.toBe(before.manifestHash);
  expect(after.commands[0]!.proposalHash).toBe(
    before.commands[0]!.proposalHash,
  );
  expect(after.commands[0]!.idempotencyKey).not.toBe(
    before.commands[0]!.idempotencyKey,
  );
});

it("runs the real construction command without overwriting an existing bundle", async () => {
  const input = fixture();
  const root = await mkdtemp(join(tmpdir(), "native-bundle-cli-"));
  roots.push(root);
  const path = join(root, "input.json"),
    output = join(root, "out");
  await writeFile(path, JSON.stringify(input));
  const script = fileURLToPath(
    new URL(
      "../../../scripts/operations/build-native-bootstrap-proposals.ts",
      import.meta.url,
    ),
  );
  const args = ["exec", "tsx", script, path, output];
  const result = await promisify(execFile)("pnpm", args);
  const receipt = JSON.parse(result.stdout);
  expect(receipt.manifestHash).toBe(
    buildNativeBootstrapProposalBundle(input).manifestHash,
  );
  const read = createNativeBootstrapProposalReader({
    ...receipt,
    maximumBytes: input.maximumBytes,
  });
  expect(
    (
      await read({
        ...receipt.commands[0],
        actorId: input.proposals[0]!.authorId,
        tenantId: null,
      })
    ).graph,
  ).toEqual(input.proposals[0]!.proposal.graph);
  await expect(promisify(execFile)("pnpm", args)).rejects.toThrow();
  expect(
    (
      await read({
        ...receipt.commands[0],
        actorId: input.proposals[0]!.authorId,
        tenantId: null,
      })
    ).graph,
  ).toEqual(input.proposals[0]!.proposal.graph);
}, 15000);
