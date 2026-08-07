import "server-only";

import { createHash } from "node:crypto";
import type { V4Session } from "@athyper/platform-iam-auth-bff";
import { buildDocumentEditPermissionStamp } from "@/lib/server/document-edit-coordinator-identity";
import {
  ensureMetaEntityRuntimeInvalidationSubscriber,
  type MetaEntityRuntimeInvalidationEvent,
} from "@/lib/server/meta-entity-runtime-cache-events";

export type SessionConfigurationCacheState = "hit" | "miss" | "stale" | "bypass";

export interface SessionConfigurationIdentity {
  tenantId: string;
  planeKey: string;
  realmKey: string;
  principalId: string;
  activeOrganizationId: string;
  legalEntityId?: string;
  companyCodeId?: string;
  permissionStamp: string;
  configurationVersion: string;
}

export interface SessionConfigurationCachePolicy<T> {
  freshForMs: number;
  staleForMs: number;
  enabled?: boolean;
  negative?: {
    freshForMs: number;
    isNegative?: (value: T) => boolean;
  };
}

export interface SessionConfigurationCacheDiagnostic {
  event: "session_configuration_cache";
  namespace: string;
  keyHash: string;
  cacheState: SessionConfigurationCacheState;
  coalesced: boolean;
  negative: boolean;
  generation: number;
  durationMs: number;
  outcome: "success" | "error";
}

export interface GetSessionConfigurationInput<T> {
  namespace: string;
  sessionIdentity: SessionConfigurationIdentity;
  keyParts?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  loader: () => Promise<T>;
  policy: SessionConfigurationCachePolicy<T>;
  onDiagnostic?: (diagnostic: SessionConfigurationCacheDiagnostic) => void;
}

export interface SessionConfigurationInvalidationScope {
  namespace?: string;
  tenantId?: string;
  planeKey?: string;
  realmKey?: string;
  principalId?: string;
  activeOrganizationId?: string;
  permissionStamp?: string;
  keyParts?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  reason: string;
}

interface CacheEntry<T> {
  value: T;
  identity: SessionConfigurationIdentity;
  namespace: string;
  keyParts: Readonly<Record<string, string | number | boolean | null | undefined>>;
  generation: number;
  freshUntil: number;
  staleUntil: number;
  negative: boolean;
}

interface LoadResult<T> {
  value: T;
  negative: boolean;
}

interface RecordedInvalidation {
  scope: SessionConfigurationInvalidationScope;
  generation: number;
}

const DEFAULT_CACHE_LIMIT = 500;
const MAX_INVALIDATION_HISTORY = 1_000;

