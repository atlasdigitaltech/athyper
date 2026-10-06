import { createHash } from "node:crypto";
import {
  authorizeEntityOperation,
  type Authorizer,
  type VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import {
  validateEntityLiveReadContractV1,
  validateEntityResourcePinV1,
  validateEntitySecurityManifestV1,
  validateEntityStorageAuthorityV1,
  type EntityEffectiveReadResultV1,
  type EntityReadUseV1,
  type EntityPermissionRequirementV1,
  type EntityResourcePinV1,
  type EntityRuntimeDescriptor,
  type EntitySecurityManifestV1,
  type EntitySourceIdentityV1,
} from "@athyper/server-contract-metadata";
import { RecordServiceError } from "./errors.js";

/** This port must be supplied by the existing publication/security composition.
 * Administrative inspection, draft metadata and caller payloads cannot implement
 * installed evidence. The lock lasts through the supplied repository callback. */
export interface EntityLiveReadEvidencePort<Transaction> {
  withLockedEvidence<Result>(
    input: {
      readonly context: VerifiedRequestContext;
      readonly descriptor: EntityRuntimeDescriptor;
      readonly transaction: Transaction;
    },
    work: (evidence: EntityLockedReadEvidence<Transaction>) => Promise<Result>,
  ): Promise<Result>;
}
export interface EntityLockedReadEvidence<Transaction> {
  readonly generation: string;
  readonly caller: {
    readonly tenantId: string;
    readonly plane: string;
    readonly principalId: string;
    readonly authEpoch: number;
    readonly authorizationFingerprint: string;
  };
  /** Must verify signature/trust, local installation, scope and revocation under
   * the acquired active-head locks. Content hash is independently checked here. */
  installed(
    pin: EntityResourcePinV1,
    transaction: Transaction,
  ): Promise<unknown | null>;
  currentSecurity(
    entityId: string,
    transaction: Transaction,
  ): Promise<{
    readonly pin: EntityResourcePinV1;
    readonly manifest: unknown;
  } | null>;
  /** Resolve the exact immutable compiled source and verify complete security
   * coverage/compiler qualification. Runtime hash stays in installation evidence,
   * outside the pinned resources, avoiding a descriptor/manifest hash cycle. */
  securityDescriptor(
    manifest: EntitySecurityManifestV1,
    transaction: Transaction,
  ): Promise<EntityRuntimeDescriptor | null>;
  providerSupported(
    pin: EntityResourcePinV1,
    descriptor: EntityRuntimeDescriptor,
    transaction: Transaction,
  ): Promise<boolean>;
  permissionSupported(
    requirement: Extract<EntityPermissionRequirementV1, { state: "defined" }>,
    transaction: Transaction,
  ): Promise<boolean>;
  maskSupported(
    pin: EntityResourcePinV1,
    transaction: Transaction,
  ): Promise<boolean>;
  mask(
    pin: EntityResourcePinV1,
    value: unknown,
    transaction: Transaction,
  ): Promise<unknown>;
}
export interface EntityEffectiveReadRequest {
  readonly context: VerifiedRequestContext;
  readonly descriptor: EntityRuntimeDescriptor;
  readonly operationKey: string;
  readonly fields: readonly {
    readonly key: string;
    readonly use: EntityReadUseV1;
  }[];
  readonly recordId?: string;
}
const uses = new Set<EntityReadUseV1>([
  "read",
  "search",
  "filter",
  "sort",
  "group",
  "export",
  "condition",
]);
const block = (code: string): EntityEffectiveReadResultV1 => ({
  state: "blocked_dependency",
  code,
});
const rebind = (code: string): EntityEffectiveReadResultV1 => ({
  state: "rebind_required",
  code,
});
const deny = (code: string): EntityEffectiveReadResultV1 => ({
  state: "denied",
  code,
});
function canonical(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length)
      throw new TypeError("LIVE_RESOURCE_JSON_INVALID");
    return value.map(canonical);
  }
  if (
    value &&
    typeof value === "object" &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => [key, canonical(value)]),
    );
  throw new TypeError("LIVE_RESOURCE_JSON_INVALID");
}
/** Versioned resource content comparator: entity.live-resource-json/1. Array
 * order and null/absence remain significant; this is not a release signature. */
