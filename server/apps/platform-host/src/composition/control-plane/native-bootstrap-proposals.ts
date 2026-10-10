import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  AuthoringPolicyError,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  canonicalJson,
  sha256,
  type NativeBootstrapInput,
  type NativeRootRegistration,
  type NativeBootstrapPolicy,
  type ProductReferenceEnrollmentOptions,
} from "@athyper/server-plane-studio-meta-entity-authoring";

type Resolver = NonNullable<
  ProductReferenceEnrollmentOptions["nativeBootstrap"]
>;
type Tx = Parameters<Resolver["resolve"]>[0];
type Prepared = Awaited<ReturnType<NativeBootstrapPolicy["prepare"]>>;
export type NativeBootstrapProposal = Pick<
  Prepared,
  "graph" | "title" | "branchCode" | "baseReleaseId"
> & { readonly registration?: NativeRootRegistration };
const hash = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail = (): never => {
  throw new AuthoringPolicyError(
    "NATIVE_BOOTSTRAP_PROPOSAL_UNAVAILABLE",
    "NATIVE_BOOTSTRAP_PROPOSAL_UNAVAILABLE: the exact installed proposal is unavailable.",
  );
};
function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== [...keys].sort().join()
  )
    return fail();
  return value as Record<string, unknown>;
}
/** Immutable import inputs, not an alternate authoring database. The admitted
 * command alone writes canonical rows; files contain neither authority nor
 * compiler/provider/initializer evidence. Re-read even for idempotent replay. */
export function createNativeBootstrapProposalReader(options: {
  root: string;
  manifest: string;
  manifestHash: string;
  maximumBytes: number;
}) {
  const config = { ...options };
  if (
    !isAbsolute(config.root) ||
    !hash.test(config.manifestHash) ||
    !Number.isSafeInteger(config.maximumBytes) ||
    config.maximumBytes < 1 ||
    config.maximumBytes > 16 * 1024 * 1024
  )
    fail();
  async function read(path: string): Promise<unknown> {
    if (!path || isAbsolute(path) || path.split(/[\\/]/).includes("..")) fail();
    const root = await realpath(config.root),
      file = await realpath(resolve(root, path));
    const child = relative(root, file);
    if (
      !child ||
      child === ".." ||
      child.startsWith(".." + sep) ||
      isAbsolute(child)
    )
      fail();
    const info = await stat(file);
    if (!info.isFile() || info.size > config.maximumBytes) fail();
    const bytes = await readFile(file);
    if (bytes.length > config.maximumBytes) fail();
    return JSON.parse(bytes.toString("utf8"));
  }
  return async (
    input: NativeBootstrapInput,
  ): Promise<NativeBootstrapProposal> => {
    if (
      input.tenantId !== null ||
      ![input.entityId, input.changeSetId, input.actorId].every((v) =>
        uuid.test(v),
      ) ||
      !hash.test(input.proposalHash)
    )
      fail();
    const manifest = object(await read(config.manifest), [
      "schema",
      "proposals",
    ]);
    if (
      sha256(manifest) !== config.manifestHash ||
      manifest.schema !== "entity.native-bootstrap-proposals/1" ||
      !Array.isArray(manifest.proposals) ||
      !manifest.proposals.length ||
      manifest.proposals.length > 256
    )
      fail();
    const entries = (manifest.proposals as unknown[]).map((entry) =>
      object(entry, [
        "entityId",
        "changeSetId",
        "authorId",
        "proposalHash",
        "documentHash",
        "file",
      ]),
    );
    const coordinates = new Set<string>();
    for (const entry of entries) {
      if (
        ![entry.entityId, entry.changeSetId, entry.authorId].every(
          (v) => typeof v === "string" && uuid.test(v),
        ) ||
        ![entry.proposalHash, entry.documentHash].every(
          (v) => typeof v === "string" && hash.test(v),
        ) ||
        typeof entry.file !== "string"
      )
        fail();
      const key = canonicalJson([entry.changeSetId, entry.proposalHash]);
      if (coordinates.has(key)) fail();
      coordinates.add(key);
    }
    const matches = entries.filter(
      (e) =>
        e.entityId === input.entityId &&
        e.changeSetId === input.changeSetId &&
        e.authorId === input.actorId &&
        e.proposalHash === input.proposalHash,
    );
    if (matches.length !== 1) fail();
    const entry = matches[0]!;
    const rawDocument = await read(entry.file as string);
    const documentKeys = [
      "schema",
      "title",
      "branchCode",
      "baseReleaseId",
      "graph",
    ];
    if (
      rawDocument &&
      typeof rawDocument === "object" &&
      !Array.isArray(rawDocument) &&
      Object.prototype.hasOwnProperty.call(rawDocument, "registration")
    )
      documentKeys.push("registration");
    const document = object(rawDocument, documentKeys);
    if (
      sha256(document) !== entry.documentHash ||
      document.schema !== "entity.native-bootstrap-proposal/1" ||
      typeof document.title !== "string" ||
      !document.title.trim() ||
      document.title.length > 200 ||
      typeof document.branchCode !== "string" ||
      !/^[a-z][a-z0-9_.-]{0,126}$/.test(document.branchCode) ||
      (document.baseReleaseId !== null &&
        (typeof document.baseReleaseId !== "string" ||
          !uuid.test(document.baseReleaseId)))
    )
      fail();
    const graph = document.graph as ExpandedNativeMetaEntityGraph;
    if (
      !graph ||
      graph.contractSchema !== "athyper.meta-entity-contract/2.5" ||
      sha256(graph) !== input.proposalHash ||
      graph.authoringSource?.entityId !== input.entityId ||
      graph.authoringSource?.tenantId !== null ||
      graph.authoringSource?.sourceKind !== "product" ||
      graph.ownedLabels?.changeSetId !== input.changeSetId
    )
      fail();
    const registration = document.registration;
    if (registration !== undefined) {
      const value = object(registration, [
        "moduleCode",
        "entityCode",
        "entityClass",
        "ownershipModel",
      ]);
      if (
        typeof value.moduleCode !== "string" ||
        !/^[a-z][a-z0-9_.-]{1,62}$/.test(value.moduleCode) ||
        value.entityCode !== graph.entity.entityCode ||
        typeof value.entityClass !== "string" ||
        ![
          "business",
          "configuration",
          "reference",
          "process",
          "projection",
          "technical",
        ].includes(value.entityClass) ||
        value.ownershipModel !== "system"
      )
        fail();
    } else if (document.baseReleaseId === null) fail();
    // Complete typed semantics, resource closure and exact SQL readback remain
    // the canonical bootstrap compiler/repository's responsibility.
    return structuredClone({
      graph,
      title: document.title as string,
      branchCode: document.branchCode as string,
      baseReleaseId: document.baseReleaseId as string | null,
      ...(registration
        ? { registration: registration as NativeRootRegistration }
        : {}),
    });
  };
}

