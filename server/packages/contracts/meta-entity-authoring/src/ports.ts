import type { MetadataGenerationEvent } from "@athyper/server-contract-metadata";
import type {
  BreakGlassEvidence,
  CompiledMetaEntityArtifact,
  ContractTestReport,
  MetaEntityChangeSet,
  MetaEntityGraph,
  MetaEntityInspectionRelease,
  SignedMetaEntityArtifact,
  ValidationReport,
} from "./model.js";

export class AuthoringConflictError extends Error {
  readonly code = "AUTHORING_REVISION_CONFLICT";
}
export class AuthoringPolicyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface MetaEntityAuthoringRepository {
  listDraftSaves?(changeSetId: string): Promise<readonly {revision: number; capturedAt: string; kind: string}[]>;
  readDraftSave?(changeSetId: string, revision: number): Promise<MetaEntityGraph | null>;
  listInspectionReleases?(tenantId: string): Promise<readonly MetaEntityInspectionRelease[]>;
  readInspectionRelease?(tenantId: string, releaseId: string): Promise<{release: MetaEntityInspectionRelease; graph: MetaEntityGraph} | null>;

  list?(tenantId: string): Promise<readonly MetaEntityChangeSet[]>;
  forkDraft?(input: {
    sourceChangeSetId: string;
    actorId: string;
  }): Promise<MetaEntityChangeSet>;
  createDraft(input: {
    tenantId: string | null;
    entityId: string;
    entityCode: string;
    branchCode: string;
    title: string;
    actorId: string;
    registration?: {
      schemaVersion: 1;
      moduleCode: string;
      entityClass:
        | "business"
        | "configuration"
        | "reference"
        | "process"
        | "projection"
        | "technical";
      ownershipModel: "tenant" | "overlay";
    };
  }): Promise<MetaEntityChangeSet>;
  get(changeSetId: string): Promise<MetaEntityChangeSet | null>;
  loadGraph(changeSetId: string): Promise<MetaEntityGraph>;
  replaceGraph(input: {
    changeSetId: string;
    expectedRevision: number;
    graph: MetaEntityGraph;
    actorId: string;
  }): Promise<MetaEntityChangeSet>;
  recordValidation(
    changeSetId: string,
    revision: number,
    report: ValidationReport,
    actorId: string,
  ): Promise<void>;
  recordTestRun(
    changeSetId: string,
    revision: number,
    report: ContractTestReport,
    actorId: string,
  ): Promise<void>;
  transition(input: {
    changeSetId: string;
    expectedRevision: number;
    from: MetaEntityChangeSet["status"];
    to: MetaEntityChangeSet["status"];
    actorId: string;
    breakGlass?: BreakGlassEvidence;
  }): Promise<MetaEntityChangeSet>;
  createRelease(input: {
    changeSetId: string;
    expectedRevision: number;
    actorId: string;
    artifact: SignedMetaEntityArtifact;
    targetPlanes: readonly ("studio" | "neon" | "mesh")[];
    releaseKind: "publish" | "rollback";
    rollbackOfReleaseId?: string;
  }): Promise<{ id: string; releaseNo: number }>;
  getSignedRelease(releaseId: string): Promise<SignedMetaEntityArtifact | null>;
}

export interface ArtifactSigner {
  sign(artifact: CompiledMetaEntityArtifact): Promise<{
    signatureAlgorithm: string;
    signingKeyId: string;
    signature: string;
  }>;
}

export interface MetaEntityPublicationPort {
  publish(input: {
    releaseId: string;
    artifact: SignedMetaEntityArtifact;
    targetPlanes: readonly ("studio" | "neon" | "mesh")[];
  }): Promise<void>;
  activate(input: {
    releaseId: string;
    plane: "studio" | "neon" | "mesh";
    actorId: string;
  }): Promise<MetadataGenerationEvent>;
  appendGenerationEvent(event: MetadataGenerationEvent): Promise<void>;
}

export interface MetaEntityPublicationDispatcher {
  dispatch(input: {
    releaseId: string;
    artifact: SignedMetaEntityArtifact;
    targetPlanes: readonly ("studio" | "neon" | "mesh")[];
  }): Promise<void>;
  activate(input: {
    releaseId: string;
    plane: "studio" | "neon" | "mesh";
    actorId: string;
  }): Promise<MetadataGenerationEvent>;
}