export class SessionConfigurationCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<LoadResult<unknown>>>();
  private readonly invalidations: RecordedInvalidation[] = [];
  private latestGeneration = 0;
  private minimumRetainedGeneration = 0;

  constructor(private readonly options: {
    limit: number;
    now?: () => number;
    onDiagnostic?: (diagnostic: SessionConfigurationCacheDiagnostic) => void;
  }) {
    if (!Number.isSafeInteger(options.limit) || options.limit < 1) {
      throw new Error("Session configuration cache limit must be a positive integer.");
    }
  }

  get generation(): number {
    return this.latestGeneration;
  }

  get size(): number {
    return this.entries.size;
  }

  get pendingLoads(): number {
    return this.inFlight.size;
  }

  async get<T>(input: GetSessionConfigurationInput<T>): Promise<T> {
    const startedAt = performance.now();
    const namespace = normalizeNamespace(input.namespace);
    const keyParts = normalizeKeyParts(input.keyParts);
    const key = buildSessionConfigurationCacheKey(namespace, input.sessionIdentity, keyParts);
    const keyHash = hashCacheKey(key);
    const policy = normalizePolicy(input.policy);
    let cacheState: SessionConfigurationCacheState = policy.enabled ? "miss" : "bypass";
    let coalesced = false;
    let negative = false;

    try {
      if (!policy.enabled) {
        const value = await input.loader();
        negative = isNegativeValue(value, policy);
        this.emit(input, {
          namespace,
          keyHash,
          cacheState,
          coalesced,
          negative,
          outcome: "success",
          durationMs: performance.now() - startedAt,
        });
        return value;
      }

      const now = this.now();
      const cached = this.entries.get(key) as CacheEntry<T> | undefined;
      if (cached && now < cached.freshUntil) {
        this.touch(key, cached);
        cacheState = "hit";
        negative = cached.negative;
        this.emit(input, {
          namespace,
          keyHash,
          cacheState,
          coalesced,
          negative,
          outcome: "success",
          durationMs: performance.now() - startedAt,
        });
        return cached.value;
      }

      if (cached && now < cached.staleUntil) {
        this.touch(key, cached);
        cacheState = "stale";
        negative = cached.negative;
        this.startBackgroundRevalidation(key, namespace, keyParts, input, policy);
        this.emit(input, {
          namespace,
          keyHash,
          cacheState,
          coalesced,
          negative,
          outcome: "success",
          durationMs: performance.now() - startedAt,
        });
        return cached.value;
      }

      if (cached) this.entries.delete(key);
      const pending = this.inFlight.get(key) as Promise<LoadResult<T>> | undefined;
      coalesced = Boolean(pending);
      const loaded = pending ?? this.startLoad(key, namespace, keyParts, input, policy);
      const result = await loaded;
      negative = result.negative;
      this.emit(input, {
        namespace,
        keyHash,
        cacheState,
        coalesced,
        negative,
        outcome: "success",
        durationMs: performance.now() - startedAt,
      });
      return result.value;
    } catch (error) {
      this.emit(input, {
        namespace,
        keyHash,
        cacheState,
        coalesced,
        negative,
        outcome: "error",
        durationMs: performance.now() - startedAt,
      });
      throw error;
    }
  }

  invalidate(scope: SessionConfigurationInvalidationScope, generation?: number): number {
    const effectiveGeneration = Math.max(this.latestGeneration + 1, generation ?? 0);
    this.latestGeneration = effectiveGeneration;
    this.invalidations.push({ scope, generation: effectiveGeneration });
    if (this.invalidations.length > MAX_INVALIDATION_HISTORY) {
      const removed = this.invalidations.shift();
      if (removed) this.minimumRetainedGeneration = removed.generation;
    }

    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (matchesInvalidation(entry, scope)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(reason = "operational_fallback", generation?: number): number {
    return this.invalidate({ reason }, generation);
  }

  private startBackgroundRevalidation<T>(
    key: string,
    namespace: string,
    keyParts: Readonly<Record<string, string | number | boolean | null | undefined>>,
    input: GetSessionConfigurationInput<T>,
    policy: Required<Omit<SessionConfigurationCachePolicy<T>, "negative">> & {
      negative?: SessionConfigurationCachePolicy<T>["negative"];
    },
  ): void {
    if (this.inFlight.has(key)) return;
    void this.startLoad(key, namespace, keyParts, input, policy).catch(() => undefined);
  }

  private startLoad<T>(
    key: string,
    namespace: string,
    keyParts: Readonly<Record<string, string | number | boolean | null | undefined>>,
    input: GetSessionConfigurationInput<T>,
    policy: Required<Omit<SessionConfigurationCachePolicy<T>, "negative">> & {
      negative?: SessionConfigurationCachePolicy<T>["negative"];
    },
  ): Promise<LoadResult<T>> {
    const generationAtStart = this.latestGeneration;
    const promise = (async (): Promise<LoadResult<T>> => {
      const value = await input.loader();
      const negative = isNegativeValue(value, policy);
      const negativePolicy = policy.negative;
      const shouldCache = !negative || Boolean(negativePolicy);
      if (shouldCache && !this.wasInvalidatedSince(
        namespace,
        input.sessionIdentity,
        keyParts,
        generationAtStart,
      )) {
        const freshForMs = negative ? negativePolicy!.freshForMs : policy.freshForMs;
        const now = this.now();
        this.entries.delete(key);
        this.entries.set(key, {
          value,
          identity: input.sessionIdentity,
          namespace,
          keyParts,
          generation: generationAtStart,
          freshUntil: now + freshForMs,
          staleUntil: now + freshForMs + (negative ? 0 : policy.staleForMs),
          negative,
        });
        this.evictOverflow();
      }
      return { value, negative };
    })();

    this.inFlight.set(key, promise as Promise<LoadResult<unknown>>);
    void promise.finally(() => {
      if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
    }).catch(() => undefined);
    return promise;
  }

  private wasInvalidatedSince(
    namespace: string,
    identity: SessionConfigurationIdentity,
    keyParts: Readonly<Record<string, string | number | boolean | null | undefined>>,
    generation: number,
  ): boolean {
    if (generation < this.minimumRetainedGeneration) return true;
    const entry = { namespace, identity, keyParts };
    return this.invalidations.some((item) =>
      item.generation > generation && matchesInvalidation(entry, item.scope));
  }

  private touch<T>(key: string, entry: CacheEntry<T>): void {
    this.entries.delete(key);
    this.entries.set(key, entry as CacheEntry<unknown>);
  }

  private evictOverflow(): void {
    while (this.entries.size > this.options.limit) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }

  private emit<T>(
    input: GetSessionConfigurationInput<T>,
    value: Omit<SessionConfigurationCacheDiagnostic, "event" | "generation">,
  ): void {
    const diagnostic: SessionConfigurationCacheDiagnostic = {
      event: "session_configuration_cache",
      generation: this.latestGeneration,
      ...value,
      durationMs: roundDuration(value.durationMs),
    };
    emitDiagnostic(input.onDiagnostic, diagnostic);
    emitDiagnostic(this.options.onDiagnostic, diagnostic);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

const sharedSessionConfigurationCache = new SessionConfigurationCache({
  limit: DEFAULT_CACHE_LIMIT,
  onDiagnostic: (diagnostic) => {
    if (process.env.NODE_ENV !== "test") {
      console.info("[session-configuration-cache]", diagnostic);
    }
  },
});

let invalidationSubscriberRegistered = false;

export async function getSessionConfiguration<T>(
  input: GetSessionConfigurationInput<T>,
): Promise<T> {
  if (process.env.NODE_ENV !== "test") ensureSessionConfigurationInvalidationSubscriber();
  return sharedSessionConfigurationCache.get(input);
}

export function invalidateSessionConfiguration(
  scope: SessionConfigurationInvalidationScope,
  generation?: number,
): number {
  return sharedSessionConfigurationCache.invalidate(scope, generation);
}

export function buildSessionConfigurationIdentity(session: V4Session): SessionConfigurationIdentity | null {
  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  if (!membership?.tenantId) return null;
  const isCompanyCode = membership.contextType?.toLowerCase() === "company_code";
  const versions = [session.authEpoch, membership.authEpoch, membership.scopeVersion]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    tenantId: membership.tenantId,
    planeKey: session.planeKey,
    realmKey: session.realmKey,
    principalId: session.userId,
    activeOrganizationId: session.activeOrg ?? membership.organizationId ?? "none",
    legalEntityId: membership.legalEntityId,
    companyCodeId: isCompanyCode ? membership.organizationId : undefined,
    permissionStamp: buildDocumentEditPermissionStamp(session),
    configurationVersion: versions.length > 0 ? versions.join(":") : "0",
  };
}

export function buildSessionConfigurationCacheKey(
  namespace: string,
  identity: SessionConfigurationIdentity,
  keyParts: Readonly<Record<string, string | number | boolean | null | undefined>> = {},
): string {
  return stableStringify({
    namespace: normalizeNamespace(namespace),
    identity,
    keyParts: normalizeKeyParts(keyParts),
  });
}

function ensureSessionConfigurationInvalidationSubscriber(): void {
  if (invalidationSubscriberRegistered) return;
  invalidationSubscriberRegistered = true;
  ensureMetaEntityRuntimeInvalidationSubscriber(handleRuntimeInvalidation);
}

function handleRuntimeInvalidation(event: MetaEntityRuntimeInvalidationEvent): void {
  invalidateSessionConfiguration({
    tenantId: event.tenant,
    planeKey: event.plane,
    realmKey: event.realm,
    principalId: event.principal,
    permissionStamp: event.permissionStamp,
    reason: event.reason,
  }, event.generation);
}

function normalizePolicy<T>(policy: SessionConfigurationCachePolicy<T>): Required<
  Omit<SessionConfigurationCachePolicy<T>, "negative">
> & { negative?: SessionConfigurationCachePolicy<T>["negative"] } {
  if (!Number.isFinite(policy.freshForMs) || policy.freshForMs < 0) {
    throw new Error("Session configuration freshForMs must be a non-negative number.");
  }
  if (!Number.isFinite(policy.staleForMs) || policy.staleForMs < 0) {
    throw new Error("Session configuration staleForMs must be a non-negative number.");
  }
  if (policy.negative && (!Number.isFinite(policy.negative.freshForMs) || policy.negative.freshForMs < 0)) {
    throw new Error("Session configuration negative freshForMs must be a non-negative number.");
  }
  return {
    freshForMs: policy.freshForMs,
    staleForMs: policy.staleForMs,
    enabled: policy.enabled !== false,
    negative: policy.negative,
  };
}

function isNegativeValue<T>(
  value: T,
  policy: { negative?: SessionConfigurationCachePolicy<T>["negative"] },
): boolean {
  return policy.negative?.isNegative?.(value) ?? (value === null || value === undefined);
}

function matchesInvalidation(
  entry: Pick<CacheEntry<unknown>, "namespace" | "identity" | "keyParts">,
  scope: SessionConfigurationInvalidationScope,
): boolean {
  const identity = entry.identity;
  return (scope.namespace === undefined || scope.namespace === entry.namespace)
    && (scope.tenantId === undefined || scope.tenantId === identity.tenantId)
    && (scope.planeKey === undefined || scope.planeKey === identity.planeKey)
    && (scope.realmKey === undefined || scope.realmKey === identity.realmKey)
    && (scope.principalId === undefined || scope.principalId === identity.principalId)
    && (scope.activeOrganizationId === undefined || scope.activeOrganizationId === identity.activeOrganizationId)
    && (scope.permissionStamp === undefined || scope.permissionStamp === identity.permissionStamp)
    && keyPartsMatch(entry.keyParts, scope.keyParts);
}

function keyPartsMatch(
  value: Readonly<Record<string, string | number | boolean | null | undefined>>,
  expected?: Readonly<Record<string, string | number | boolean | null | undefined>>,
): boolean {
  if (!expected) return true;
  return Object.entries(expected).every(([key, item]) => value[key] === item);
}

function normalizeNamespace(value: string): string {
  const namespace = value.trim().toLowerCase();
  if (!namespace || !/^[a-z0-9][a-z0-9._:-]*$/.test(namespace)) {
    throw new Error(`Invalid session configuration namespace: ${value}`);
  }
  return namespace;
}

function normalizeKeyParts(
  value?: Readonly<Record<string, string | number | boolean | null | undefined>>,
): Readonly<Record<string, string | number | boolean | null | undefined>> {
  return Object.fromEntries(
    Object.entries(value ?? {})
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashCacheKey(value: string): string {
  return createHash("sha256").update(value).digest("base64url").slice(0, 16);
}

function roundDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}

function emitDiagnostic(
  sink: ((diagnostic: SessionConfigurationCacheDiagnostic) => void) | undefined,
  diagnostic: SessionConfigurationCacheDiagnostic,
): void {
  if (!sink) return;
  try {
    sink(diagnostic);
  } catch {
    // Diagnostics must never turn a successful configuration load into a failure.
  }
}
