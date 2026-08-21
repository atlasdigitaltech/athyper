import { createHash } from "node:crypto";
import { z } from "zod";

import {
  MetaEntityContractV21Schema,
  canonicalMetaEntityContractV21Json,
  canonicalizeMetaEntityContractV21,
  type MetaEntityContractV21,
} from "@athyper/api-contracts/meta-entity-contract-v21";

export type ContractApplicationMode =
  | "get"
  | "validate"
  | "diff"
  | "create-draft"
  | "patch-owner"
  | "apply-to-draft"
  | "export"
  | "dry-run"
  | "submit"
  | "publish"
  | "reject"
  | "rollback";

export interface ContractVersionState {
  versionId: string;
  entityCode: string;
  tenantId: string | null;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "EFFECTIVE" | "SUPERSEDED" | "ARCHIVED" | "REJECTED" | "WITHDRAWN";
  contractSchemaVersion: string | null;
  contractHash: string | null;
  lockVersion: number;
  submittedBy: string | null;
}

/**
 * Environment references exist only during projection. They are deliberately
 * separate from MetaEntityContractV21 so release artifacts cannot serialize
 * deployment-specific UUIDs.
 */
export interface ResolvedContractReferences {
  moduleId: string;
  entityId: string;
  companyCodeIds: ReadonlyMap<string, string>;
  permissionCodes: ReadonlySet<string>;
  handlerTargets: ReadonlySet<string>;
  targetEntityIds: ReadonlyMap<string, string>;
}

export interface ContractProjectionPlan {
  versionId: string;
  entityCode: string;
  tenantId: string | null;
  canonicalContract: MetaEntityContractV21;
  canonicalJson: string;
  contractHash: string;
  references: ResolvedContractReferences;
  counts: Readonly<Record<
    "fields" | "relations" | "surfaces" | "surfaceBindings" | "operations"
    | "actionRules" | "numberingConfigurations" | "lifecycleStates"
    | "lifecycleTransitions" | "flows" | "flowSteps" | "flowSections" | "flowFields",
    number
  >>;
}

export interface CompiledPlaneArtifact {
  plane: "admin" | "neon" | "mesh";
  compiledJson: Readonly<Record<string, unknown>>;
  compiledHash: string;
}

export interface ContractApplicationTransaction {
  readVersionForUpdate(versionId: string): Promise<ContractVersionState | null>;
  resolveReferences(
    version: ContractVersionState,
    contract: MetaEntityContractV21,
  ): Promise<ResolvedContractReferences>;
  validateProjection(plan: ContractProjectionPlan): Promise<readonly ContractDiagnostic[]>;
  applyProjection(plan: ContractProjectionPlan, actorId: string): Promise<void>;
  persistCanonicalDocument(
    versionId: string,
    canonicalContract: MetaEntityContractV21,
    contractHash: string,
    expectedLockVersion: number,
    actorId: string,
  ): Promise<number>;
  readCanonicalContractForUpdate(versionId: string): Promise<unknown | null>;
  readCurrentPublishedContract(versionId: string): Promise<unknown | null>;
  compileVersion(versionId: string): Promise<unknown>;
  submit(input: {
    versionId: string;
    actorId: string;
    contractHash: string;
    requestKey: string | null;
  }): Promise<void>;
  reject(input: {
    versionId: string;
    actorId: string;
    contractHash: string;
    reason: string;
    requestKey: string | null;
  }): Promise<void>;
  createDraft(input: {
    entityCode: string;
    tenantId: string | null;
    actorId: string;
    changeType: "structural" | "behavioral" | "governance" | "label" | "fix";
    changeSummary: string | null;
    baseVersionId: string | null;
  }): Promise<ContractVersionState>;
  publish(input: {
    versionId: string;
    actorId: string;
    breakGlassReason: string | null;
    breakGlassTicket: string | null;
    contractHash: string;
    materializedHash: string;
    artifacts: readonly CompiledPlaneArtifact[];
    diff: readonly ContractDiffEntry[];
    requestKey: string | null;
    transition: "approved" | "rollback_published";
    sourceVersionId: string | null;
  }): Promise<void>;
  isPublishedReady(versionId: string, contractHash: string): Promise<boolean>;
  createRollbackVersion(input: {
    sourceVersionId: string;
    actorId: string;
    requestKey: string | null;
  }): Promise<ContractVersionState>;
}

