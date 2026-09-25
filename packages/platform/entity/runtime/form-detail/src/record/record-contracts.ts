import type { ReactNode } from "react";
import type {
  entityRuntimeClient,
  EntityRuntimeResourceContext,
} from "@athyper/platform-entity-descriptor-client";
import type { ProtectedValueRequest } from "../protected-value";
export type RecordHttpClient = Parameters<
  typeof entityRuntimeClient.operation
>[0];
export interface EntityRecordOperationContext {
  readonly http: RecordHttpClient;
  readonly entityCode: string;
  readonly recordId: string;
  readonly resourceContext?: EntityRuntimeResourceContext;
}
export type RecordRevealHandler = (
  context: EntityRecordOperationContext,
  id: string,
  purpose: string,
  signal: AbortSignal,
) => ReturnType<ProtectedValueRequest>;
export type RecordActionHandler = (
  context: EntityRecordOperationContext & { readonly revision: string },
) => Promise<void> | void;
export interface EntityRecordAdapter {
  readonly entityCode: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly recordHref: (recordId: string) => string;
  readonly preferenceKey?: string;
  readonly sectionForTab?: (tab: string) => string | undefined;
  readonly reveals?: Readonly<Record<string, RecordRevealHandler>>;
  readonly actions?: Readonly<Record<string, RecordActionHandler>>;
}
