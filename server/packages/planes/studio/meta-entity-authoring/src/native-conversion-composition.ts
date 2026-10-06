import type { Transaction } from "kysely";
import {
  AuthoringPolicyError,
  type MetaEntityGraph,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  compileNativeRuntimeProjection,
  type NativeProjectionRegistration,
} from "@athyper/server-platform-metadata";
import { canonicalJson, sha256 } from "./deterministic.js";
import {
  prepareExpandedNativeGraphConversion,
  type NativeExpandedConversionContext,
  type NativeSupplementalConversionAdapter,
} from "./native-expanded-conversion.js";
import {
  type NativeConversionAdapters,
  type NativeNestedConversionAdapter,
} from "./native-graph-conversion.js";
import {
  compileNativeRelease,
  type NativeReleaseCompilationContext,
} from "./native-release-compilation.js";
import type { NativeAuthoringPolicy } from "./native-core-layout-persistence.js";
import type {
  NativeConversionApplicationInput,
  NativeConversionApplicationPolicy,
} from "./native-conversion-application.js";

type Tx = Transaction<Record<string, never>>;
/** Existing host composition supplies independently installed schema, catalogue,
 * security and provider evidence. No default grants, inferred pins or client
 * callbacks are installed here. This factory binds the actual shared conversion,
 * native compiler and runtime reader; it does not implement the evidence ports. */
export interface NativeConversionComposition {
  readonly host: NativeAuthoringPolicy;
  readonly maximumBytes: number;
  qualify(tx: Tx, input: NativeConversionApplicationInput): Promise<void>;
  conversion(
    tx: Tx,
    input: NativeConversionApplicationInput,
    source: MetaEntityGraph,
  ): Promise<{
    context: NativeExpandedConversionContext;
    adapters: NativeConversionAdapters;
    nested?: NativeNestedConversionAdapter;
    supplemental: NativeSupplementalConversionAdapter;
  }>;
  compiler(
    tx: Tx,
    graph: ExpandedNativeMetaEntityGraph,
  ): Promise<NativeReleaseCompilationContext>;
  reader(
    tx: Tx,
    graph: ExpandedNativeMetaEntityGraph,
  ): Promise<{
    registration: NativeProjectionRegistration;
    /** Independently registered storage location; consumer plane may differ. */
    storagePlane: "studio" | "neon" | "mesh";
    permissions: readonly { code: string; scopeKinds: readonly string[] }[];
  }>;
}
export function createNativeConversionApplicationPolicy(
  composition: NativeConversionComposition,
): NativeConversionApplicationPolicy {
  return {
    host: composition.host,
    maximumBytes: composition.maximumBytes,
    qualify: (tx, input) => composition.qualify(tx, input),
    async prepare(tx, input, source) {
      const resolved = await composition.conversion(
        tx,
        input,
        structuredClone(source),
      );
      const c = resolved.context;
      if (
        c.source.entityId !== input.entityId ||
        c.source.changeSetId !== input.changeSetId ||
        c.source.tenantId !== input.tenantId ||
        c.source.revision !== input.expectedRevision ||
        c.source.graphHash !== input.expectedSourceHash ||
        c.maximumBytes > composition.maximumBytes ||
        c.authoringSchemaHash !== composition.host.commands.authoringSchemaHash
      )
        throw new AuthoringPolicyError(
          "NATIVE_CONVERSION_COMPOSITION_MISMATCH",
          "Resolve the exact locked source and installed conversion manifest.",
        );
      return prepareExpandedNativeGraphConversion(
        source,
        c,
        resolved.adapters,
        resolved.nested,
        resolved.supplemental,
      );
    },
    async compile(tx, graph, operations) {
      return compileNativeRelease(
        graph,
        await composition.compiler(tx, structuredClone(graph)),
        operations,
      );
    },
    async verifyReader(tx, artifact, graph) {
      if (
        artifact.contractHash !== sha256(graph) ||
        artifact.descriptorHash !== sha256(artifact.descriptor)
      )
        throw new AuthoringPolicyError(
          "NATIVE_CONVERSION_COMPILER_EVIDENCE_INVALID",
          "Use the exact prepared native artifact.",
        );
      const resolved = await composition.reader(tx, structuredClone(graph));
      if (resolved.registration.entityCode !== graph.entity.entityCode)
        throw new AuthoringPolicyError(
          "NATIVE_CONVERSION_COMPOSITION_MISMATCH",
          "Reader registration must name the governed source.",
        );
      const context = await composition.compiler(tx, structuredClone(graph));
      if (
        artifact.descriptor.compilationContextHash !== sha256(context) ||
        context.graphHash !== sha256(graph)
      )
        throw new AuthoringPolicyError(
          "NATIVE_CONVERSION_COMPOSITION_MISMATCH",
          "Compiler resources changed before reader qualification.",
        );
      const runtime = graph.runtimeProfiles[0];
      if (!runtime)
        throw new AuthoringPolicyError(
          "NATIVE_CONVERSION_COMPOSITION_MISMATCH",
          "An explicit runtime profile is required.",
        );
      const identity = graph.fields.find((f) => f.id === runtime?.idFieldId);
      const key = context.core.identities.find(
        (i) =>
          i.id === identity?.fieldIdentityId &&
          i.entityId === graph.authoringSource.entityId &&
          i.tenantId === graph.authoringSource.tenantId,
      );
      if (!key || key.fieldKey !== resolved.registration.storage.idField)
        throw new AuthoringPolicyError(
          "NATIVE_CONVERSION_COMPOSITION_MISMATCH",
          "Preserve the authored technical identity in reader storage.",
        );
      if (
        resolved.registration.plane !== context.authorization.plane ||
        runtime?.storagePlane !== resolved.storagePlane ||
        runtime.storageSchema !== resolved.registration.storage.schema ||
        runtime.storageObject !== resolved.registration.storage.object ||
        resolved.registration.presentationDefaults !== undefined ||
        resolved.registration.fieldPresentationDefaults !== undefined
      )
        throw new AuthoringPolicyError(
          "NATIVE_CONVERSION_COMPOSITION_MISMATCH",
          "Reference reader requires exact native storage and presentation.",
        );
      // Storage authorization remains the installed reader/qualification port's
      // responsibility. This is positive parser/projection evidence, not F6/F8.
      const descriptor = compileNativeRuntimeProjection({
        native: artifact.descriptor,
        registration: resolved.registration,
        permissions: resolved.permissions,
      });
      if (
        canonicalJson(Reflect.get(descriptor, "recordPresentation")) !==
        canonicalJson(artifact.descriptor.recordPresentation)
      )
        throw new AuthoringPolicyError(
          "NATIVE_CONVERSION_READER_MISMATCH",
          "The shared reader must retain exact authored navigation/presentation.",
        );
    },
  };
}
