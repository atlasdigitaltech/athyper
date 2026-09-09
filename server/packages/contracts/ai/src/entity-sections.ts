import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

/** Code-registered capability metadata. It selects an owner, never grants access. */
export interface AtlasEntitySectionContext {
  readonly entityCode: string;
  readonly sectionKey: string;
  readonly aliases: readonly string[];
  readonly resultKey?: string;
  readonly label?: string;
  readonly searchFields?: readonly string[];
}
export interface AtlasEntitySectionBinding extends AtlasEntitySectionContext {
  readonly planeKey: VerifiedRequestContext["planeKey"];
  readonly toolCode: string;
  readonly label: string;
  readonly readPermission: string;
  readonly admissionField: string;
  readonly recordIdField?: string;
  readonly resultKey: string;
  readonly maxRows: number;
  readonly fields: Readonly<Record<string, {readonly type: "string" | "boolean" | "number"; readonly maxLength?: number}>>;
}
export interface AtlasEntitySectionProjection {
  readonly entityCode: string;
  readonly sectionKey: string;
  readonly recordId: string;
  readonly status: "ready" | "empty" | "unavailable";
  readonly unavailableReason?: "missing_scope" | "denied" | "reader_unavailable";
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly hasMore: boolean;
}
export type AtlasEntitySectionReader = (input: {readonly context: VerifiedRequestContext; readonly recordId: string}) => Promise<AtlasEntitySectionProjection>;