/** Connects immutable proposal input to the existing admitted bootstrap route.
 * All authority/schema/resource resolution stays in trusted host composition.
 * Without those installed resolvers the endpoint must remain unconfigured. */
export function createNativeBootstrapProposalResolver(options: {
  readProposal: ReturnType<typeof createNativeBootstrapProposalReader>;
  maximumBytes: number;
  resolveResources(
    tx: Tx,
    context: VerifiedRequestContext,
    input: NativeBootstrapInput,
    proposal: NativeBootstrapProposal,
  ): Promise<{
    schema: Awaited<ReturnType<Resolver["resolve"]>>["schema"];
    host: NativeBootstrapPolicy["host"];
    qualify: NativeBootstrapPolicy["qualify"];
    preparation: Omit<Prepared, keyof NativeBootstrapProposal>;
  }>;
  audit: NativeBootstrapPolicy["audit"];
}): Resolver {
  if (
    !options.readProposal ||
    !options.resolveResources ||
    !options.audit ||
    !Number.isSafeInteger(options.maximumBytes) ||
    options.maximumBytes < 1
  )
    fail();
  return {
    async resolveRootRegistration(context, input) {
      if (context.principalId !== input.actorId || input.tenantId !== null)
        fail();
      const proposal = await options.readProposal(structuredClone(input));
      if (!proposal.registration || proposal.baseReleaseId !== null) fail();
      return structuredClone(proposal.registration) as NativeRootRegistration;
    },
    async resolve(tx, context, input) {
      if (
        !tx.isTransaction ||
        context.principalId !== input.actorId ||
        input.tenantId !== null
      )
        fail();
      const captured = structuredClone(input);
      const proposal = await options.readProposal(captured);
      const resources = await options.resolveResources(
        tx,
        context,
        captured,
        structuredClone(proposal),
      );
      if (!resources.host || !resources.qualify || !resources.schema) fail();
      return {
        schema: resources.schema,
        policy: {
          host: resources.host,
          maximumBytes: options.maximumBytes,
          async qualify(transaction, command) {
            if (
              transaction !== tx ||
              canonicalJson(command) !== canonicalJson(captured)
            )
              fail();
            await options.readProposal(command);
            await resources.qualify(transaction, command);
          },
          async prepare(transaction, command) {
            if (
              transaction !== tx ||
              canonicalJson(command) !== canonicalJson(captured)
            )
              fail();
            const current = await options.readProposal(command);
            if (sha256(current) !== sha256(proposal)) fail();
            return { ...resources.preparation, ...current };
          },
          audit: options.audit,
        },
      };
    },
  };
}