export interface ContractApplicationRepository {
  transaction<T>(work: (transaction: ContractApplicationTransaction) => Promise<T>): Promise<T>;
  readVersion(versionId: string): Promise<ContractVersionState | null>;
  exportCanonicalContract(versionId: string): Promise<{
    contract: unknown;
    version: ContractVersionState;
  } | null>;
}

export interface ContractDiagnostic {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface ContractDiffEntry {
  path: string;
  kind: "added" | "removed" | "changed";
  before?: unknown;
  after?: unknown;
}

export interface ContractApplicationResult {
  mode: ContractApplicationMode;
  valid: boolean;
  noOp?: boolean;
  versionId?: string;
  versionStatus?: ContractVersionState["status"];
  lockVersion?: number;
  contractHash?: string;
  contract?: MetaEntityContractV21;
  diagnostics: readonly ContractDiagnostic[];
  diff?: readonly ContractDiffEntry[];
  plan?: ContractProjectionPlan;
  artifacts?: readonly CompiledPlaneArtifact[];
}

export type ContractApplicationRequest =
  | { mode: "get"; versionId: string }
  | { mode: "validate"; contract: unknown }
  | { mode: "diff"; before: unknown; after: unknown }
  | {
      mode: "patch-owner";
      versionId: string;
      actorId: string;
      owner: keyof MetaEntityContractV21;
      value: unknown;
      /** Client's last observed document, used only to report concurrent server paths. */
      baseContract?: unknown;
      ifMatch: string;
      expectedLockVersion: number;
      requestKey?: string | null;
    }
  | {
      mode: "create-draft";
      entityCode: string;
      tenantId: string | null;
      actorId: string;
      changeType: "structural" | "behavioral" | "governance" | "label" | "fix";
      changeSummary?: string | null;
      baseVersionId?: string | null;
    }
  | {
      mode: "submit";
      versionId: string;
      actorId: string;
      ifMatch: string;
      expectedLockVersion: number;
      requestKey?: string | null;
    }
  | {
      mode: "apply-to-draft";
      versionId: string;
      actorId: string;
      contract: unknown;
      ifMatch: string;
      expectedLockVersion: number;
    }
  | { mode: "export"; versionId: string }
  | {
      mode: "dry-run";
      versionId: string;
      contract: unknown;
      ifMatch: string;
      expectedLockVersion: number;
    }
  | {
      mode: "publish";
      versionId: string;
      actorId: string;
      ifMatch: string;
      expectedLockVersion: number;
      breakGlassReason?: string | null;
      breakGlassTicket?: string | null;
      requestKey?: string | null;
    }
  | {
      mode: "reject";
      versionId: string;
      actorId: string;
      ifMatch: string;
      expectedLockVersion: number;
      reason: string;
      requestKey?: string | null;
    }
  | {
      mode: "rollback";
      sourceVersionId: string;
      actorId: string;
      requestKey?: string | null;
    };

function hashCanonicalJson(canonicalJson: string): string {
  return createHash("sha256").update(canonicalJson).digest("hex");
}

export function metaEntityContractV21Hash(input: unknown): string {
  return hashCanonicalJson(canonicalMetaEntityContractV21Json(input));
}

function canonicalUnknownJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalUnknownJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalUnknownJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function compilePlaneArtifacts(
  compiled: unknown,
  contract: MetaEntityContractV21,
  contractHash: string,
): readonly CompiledPlaneArtifact[] {
  const source = record(compiled);
  if (!source) {
    throw new ContractApplicationError(
      "CONTRACT_COMPILE_INVALID",
      "Compiler did not return an object descriptor.",
      422,
    );
  }
  return (["admin", "neon", "mesh"] as const).map((plane) => {
    const planeContract = {
      ...contract,
      operations: contract.operations.filter((operation) =>
        operation.plane_filter === null || operation.plane_filter.includes(plane)),
    };
    const descriptor: Record<string, unknown> = {
      ...source,
      plane_key: plane,
      available: contract.catalog.plane_eligibility.includes(plane),
      contract_hash: contractHash,
      contract_v21: planeContract,
      operations: planeContract.operations,
    };
    delete descriptor["compiled_hash"];
    const compiledHash = hashCanonicalJson(canonicalUnknownJson(descriptor));
    return {
      plane,
      compiledJson: { ...descriptor, compiled_hash: compiledHash },
      compiledHash,
    };
  });
}

function zodDiagnostics(error: z.ZodError): ContractDiagnostic[] {
  return error.issues.map((issue) => ({
    severity: "error",
    code: "CONTRACT_SCHEMA_INVALID",
    path: `/${issue.path.map(String).join("/")}`,
    message: issue.message,
  }));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function patchOwnerValue(current: unknown, input: unknown): unknown {
  const envelope = record(input);
  const patches = envelope?.["patch"];
  if (!Array.isArray(patches)) return input;
  const cloned = structuredClone(current);
  for (const rawPatch of patches) {
    const patch = record(rawPatch);
    const path = typeof patch?.["path"] === "string" ? patch["path"] : "";
    if (!path.startsWith("/") || path === "/") {
      throw new ContractApplicationError(
        "OWNER_PATCH_PATH_INVALID",
        "Owner patch paths must be non-root JSON Pointers.",
        422,
      );
    }
    const segments = path.slice(1).split("/").map((segment) =>
      segment.replaceAll("~1", "/").replaceAll("~0", "~"));
    let target: unknown = cloned;
    for (const segment of segments.slice(0, -1)) {
      if (Array.isArray(target)) {
        const index = Number(segment);
        if (!Number.isInteger(index) || index < 0 || index >= target.length) {
          throw new ContractApplicationError("OWNER_PATCH_PATH_INVALID", `Array path '${path}' does not resolve.`, 422);
        }
        target = target[index];
      } else {
        const object = record(target);
        if (!object || !(segment in object)) {
          throw new ContractApplicationError("OWNER_PATCH_PATH_INVALID", `Object path '${path}' does not resolve.`, 422);
        }
        target = object[segment];
      }
    }
    const leaf = segments.at(-1)!;
    if (Array.isArray(target)) {
      const index = Number(leaf);
      if (!Number.isInteger(index) || index < 0 || index >= target.length) {
        throw new ContractApplicationError("OWNER_PATCH_PATH_INVALID", `Array path '${path}' does not resolve.`, 422);
      }
      target[index] = patch?.["value"];
    } else {
      const object = record(target);
      if (!object) {
        throw new ContractApplicationError("OWNER_PATCH_PATH_INVALID", `Object path '${path}' does not resolve.`, 422);
      }
      object[leaf] = patch?.["value"];
    }
  }
  return cloned;
}

function diffValues(before: unknown, after: unknown, path = ""): ContractDiffEntry[] {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const entries: ContractDiffEntry[] = [];
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      const childPath = `${path}/${index}`;
      if (index >= before.length) entries.push({ path: childPath, kind: "added", after: after[index] });
      else if (index >= after.length) entries.push({ path: childPath, kind: "removed", before: before[index] });
      else entries.push(...diffValues(before[index], after[index], childPath));
    }
    return entries;
  }
  const beforeRecord = record(before);
  const afterRecord = record(after);
  if (beforeRecord && afterRecord) {
    const entries: ContractDiffEntry[] = [];
    for (const key of [...new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])].sort()) {
      const childPath = `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      if (!(key in beforeRecord)) entries.push({ path: childPath, kind: "added", after: afterRecord[key] });
      else if (!(key in afterRecord)) entries.push({ path: childPath, kind: "removed", before: beforeRecord[key] });
      else entries.push(...diffValues(beforeRecord[key], afterRecord[key], childPath));
    }
    return entries;
  }
  return [{ path: path || "/", kind: "changed", before, after }];
}

function projectionCounts(contract: MetaEntityContractV21): ContractProjectionPlan["counts"] {
  return {
    fields: contract.fields.length,
    relations: contract.relations.length,
    surfaces: contract.surfaces.length,
    surfaceBindings: contract.surfaces.reduce((total, surface) => total + surface.bindings.length, 0),
    operations: contract.operations.length,
    actionRules: contract.operations.reduce((total, operation) => total + operation.action_rules.length, 0),
    numberingConfigurations: contract.numbering.configurations.length,
    lifecycleStates: contract.lifecycle?.states.length ?? 0,
    lifecycleTransitions: contract.lifecycle?.transitions.length ?? 0,
    flows: contract.flows.length,
    flowSteps: contract.flows.reduce((total, flow) => total + flow.steps.length, 0),
    flowSections: contract.flows.reduce((total, flow) =>
      total + flow.steps.reduce((stepTotal, step) => stepTotal + step.sections.length, 0), 0),
    flowFields: contract.flows.reduce((total, flow) =>
      total + flow.steps.reduce((stepTotal, step) => stepTotal + step.fields.length, 0), 0),
  };
}

function normalizeEtag(value: string): string {
  return value.trim().replace(/^W\//, "").replace(/^"/, "").replace(/"$/, "");
}

function assertDraftPrecondition(
  version: ContractVersionState,
  ifMatch: string,
  expectedLockVersion: number,
): void {
  if (version.status !== "DRAFT") {
    throw new ContractApplicationError(
      "DRAFT_REQUIRED",
      `Version '${version.versionId}' is ${version.status}; only DRAFT may be projected.`,
      409,
    );
  }
  if (!Number.isInteger(expectedLockVersion) || expectedLockVersion < 0) {
    throw new ContractApplicationError("LOCK_VERSION_REQUIRED", "A valid expected lock version is required.", 428);
  }
  const expectedHash = normalizeEtag(ifMatch);
  const currentHash = version.contractHash ?? "*";
  if (expectedHash !== currentHash || expectedLockVersion !== version.lockVersion) {
    throw new ContractApplicationError(
      "CONTRACT_PRECONDITION_FAILED",
      "The draft changed after it was loaded.",
      409,
      {
        currentHash: version.contractHash,
        currentLockVersion: version.lockVersion,
        contractHash: version.contractHash,
        lockVersion: version.lockVersion,
      },
    );
  }
}

export class ContractApplicationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "ContractApplicationError";
  }
}

export class ContractApplicationService {
  constructor(private readonly repository: ContractApplicationRepository) {}

  async execute(request: ContractApplicationRequest): Promise<ContractApplicationResult> {
    switch (request.mode) {
      case "get":
      case "export": {
        // GET/export is intentionally a single read with no materialization,
        // cloning, normalization write, or lazy projection repair.
        const exported = await this.repository.exportCanonicalContract(request.versionId);
        if (!exported) {
          throw new ContractApplicationError("CONTRACT_NOT_FOUND", "Contract version was not found.", 404);
        }
        const contract = canonicalizeMetaEntityContractV21(exported.contract);
        const computedHash = metaEntityContractV21Hash(contract);
        if (exported.version.contractHash
            && exported.version.contractHash !== computedHash) {
          throw new ContractApplicationError(
            "CONTRACT_HASH_MISMATCH",
            "Stored Contract hash does not match its canonical document.",
            409,
          );
        }
        return {
          mode: request.mode,
          valid: true,
          versionId: request.versionId,
          versionStatus: exported.version.status,
          lockVersion: exported.version.lockVersion,
          contract,
          contractHash: exported.version.contractHash ?? undefined,
          diagnostics: [],
        };
      }
      case "validate": {
        const parsed = MetaEntityContractV21Schema.safeParse(request.contract);
        if (!parsed.success) {
          return { mode: request.mode, valid: false, diagnostics: zodDiagnostics(parsed.error) };
        }
        const contract = canonicalizeMetaEntityContractV21(parsed.data);
        return {
          mode: request.mode,
          valid: true,
          contract,
          contractHash: metaEntityContractV21Hash(contract),
          diagnostics: [],
        };
      }
      case "diff": {
        const before = canonicalizeMetaEntityContractV21(request.before);
        const after = canonicalizeMetaEntityContractV21(request.after);
        return {
          mode: request.mode,
          valid: true,
          contractHash: metaEntityContractV21Hash(after),
          diagnostics: [],
          diff: diffValues(before, after),
        };
      }
      case "patch-owner": {
        const exported = await this.repository.exportCanonicalContract(request.versionId);
        if (!exported) {
          throw new ContractApplicationError("CONTRACT_NOT_FOUND", "Contract version was not found.", 404);
        }
        if (request.owner === "contract_schema_version") {
          throw new ContractApplicationError(
            "CONTRACT_OWNER_IMMUTABLE",
            "contract_schema_version cannot be patched as an owner.",
            422,
          );
        }
        const current = canonicalizeMetaEntityContractV21(exported.contract);
        const expectedHash = normalizeEtag(request.ifMatch);
        const currentHash = exported.version.contractHash ?? metaEntityContractV21Hash(current);
        if (expectedHash !== currentHash
            || request.expectedLockVersion !== exported.version.lockVersion) {
          const base = request.baseContract === undefined
            ? null
            : MetaEntityContractV21Schema.safeParse(request.baseContract);
          throw new ContractApplicationError(
            "CONTRACT_PRECONDITION_FAILED",
            "The draft changed after it was loaded.",
            409,
            {
              currentHash,
              currentLockVersion: exported.version.lockVersion,
              currentDocument: current,
              changedPaths: base?.success
                ? diffValues(canonicalizeMetaEntityContractV21(base.data), current).map((entry) => entry.path)
                : [],
            },
          );
        }
        const patched = {
          ...current,
          [request.owner]: patchOwnerValue(current[request.owner], request.value),
        };
        const applied = await this.applyOrDryRun({
          mode: "apply-to-draft",
          versionId: request.versionId,
          actorId: request.actorId,
          contract: patched,
          ifMatch: request.ifMatch,
          expectedLockVersion: request.expectedLockVersion,
        }, false);
        return { ...applied, mode: "patch-owner" };
      }
      case "create-draft": {
        const version = await this.repository.transaction((transaction) =>
          transaction.createDraft({
            entityCode: request.entityCode,
            tenantId: request.tenantId,
            actorId: request.actorId,
            changeType: request.changeType,
            changeSummary: request.changeSummary ?? null,
            baseVersionId: request.baseVersionId ?? null,
          }));
        return {
          mode: request.mode,
          valid: true,
          versionId: version.versionId,
          lockVersion: version.lockVersion,
          contractHash: version.contractHash ?? undefined,
          diagnostics: [],
        };
      }
      case "dry-run":
        return this.applyOrDryRun(request, true);
      case "apply-to-draft":
        return this.applyOrDryRun(request, false);
      case "submit": {
        return this.repository.transaction(async (transaction) => {
          const version = await transaction.readVersionForUpdate(request.versionId);
          if (!version) throw new ContractApplicationError("CONTRACT_NOT_FOUND", "Contract version was not found.", 404);
          assertDraftPrecondition(version, request.ifMatch, request.expectedLockVersion);
          if (!version.contractHash) {
            throw new ContractApplicationError("CONTRACT_NOT_APPLIED", "Submit requires an applied canonical contract.", 409);
          }
          const document = await transaction.readCanonicalContractForUpdate(request.versionId);
          const contract = canonicalizeMetaEntityContractV21(document);
          const verifiedHash = metaEntityContractV21Hash(contract);
          if (verifiedHash !== version.contractHash) {
            throw new ContractApplicationError("CONTRACT_HASH_MISMATCH", "Stored Contract hash does not match its document.", 409);
          }
          const references = await transaction.resolveReferences(version, contract);
          const plan: ContractProjectionPlan = {
            versionId: version.versionId,
            entityCode: version.entityCode,
            tenantId: version.tenantId,
            canonicalContract: contract,
            canonicalJson: canonicalMetaEntityContractV21Json(contract),
            contractHash: verifiedHash,
            references,
            counts: projectionCounts(contract),
          };
          const diagnostics = await transaction.validateProjection(plan);
          if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
            throw new ContractApplicationError("CONTRACT_PREFLIGHT_FAILED", "Submission preflight failed.", 422, { diagnostics });
          }
          await transaction.compileVersion(request.versionId);
          await transaction.submit({
            versionId: request.versionId,
            actorId: request.actorId,
            contractHash: version.contractHash,
            requestKey: request.requestKey ?? null,
          });
          return {
            mode: request.mode,
            valid: true,
            versionId: request.versionId,
            versionStatus: "IN_REVIEW" as const,
            contractHash: version.contractHash,
            lockVersion: version.lockVersion,
            diagnostics: [],
          };
        });
      }
      case "publish": {
        return this.repository.transaction(async (transaction) => {
          const version = await transaction.readVersionForUpdate(request.versionId);
          if (!version) throw new ContractApplicationError("CONTRACT_NOT_FOUND", "Contract version was not found.", 404);
          const expectedHash = normalizeEtag(request.ifMatch);
          if (version.status === "EFFECTIVE"
              && expectedHash === version.contractHash
              && request.expectedLockVersion === version.lockVersion
              && version.contractHash
              && await transaction.isPublishedReady(version.versionId, version.contractHash)) {
            return {
              mode: request.mode,
              valid: true,
              noOp: true,
              versionId: request.versionId,
              versionStatus: "EFFECTIVE" as const,
              contractHash: version.contractHash,
              lockVersion: version.lockVersion,
              diagnostics: [],
            };
          }
          if (version.status !== "IN_REVIEW") {
            throw new ContractApplicationError(
              "IN_REVIEW_REQUIRED",
              `Version '${version.versionId}' is ${version.status}; publish requires IN_REVIEW.`,
              409,
            );
          }
          if (expectedHash !== version.contractHash
              || request.expectedLockVersion !== version.lockVersion) {
            throw new ContractApplicationError(
              "CONTRACT_PRECONDITION_FAILED",
              "The reviewed contract changed after it was loaded.",
              412,
              { contractHash: version.contractHash, lockVersion: version.lockVersion },
            );
          }
          if (!version.contractHash) {
            throw new ContractApplicationError("CONTRACT_NOT_APPLIED", "Publish requires an applied canonical contract.", 409);
          }
          const document = await transaction.readCanonicalContractForUpdate(request.versionId);
          const contract = canonicalizeMetaEntityContractV21(document);
          const verifiedHash = metaEntityContractV21Hash(contract);
          if (verifiedHash !== version.contractHash) {
            throw new ContractApplicationError(
              "CONTRACT_HASH_MISMATCH",
              "Stored canonical Contract hash does not match its document.",
              409,
            );
          }
          const references = await transaction.resolveReferences(version, contract);
          const plan: ContractProjectionPlan = {
            versionId: version.versionId,
            entityCode: version.entityCode,
            tenantId: version.tenantId,
            canonicalContract: contract,
            canonicalJson: canonicalMetaEntityContractV21Json(contract),
            contractHash: verifiedHash,
            references,
            counts: projectionCounts(contract),
          };
          const diagnostics = await transaction.validateProjection(plan);
          if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
            throw new ContractApplicationError(
              "CONTRACT_PREFLIGHT_FAILED",
              "Publication preflight failed.",
              422,
              { diagnostics },
            );
          }
          await transaction.applyProjection(plan, request.actorId);
          const compiled = await transaction.compileVersion(request.versionId);
          const artifacts = compilePlaneArtifacts(compiled, contract, verifiedHash);
          const previousDocument = await transaction.readCurrentPublishedContract(request.versionId);
          const publicationDiff = previousDocument
            ? diffValues(canonicalizeMetaEntityContractV21(previousDocument), contract)
            : diffValues({}, contract);
          const selfApproval = version.submittedBy === request.actorId;
          const breakGlassReason = request.breakGlassReason?.trim() || null;
          const breakGlassTicket = request.breakGlassTicket?.trim() || null;
          if (selfApproval && (!breakGlassReason || !breakGlassTicket)) {
            throw new ContractApplicationError(
              "METADATA_SEPARATION_OF_DUTIES",
              "Submitter cannot publish their own contract without break-glass reason and ticket.",
              403,
            );
          }
          await transaction.publish({
            versionId: request.versionId,
            actorId: request.actorId,
            breakGlassReason: selfApproval ? breakGlassReason : null,
            breakGlassTicket: selfApproval ? breakGlassTicket : null,
            contractHash: verifiedHash,
            materializedHash: verifiedHash,
            artifacts,
            diff: publicationDiff,
            requestKey: request.requestKey ?? null,
            transition: "approved",
            sourceVersionId: null,
          });
          return {
            mode: request.mode,
            valid: true,
            versionId: request.versionId,
            versionStatus: "EFFECTIVE" as const,
            contractHash: version.contractHash,
            lockVersion: version.lockVersion,
            diagnostics: [],
            artifacts,
          };
        });
      }
      case "reject": {
        return this.repository.transaction(async (transaction) => {
          const version = await transaction.readVersionForUpdate(request.versionId);
          if (!version) throw new ContractApplicationError("CONTRACT_NOT_FOUND", "Contract version was not found.", 404);
          if (version.status !== "IN_REVIEW") {
            throw new ContractApplicationError("IN_REVIEW_REQUIRED", "Only IN_REVIEW may be rejected.", 409);
          }
          if (normalizeEtag(request.ifMatch) !== version.contractHash
              || request.expectedLockVersion !== version.lockVersion) {
            throw new ContractApplicationError("CONTRACT_PRECONDITION_FAILED", "The reviewed contract changed after it was loaded.", 412);
          }
          if (!request.reason.trim() || !version.contractHash) {
            throw new ContractApplicationError("REJECTION_REASON_REQUIRED", "Reject requires a reason and canonical contract.", 422);
          }
          await transaction.reject({
            versionId: request.versionId,
            actorId: request.actorId,
            contractHash: version.contractHash,
            reason: request.reason.trim(),
            requestKey: request.requestKey ?? null,
          });
          return {
            mode: request.mode,
            valid: true,
            versionId: request.versionId,
            versionStatus: "REJECTED" as const,
            contractHash: version.contractHash,
            lockVersion: version.lockVersion,
            diagnostics: [],
          };
        });
      }
      case "rollback": {
        return this.repository.transaction(async (transaction) => {
          const rollback = await transaction.createRollbackVersion({
            sourceVersionId: request.sourceVersionId,
            actorId: request.actorId,
            requestKey: request.requestKey ?? null,
          });
          if (rollback.status === "EFFECTIVE"
              && rollback.contractHash
              && await transaction.isPublishedReady(rollback.versionId, rollback.contractHash)) {
            const replayDocument = await transaction.readCanonicalContractForUpdate(rollback.versionId);
            return {
              mode: request.mode,
              valid: true,
              noOp: true,
              versionId: rollback.versionId,
              versionStatus: "EFFECTIVE" as const,
              contract: canonicalizeMetaEntityContractV21(replayDocument),
              contractHash: rollback.contractHash,
              lockVersion: rollback.lockVersion,
              diagnostics: [],
            };
          }
          const document = await transaction.readCanonicalContractForUpdate(rollback.versionId);
          const contract = canonicalizeMetaEntityContractV21(document);
          const contractHash = metaEntityContractV21Hash(contract);
          const references = await transaction.resolveReferences(rollback, contract);
          const plan: ContractProjectionPlan = {
            versionId: rollback.versionId,
            entityCode: rollback.entityCode,
            tenantId: rollback.tenantId,
            canonicalContract: contract,
            canonicalJson: canonicalMetaEntityContractV21Json(contract),
            contractHash,
            references,
            counts: projectionCounts(contract),
          };
          const diagnostics = await transaction.validateProjection(plan);
          if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
            throw new ContractApplicationError("CONTRACT_PREFLIGHT_FAILED", "Rollback preflight failed.", 422, { diagnostics });
          }
          await transaction.applyProjection(plan, request.actorId);
          const compiled = await transaction.compileVersion(rollback.versionId);
          const artifacts = compilePlaneArtifacts(compiled, contract, contractHash);
          const previousDocument = await transaction.readCurrentPublishedContract(rollback.versionId);
          const rollbackDiff = previousDocument
            ? diffValues(canonicalizeMetaEntityContractV21(previousDocument), contract)
            : diffValues({}, contract);
          await transaction.publish({
            versionId: rollback.versionId,
            actorId: request.actorId,
            breakGlassReason: null,
            breakGlassTicket: null,
            contractHash,
            materializedHash: contractHash,
            artifacts,
            diff: rollbackDiff,
            requestKey: request.requestKey ?? null,
            transition: "rollback_published",
            sourceVersionId: request.sourceVersionId,
          });
          return {
            mode: request.mode,
            valid: true,
            versionId: rollback.versionId,
            versionStatus: "EFFECTIVE" as const,
            contract,
            contractHash,
            lockVersion: rollback.lockVersion,
            diagnostics: [],
            artifacts,
          };
        });
      }
    }
  }

  private async applyOrDryRun(
    request: Extract<ContractApplicationRequest, { mode: "apply-to-draft" | "dry-run" }>,
    dryRun: boolean,
  ): Promise<ContractApplicationResult> {
    const parsed = MetaEntityContractV21Schema.safeParse(request.contract);
    if (!parsed.success) {
      return { mode: request.mode, valid: false, diagnostics: zodDiagnostics(parsed.error) };
    }
    const canonicalContract = canonicalizeMetaEntityContractV21(parsed.data);
    const canonicalJson = canonicalMetaEntityContractV21Json(canonicalContract);
    const contractHash = hashCanonicalJson(canonicalJson);

    return this.repository.transaction(async (transaction) => {
      const version = await transaction.readVersionForUpdate(request.versionId);
      if (!version) throw new ContractApplicationError("CONTRACT_NOT_FOUND", "Contract version was not found.", 404);
      assertDraftPrecondition(version, request.ifMatch, request.expectedLockVersion);
      if (version.entityCode !== canonicalContract.catalog.entity_code) {
        throw new ContractApplicationError(
          "ENTITY_CODE_MISMATCH",
          "The contract entity_code does not own the selected draft.",
          422,
        );
      }

      // Hash equality is checked before reference resolution or any projection
      // work, making identical re-application a true no-op.
      if (version.contractHash === contractHash) {
        return {
          mode: request.mode,
          valid: true,
          noOp: true,
          versionId: request.versionId,
          lockVersion: version.lockVersion,
          contractHash,
          contract: canonicalContract,
          diagnostics: [],
        };
      }

      const references = await transaction.resolveReferences(version, canonicalContract);
      const plan: ContractProjectionPlan = {
        versionId: request.versionId,
        entityCode: version.entityCode,
        tenantId: version.tenantId,
        canonicalContract,
        canonicalJson,
        contractHash,
        references,
        counts: projectionCounts(canonicalContract),
      };
      const diagnostics = await transaction.validateProjection(plan);
      if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        return {
          mode: request.mode,
          valid: false,
          versionId: request.versionId,
          lockVersion: version.lockVersion,
          contractHash,
          contract: canonicalContract,
          diagnostics,
          plan,
        };
      }
      if (dryRun) {
        const compiled = version.contractHash === contractHash
          ? await transaction.compileVersion(request.versionId)
          : {
              entity_code: canonicalContract.catalog.entity_code,
              version_id: request.versionId,
              prospective: true,
              fields: canonicalContract.fields,
              relations: canonicalContract.relations,
              surfaces: canonicalContract.surfaces,
              operations: canonicalContract.operations,
              lifecycle: canonicalContract.lifecycle,
              flows: canonicalContract.flows,
            };
        const artifacts = compilePlaneArtifacts(compiled, canonicalContract, contractHash);
        return {
          mode: request.mode,
          valid: true,
          versionId: request.versionId,
          lockVersion: version.lockVersion,
          contractHash,
          contract: canonicalContract,
          diagnostics,
          plan,
          artifacts,
        };
      }
      if (request.mode !== "apply-to-draft") {
        throw new ContractApplicationError("INVALID_MODE", "Only apply-to-draft may persist a projection.", 500);
      }

      // Both projection and canonical document persistence share this repository
      // transaction. Any owner failure rolls the complete application back.
      await transaction.applyProjection(plan, request.actorId);
      const lockVersion = await transaction.persistCanonicalDocument(
        request.versionId,
        canonicalContract,
        contractHash,
        request.expectedLockVersion,
        request.actorId,
      );
      return {
        mode: request.mode,
        valid: true,
        noOp: false,
        versionId: request.versionId,
        lockVersion,
        contractHash,
        contract: canonicalContract,
        diagnostics,
        plan,
      };
    });
  }
}