export function entityLiveResourceHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export function entityReadAuthorizationFingerprint(
  context: VerifiedRequestContext,
): string {
  return entityLiveResourceHash({
    principalId: context.principalId,
    tenantId: context.tenantId,
    plane: context.planeKey,
    authEpoch: context.authEpoch,
    principalFingerprint: context.permissions.principalFingerprint,
    profileHash: context.permissions.profileHash,
    schemaHash: context.permissions.schemaHash,
  });
}
function sameSource(
  left: EntitySourceIdentityV1,
  right: EntitySourceIdentityV1,
): boolean {
  return (
    left.entityId === right.entityId &&
    left.releaseId === right.releaseId &&
    left.contractHash === right.contractHash &&
    left.tenantId === right.tenantId
  );
}
function samePin(
  left: EntityResourcePinV1,
  right: EntityResourcePinV1,
): boolean {
  return (
    left.owner === right.owner &&
    left.namespace === right.namespace &&
    left.key === right.key &&
    left.version === right.version &&
    left.hash === right.hash
  );
}
/** Composes independently installed restrictions and calls the existing Entity
 * authorizer for every pinned/current/storage-owner operation. It grants no
 * permission itself. v1 rejects scope grammars and controls it cannot enforce. */
export async function resolveEntityEffectiveRead<Transaction>(
  request: EntityEffectiveReadRequest,
  evidence: EntityLockedReadEvidence<Transaction>,
  transaction: Transaction,
  authorizer: Authorizer,
): Promise<EntityEffectiveReadResultV1> {
  try {
    const context = request.context;
    const descriptor = structuredClone(request.descriptor);
    const contract = descriptor.liveReadContract;
    if (
      !contract ||
      descriptor.schema !== "athyper.entity-runtime-descriptor/1.1"
    )
      return block("LIVE_READ_CONTRACT_REQUIRED");
    validateEntityLiveReadContractV1(contract);
    const requestedSource = contract.source;
    if (!authorizer.authorizeEntityOperation)
      return block("LIVE_READ_AUTHORIZER_REQUIRED");
    if (
      !evidence.generation ||
      evidence.caller.tenantId !== context.tenantId ||
      evidence.caller.plane !== context.planeKey ||
      evidence.caller.principalId !== context.principalId ||
      evidence.caller.authEpoch !== context.authEpoch ||
      evidence.caller.authorizationFingerprint !==
        entityReadAuthorizationFingerprint(context) ||
      context.permissions.tenantId !== context.tenantId ||
      context.permissions.planeKey !== context.planeKey ||
      context.permissions.principalId !== context.principalId
    )
      return block("LIVE_READ_CALLER_GENERATION_MISMATCH");
    if (
      descriptor.planeKey !== context.planeKey ||
      contract.source.releaseId !== descriptor.releaseId ||
      contract.source.contractHash !== descriptor.contractHash ||
      (contract.source.tenantId !== null &&
        contract.source.tenantId !== context.tenantId)
    )
      return rebind("LIVE_READ_SOURCE_MISMATCH");
    if (
      !request.operationKey ||
      request.fields.length > 512 ||
      request.fields.some((field) => !uses.has(field.use))
    )
      return deny("LIVE_READ_SELECTION_INVALID");
    const dependencies: EntityResourcePinV1[] = [];
    async function installed(
      pin: EntityResourcePinV1,
    ): Promise<unknown | null> {
      validateEntityResourcePinV1(pin);
      const installedValue = await evidence.installed(pin, transaction);
      const value =
        installedValue == null ? null : structuredClone(installedValue);
      if (
        value === null ||
        value === undefined ||
        entityLiveResourceHash(value) !== pin.hash
      )
        return null;
      if (!dependencies.some((prior) => samePin(prior, pin)))
        dependencies.push(pin);
      return value;
    }
    const pinnedRaw = await installed(contract.security);
    if (!pinnedRaw) return block("LIVE_READ_SECURITY_NOT_INSTALLED");
    validateEntitySecurityManifestV1(pinnedRaw);
    const pinned = pinnedRaw;
    if (
      pinned.entityCode !== descriptor.entityCode ||
      !sameSource(pinned.source, contract.source)
    )
      return rebind("LIVE_READ_SECURITY_SOURCE_MISMATCH");
    const authorityRaw = await installed(contract.storageAuthority);
    if (!authorityRaw) return block("STORAGE_AUTHORITY_NOT_INSTALLED");
    validateEntityStorageAuthorityV1(authorityRaw);
    const authority = authorityRaw;
    if (
      !sameSource(authority.source, contract.source) ||
      authority.plane !== context.planeKey ||
      authority.tenantId !== context.tenantId ||
      authority.storage.schema !== descriptor.storage.schema ||
      authority.storage.object !== descriptor.storage.object
    )
      return rebind("STORAGE_AUTHORITY_BINDING_MISMATCH");
    if (
      !(await installed(authority.storage.provider)) ||
      !(await evidence.providerSupported(
        authority.storage.provider,
        descriptor,
        transaction,
      ))
    )
      return block("STORAGE_PROVIDER_NOT_INSTALLED");
    const output = new Map<
      string,
      {
        key: string;
        identityId: string;
        representation: "plain" | "masked";
        mask: EntityResourcePinV1 | null;
      }
    >();
    const selected: { identityId: string; use: EntityReadUseV1 }[] = [];
    for (const selection of request.fields) {
      const field = pinned.fields.find((field) => field.key === selection.key);
      if (!field || !descriptor.fields.some((row) => row.key === field.key))
        return rebind("LIVE_READ_FIELD_IDENTITY_UNMAPPED");
      selected.push({ identityId: field.identityId, use: selection.use });
      output.set(field.identityId, {
        key: field.key,
        identityId: field.identityId,
        representation: "plain",
        mask: null,
      });
    }
    const operation = pinned.operations.find(
      (operation) => operation.key === request.operationKey,
    );
    if (!operation) return rebind("LIVE_READ_OPERATION_IDENTITY_UNMAPPED");
    async function current(
      source: EntitySourceIdentityV1,
    ): Promise<EntitySecurityManifestV1 | null> {
      const result = await evidence.currentSecurity(
        source.entityId,
        transaction,
      );
      if (!result) return null;
      validateEntityResourcePinV1(result.pin);
      const raw = await installed(result.pin);
      if (
        !raw ||
        entityLiveResourceHash(raw) !== entityLiveResourceHash(result.manifest)
      )
        return null;
      validateEntitySecurityManifestV1(raw);
      if (
        raw.source.entityId !== source.entityId ||
        raw.source.tenantId !== source.tenantId
      )
        return null;
      return raw;
    }
    const active = await current(pinned.source);
    if (!active) return block("CURRENT_SECURITY_NOT_INSTALLED");
    async function apply(
      manifest: EntitySecurityManifestV1,
      expected: EntitySecurityManifestV1,
      operationId: string,
      selections: readonly {
        identityId: string;
        use: EntityReadUseV1;
        outputIdentityId?: string;
      }[],
    ): Promise<EntityEffectiveReadResultV1 | null> {
      if (
        manifest.plane !== context.planeKey ||
        manifest.scope.tenantId !== context.tenantId ||
        (manifest.source.tenantId !== null &&
          manifest.source.tenantId !== context.tenantId)
      )
        return deny("LIVE_READ_SCOPE_MISMATCH");
      if (manifest.unsupportedControls.length)
        return block("LIVE_READ_CONTROL_NOT_SUPPORTED");
      const installedDescriptor = await evidence.securityDescriptor(
        manifest,
        transaction,
      );
      if (
        !installedDescriptor ||
        installedDescriptor.entityCode !== manifest.entityCode ||
        installedDescriptor.releaseId !== manifest.source.releaseId ||
        installedDescriptor.contractHash !== manifest.source.contractHash ||
        installedDescriptor.planeKey !== context.planeKey ||
        !/^[0-9a-f]{64}$/.test(installedDescriptor.compiledHash) ||
        installedDescriptor.liveReadContract?.source.entityId !==
          manifest.source.entityId ||
        (sameSource(manifest.source, requestedSource) &&
          installedDescriptor.compiledHash !== descriptor.compiledHash)
      )
        return block("LIVE_READ_SECURITY_COVERAGE_NOT_QUALIFIED");
      // The bounded v1 supports direct same-object projections only. A view,
      // join or different record identity needs registered record-scope lineage;
      // field aliases alone cannot map an addressed owner record safely.
      if (
        installedDescriptor.storage.schema !== descriptor.storage.schema ||
        installedDescriptor.storage.object !== descriptor.storage.object ||
        installedDescriptor.storage.idField !== descriptor.storage.idField
      )
        return block("STORAGE_OWNER_PROJECTION_NOT_SUPPORTED");
      if (
        installedDescriptor.ownerAccess ||
        installedDescriptor.directoryScope ||
        installedDescriptor.collectionRelationship ||
        installedDescriptor.recordPredicates?.length ||
        installedDescriptor.policyBindings?.length ||
        (installedDescriptor.authorization &&
          (installedDescriptor.authorization.ownership !== "tenant.record.v1" ||
            installedDescriptor.authorization.directory.population !==
              "tenant"))
      )
        return block("LIVE_READ_CONTROL_NOT_SUPPORTED");
      if (
        manifest.fields.length !== installedDescriptor.fields.length ||
        manifest.fields.some(
          (field) =>
            !installedDescriptor.fields.some((row) => row.key === field.key),
        )
      )
        return block("LIVE_READ_SECURITY_COVERAGE_NOT_QUALIFIED");
      const op = manifest.operations.find(
        (operation) => operation.identityId === operationId,
      );
      if (
        !op ||
        expected.operations.find(
          (operation) => operation.identityId === operationId,
        )?.semanticHash !== op.semanticHash
      )
        return rebind("LIVE_READ_OPERATION_IDENTITY_UNMAPPED");
      const needed = new Set([op.identityId]);
      for (const selection of selections) {
        const field = manifest.fields.find(
          (field) => field.identityId === selection.identityId,
        );
        if (
          !field ||
          expected.fields.find((row) => row.identityId === selection.identityId)
            ?.semanticHash !== field.semanticHash
        )
          return rebind("LIVE_READ_FIELD_IDENTITY_UNMAPPED");
        if (field.representation === "omitted")
          return deny("LIVE_READ_FIELD_OMITTED");
        if (
          selection.use !== "read" &&
          !field.queryUses.includes(selection.use)
        )
          return deny("LIVE_READ_FIELD_USE_DENIED");
        // A query/condition over a raw masked value is an inference channel.
        // No disclosure-safe masked query adapter is qualified in this v1.
        if (
          field.representation === "masked" &&
          selection.use !== "read" &&
          selection.use !== "export"
        )
          return deny("LIVE_READ_MASKED_ORACLE_DENIED");
        const publishedField = installedDescriptor.fields.find(
          (row) => row.key === field.key,
        )!;
        const publishedPolicy =
          installedDescriptor.authorization?.fieldPolicies.find((policy) =>
            policy.fields.includes(field.key),
          );
        if (
          publishedPolicy?.representation === "masked" &&
          field.representation !== "masked"
        )
          return block("LIVE_READ_SECURITY_COVERAGE_NOT_QUALIFIED");
        if (
          selection.use !== "read" &&
          publishedPolicy &&
          !publishedPolicy.queryUses.some((use) => use === selection.use)
        )
          return deny("LIVE_READ_FIELD_USE_DENIED");
        if (publishedField.readPermissionCode !== undefined) {
          const readOperation = manifest.operations.find(
            (operation) => operation.identityId === field.readOperationId,
          )!;
          const fieldDecision = await authorizer.authorize({
            context,
            permissionCode: publishedField.readPermissionCode,
            resource: {
              tenantId: context.tenantId,
              entityCode: manifest.entityCode,
              operationKey: readOperation.key,
              field: publishedField.key,
              entityFieldPermission: "read",
              authorizationDescriptorHash: installedDescriptor.compiledHash,
              ...(request.recordId ? { recordId: request.recordId } : {}),
            },
          });
          if (!fieldDecision.allowed)
            return deny("LIVE_READ_FIELD_PERMISSION_DENIED");
          if (
            fieldDecision.scope &&
            (!fieldDecision.scope.tenantWide ||
              fieldDecision.scope.visibility !== "all")
          )
            return block("LIVE_READ_SCOPE_MEET_NOT_SUPPORTED");
        }
        needed.add(field.readOperationId);
        const presentation = output.get(
          selection.outputIdentityId ?? field.identityId,
        )!;
        if (field.representation === "masked") {
          const mask = field.mask!;
          if (
            !(await installed(mask)) ||
            !(await evidence.maskSupported(mask, transaction))
          )
            return block("LIVE_READ_MASK_NOT_INSTALLED");
          if (presentation.mask && !samePin(presentation.mask, mask))
            return rebind("LIVE_READ_MASK_MEET_NOT_SUPPORTED");
          presentation.representation = "masked";
          presentation.mask = mask;
        }
      }
      for (const id of needed) {
        const operation = manifest.operations.find(
          (operation) => operation.identityId === id,
        )!;
        if (operation.target === "existing" && !request.recordId)
          return block("LIVE_READ_RECORD_SCOPE_REQUIRED");
        const previousOperation = expected.operations.find(
          (row) => row.identityId === id,
        );
        if (
          previousOperation &&
          previousOperation.semanticHash !== operation.semanticHash
        )
          return rebind("LIVE_READ_OPERATION_IDENTITY_UNMAPPED");
        const requirement = operation.requirement;
        const publishedOperation =
          installedDescriptor.authorization?.operations.find(
            (row) => row.key === operation.key,
          ) ?? installedDescriptor.operations[operation.key];
        if (
          !publishedOperation ||
          publishedOperation.permissionCode !==
            (requirement.state === "defined" ? requirement.code : undefined)
        )
          return block("LIVE_READ_PERMISSION_SOURCE_MISMATCH");
        if (
          "target" in publishedOperation &&
          publishedOperation.target !== operation.target
        )
          return block("LIVE_READ_CONTROL_NOT_SUPPORTED");
        if (requirement.state === "defined") {
          const catalogue = await installed(requirement.catalogue);
          if (
            !catalogue ||
            !(await evidence.permissionSupported(requirement, transaction))
          )
            return block("LIVE_READ_PERMISSION_CATALOGUE_INVALID");
        }
        const decision = await authorizeEntityOperation(authorizer, {
          context,
          permissionCode:
            requirement.state === "defined" ? requirement.code : undefined,
          resource: {
            tenantId: context.tenantId,
            entityCode: manifest.entityCode,
            operationKey: operation.key,
            operationIdentityId: operation.identityId,
            sourceEntityId: manifest.source.entityId,
            sourceReleaseId: manifest.source.releaseId,
            sourceContractHash: manifest.source.contractHash,
            authorizationDescriptorHash: installedDescriptor.compiledHash,
            securityGeneration: evidence.generation,
            ...(request.recordId ? { recordId: request.recordId } : {}),
          },
        });
        if (!decision.allowed) return deny("LIVE_READ_OPERATION_DENIED");
        if (
          decision.scope &&
          (!decision.scope.tenantWide || decision.scope.visibility !== "all")
        )
          return block("LIVE_READ_SCOPE_MEET_NOT_SUPPORTED");
      }
      return null;
    }
    for (const manifest of [pinned, active]) {
      const failed = await apply(
        manifest,
        pinned,
        operation.identityId,
        selected,
      );
      if (failed) return failed;
    }
    for (const owner of authority.owners) {
      const raw = await installed(owner.security);
      if (!raw) return block("STORAGE_OWNER_SECURITY_NOT_INSTALLED");
      validateEntitySecurityManifestV1(raw);
      if (!sameSource(raw.source, owner.source))
        return rebind("STORAGE_OWNER_SOURCE_MISMATCH");
      const ownerActive = await current(owner.source);
      if (!ownerActive)
        return block("STORAGE_OWNER_CURRENT_SECURITY_NOT_INSTALLED");
      for (const mapping of owner.fields) {
        const field = pinned.fields.find(
          (field) => field.identityId === mapping.fieldIdentityId,
        );
        const contributor = raw.fields.find(
          (field) => field.identityId === mapping.ownerFieldIdentityId,
        );
        if (
          !field ||
          !contributor ||
          field.semanticHash !== contributor.semanticHash
        )
          return rebind("STORAGE_FIELD_SEMANTICS_UNMAPPED");
      }
      const ownerFields = selected.flatMap((selection) =>
        owner.fields
          .filter((field) => field.fieldIdentityId === selection.identityId)
          .map((field) => ({
            identityId: field.ownerFieldIdentityId,
            use: selection.use,
            outputIdentityId: selection.identityId,
          })),
      );
      for (const manifest of [raw, ownerActive]) {
        const failed = await apply(
          manifest,
          raw,
          owner.readOperationId,
          ownerFields,
        );
        if (failed) return failed;
      }
    }
    if (
      selected.some(
        (selection) =>
          !authority.owners.some((owner) =>
            owner.fields.some(
              (field) => field.fieldIdentityId === selection.identityId,
            ),
          ),
      )
    )
      return rebind("STORAGE_FIELD_LINEAGE_UNMAPPED");
    return {
      state: "resolved",
      generation: evidence.generation,
      dependencies: Object.freeze(dependencies),
      fields: Object.freeze(
        [...output.values()].map((field) => Object.freeze(field)),
      ),
    };
  } catch {
    return block("LIVE_READ_EVIDENCE_INVALID");
  }
}

