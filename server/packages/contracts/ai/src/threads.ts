import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AtlasContentBlock, AtlasMessageRole } from "./model.js";

export type AtlasThreadStatus = "active" | "archived" | "deleted";
export type AtlasParticipantRole = "owner" | "member" | "observer";
export type AtlasMessageStatus = "pending" | "completed" | "failed" | "cancelled";

export interface AtlasThreadParticipant { readonly principalId: string; readonly role: AtlasParticipantRole; readonly joinedAt: string; readonly revokedAt?: string }
export interface AtlasThreadRetention { readonly policyId: string; readonly expiresAt: string | null; readonly purgeAfter: string | null; readonly legalHold: boolean }
export interface AtlasThread {
  readonly threadId: string;
  readonly tenantId: string;
  readonly planeKey: VerifiedRequestContext["planeKey"];
  readonly ownerPrincipalId: string;
  readonly title: string | null;
  readonly status: AtlasThreadStatus;
  readonly participants: readonly AtlasThreadParticipant[];
  readonly rowVersion: number;
  readonly lastMessageSequence: number;
  readonly retention: AtlasThreadRetention;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AtlasMessage {
  readonly messageId: string;
  readonly threadId: string;
  readonly sequence: number;
  readonly role: AtlasMessageRole;
  readonly status: AtlasMessageStatus;
  readonly content: readonly AtlasContentBlock[];
  readonly runId: string | null;
  readonly parentMessageId: string | null;
  readonly createdAt: string;
  readonly terminalAt: string | null;
}

export interface AtlasCursorPage<T> { readonly items: readonly T[]; readonly nextCursor: string | null }
export interface AtlasRetentionPolicy { readonly policyId: string; readonly retentionDays: number; readonly displayText: string }
export interface AtlasRetentionPolicyResolver { resolve(context: VerifiedRequestContext): Promise<AtlasRetentionPolicy> }

export interface AtlasThreadRepository {
  create(input: { readonly context: VerifiedRequestContext; readonly threadId: string; readonly title: string | null; readonly retention: AtlasThreadRetention }): Promise<AtlasThread>;
  list(input: { readonly context: VerifiedRequestContext; readonly status: AtlasThreadStatus | "all"; readonly limit: number; readonly cursor?: string }): Promise<AtlasCursorPage<AtlasThread>>;
  get(input: { readonly context: VerifiedRequestContext; readonly threadId: string }): Promise<AtlasThread | null>;
  listMessages(input: { readonly context: VerifiedRequestContext; readonly threadId: string; readonly limit: number; readonly beforeSequence?: number }): Promise<AtlasCursorPage<AtlasMessage>>;
  rename(input: { readonly context: VerifiedRequestContext; readonly threadId: string; readonly title: string; readonly expectedRowVersion: number }): Promise<AtlasThread | null>;
  archive(input: { readonly context: VerifiedRequestContext; readonly threadId: string; readonly expectedRowVersion: number }): Promise<AtlasThread | null>;
  softDelete(input: { readonly context: VerifiedRequestContext; readonly threadId: string; readonly expectedRowVersion: number; readonly deletedAt: string }): Promise<boolean>;
  putParticipant(input: { readonly context: VerifiedRequestContext; readonly threadId: string; readonly principalId: string; readonly role: Exclude<AtlasParticipantRole, "owner">; readonly expectedRowVersion: number }): Promise<AtlasThread | null>;
  revokeParticipant(input: { readonly context: VerifiedRequestContext; readonly threadId: string; readonly principalId: string; readonly expectedRowVersion: number }): Promise<AtlasThread | null>;
}

export interface AtlasThreadAuthorizer {
  authorize(input: { readonly context: VerifiedRequestContext; readonly operation: "create" | "read" | "manage" | "delete" | "export" | "run" | "participants"; readonly thread?: AtlasThread }): Promise<boolean>;
}

export interface AtlasThreadExport {
  readonly schema: "atlas-thread-export/1";
  readonly exportedAt: string;
  readonly thread: Pick<AtlasThread, "threadId" | "title" | "status" | "createdAt" | "updatedAt">;
  readonly messages: readonly Pick<AtlasMessage, "messageId" | "sequence" | "role" | "status" | "content" | "createdAt" | "terminalAt">[];
}

export interface AtlasThreadMaintenanceAuthority {
  purgeEligible(input: { readonly asOf: string; readonly batchSize: number }): Promise<{ readonly expiredCount: number; readonly purgedCount: number }>;
}
