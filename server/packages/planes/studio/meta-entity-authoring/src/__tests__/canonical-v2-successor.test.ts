import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { compileGraph, validateGraph } from "../deterministic.js";
import { compileAuthorizationSuccessorDescriptor } from "../authorization-successor.js";
const read = (path: string) =>
  JSON.parse(
    readFileSync(
      new URL("../../../../../../../" + path, import.meta.url),
      "utf8",
    ),
  );
const graph = read(
  "governance/policy/reviews/business-partner-canonical-v2-native-graph.dev.json",
);
const proposal = read(
  "governance/policy/reviews/business-partner-canonical-v2-native.proposal.dev.json",
);
const source = read(
  "governance/policy/reports/business-partner-combined-source.dev.json",
).source;
it("compiles the exact reviewed 17-read design without losing Atlas or the 42 native operations", () => {
  expect(validateGraph(graph).issues).toEqual([]);
  const native = compileGraph(graph);
  expect(native.contractHash).toBe(proposal.nativeCompilerContractHash);
  const output = compileAuthorizationSuccessorDescriptor({
    nativeDescriptor: native.descriptor,
    predecessor: {
      releaseId: source.publication_release_id,
      releaseNo: Number(source.release_no),
      publicationKey: source.release_key,
      descriptor: source.descriptor,
      authoredContract: source.authored_contract,
    },
    proposedDescriptor: proposal.descriptor,
  });
  expect(output.authorizationRuntime.schemaVersion).toBe(2);
  expect(
    output.authorizationRuntime.canonicalReadAdmission.transitions,
  ).toHaveLength(17);
  expect(output.ai).toEqual(source.descriptor.ai);
  expect(graph.operations).toHaveLength(42);
});
it("rejects source-plan drift during native compilation", () => {
  const changed = structuredClone(graph);
  const surface = changed.surfaces.find(
    (s: any) => s.layoutConfig?.authorizationRuntime,
  );
  surface.layoutConfig.authorizationRuntime.canonicalReadAdmission.transitions[0].targetPermissionCode =
    "unreviewed.permission";
  expect(() => compileGraph(changed)).toThrow();
});