/** Runs resolution, provider reads and mask serialization under the same local
 * head locks. Legacy descriptors use their existing admission, never fabricated
 * live evidence. A new contract without an installed adapter fails closed. */
export async function withEntityEffectiveRead<Transaction, Result>(options: {
  readonly request: EntityEffectiveReadRequest;
  readonly transaction: Transaction;
  readonly authorizer: Authorizer;
  readonly evidence?: EntityLiveReadEvidencePort<Transaction>;
  readonly read: () => Promise<Result>;
  readonly project: (
    result: Result,
    fields: Extract<
      EntityEffectiveReadResultV1,
      { state: "resolved" }
    >["fields"],
    mask: (pin: EntityResourcePinV1, value: unknown) => Promise<unknown>,
  ) => Promise<Result>;
}): Promise<Result> {
  if (!options.request.descriptor.liveReadContract) {
    if (
      options.request.descriptor.schema !==
      "athyper.entity-runtime-descriptor/1.0"
    )
      throw new RecordServiceError(
        409,
        "LIVE_READ_CONTRACT_REQUIRED",
        "This descriptor version requires a live-read contract",
      );
    return options.read();
  }
  if (
    options.request.descriptor.schema !==
    "athyper.entity-runtime-descriptor/1.1"
  )
    throw new RecordServiceError(
      409,
      "ENTITY_LIVE_READ_SCHEMA_TRANSITION_REQUIRED",
      "Live-read pins require the registered descriptor version",
    );
  if (!options.evidence)
    throw new RecordServiceError(
      503,
      "ENTITY_LIVE_READ_EVIDENCE_REQUIRED",
      "Installed live-read evidence is unavailable",
    );
  return options.evidence.withLockedEvidence(
    {
      context: options.request.context,
      descriptor: options.request.descriptor,
      transaction: options.transaction,
    },
    async (evidence) => {
      const resolved = await resolveEntityEffectiveRead(
        options.request,
        evidence,
        options.transaction,
        options.authorizer,
      );
      if (resolved.state !== "resolved")
        throw new RecordServiceError(
          resolved.state === "denied" ? 403 : 409,
          resolved.code,
          "Live read could not be qualified",
        );
      return options.project(
        await options.read(),
        resolved.fields,
        (pin, value) => evidence.mask(pin, value, options.transaction),
      );
    },
  );
}
