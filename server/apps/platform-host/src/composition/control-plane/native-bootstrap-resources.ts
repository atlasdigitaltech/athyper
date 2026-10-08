import type { createNativeBootstrapComponents } from "./native-bootstrap-components.js";
import type { createNativeBootstrapProposalResolver } from "./native-bootstrap-proposals.js";
import {
  canonicalJson,
  sha256,
} from "@athyper/server-plane-studio-meta-entity-authoring";

type Resolve = Parameters<
  typeof createNativeBootstrapProposalResolver
>[0]["resolveResources"];
type Arguments = Parameters<Resolve>;

/** Assembles the existing compiler, schema, host and approved initializer in the
 * admitted transaction. The base resolver remains responsible for independently
 * installed non-component resources; proposal files supply none of that authority.
 * Canonical schema qualification is enforced by the product-command executor.
 */
export function createNativeBootstrapResourceComposition(options: {
  resolve: Resolve;
  components: ReturnType<typeof createNativeBootstrapComponents>;
  scope(...args: Arguments): Promise<{
    tenantId: null;
    plane: "studio";
    hostReleaseHash: string;
  }>;
}): Resolve {
  return async (tx, context, input, proposal) => {
    const captured = structuredClone(input);
    const capturedContext = structuredClone(context);
    const capturedProposal = structuredClone(proposal);
    const fail = (): never => {
      throw Error("NATIVE_BOOTSTRAP_RESOURCE_COMPOSITION_CHANGED");
    };
    if (
      !tx.isTransaction ||
      context.principalId !== input.actorId ||
      input.tenantId !== null ||
      sha256(proposal.graph) !== input.proposalHash
    )
      fail();
    async function assemble() {
      const args: Arguments = [
        tx,
        structuredClone(capturedContext),
        structuredClone(captured),
        structuredClone(capturedProposal),
      ];
      const resolved = await options.resolve(...args);
      const scope = await options.scope(...args);
      const { compiler } = resolved.preparation;
      if (
        scope.tenantId !== null ||
        scope.plane !== "studio" ||
        !/^[a-f0-9]{64}$/.test(scope.hostReleaseHash) ||
        compiler.graphHash !== captured.proposalHash ||
        compiler.authoringSchemaHash !==
          resolved.host.commands.authoringSchemaHash ||
        !resolved.host.snapshotVersions?.includes(2) ||
        !resolved.preparation.operations ||
        !resolved.schema
      )
        fail();
      const resources = await options.components(
        tx,
        structuredClone(capturedProposal.graph),
        scope,
      );
      return {
        ...resolved,
        bootstrapScope: structuredClone(scope),
        schema: structuredClone(resolved.schema),
        preparation: {
          ...resolved.preparation,
          reader: structuredClone(resolved.preparation.reader),
          identitySources: structuredClone(
            resolved.preparation.identitySources,
          ),
          compiler: structuredClone({
            ...compiler,
            core: { ...compiler.core, components: resources.coreComponents },
            layout: {
              ...compiler.layout,
              components: resources.layoutComponents,
            },
            components: resources.runtimeComponents,
            componentResourceEvidence: resources.evidence,
          }),
        },
      };
    }
    const assembled = await assemble();
    // Functions are installed capabilities, not serializable evidence. Their
    // own admission/initializer readers still execute in the canonical writer.
    function evidence(value: Awaited<ReturnType<typeof assemble>>) {
      return sha256({
        scope: value.bootstrapScope,
        schema: value.schema,
        commands: value.host.commands,
        snapshotVersions: value.host.snapshotVersions,
        compiler: value.preparation.compiler,
        reader: value.preparation.reader,
        identitySources: value.preparation.identitySources ?? [],
        identityMode: value.preparation.identityMode ?? "installed",
      });
    }
    const expected = evidence(assembled);
    return {
      ...assembled,
      async qualify(transaction, command) {
        if (
          transaction !== tx ||
          canonicalJson(command) !== canonicalJson(captured)
        )
          fail();
        await assembled.qualify(transaction, command);
        const current = await assemble();
        if (evidence(current) !== expected) fail();
        // Re-resolved owner checks can observe revocation even when content pins
        // are unchanged. Never substitute the old callback for current admission.
        await current.qualify(transaction, command);
      },
    };
  };
}
