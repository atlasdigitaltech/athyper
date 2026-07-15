import "server-only";

import { createHash } from "node:crypto";
import type { DocumentEditRuntimeRouteContext } from "@/lib/server/document-edit-runtime-route-context";
import {
  createDocumentEditRedisClient,
  type DocumentEditRedisClient,
} from "@/lib/server/document-edit-runtime-redis";

export const DOCUMENT_EDIT_EVENT_CATCHUP_THRESHOLD_MS = 5 * 60_000;
export const DOCUMENT_EDIT_EVENT_HEARTBEAT_MS = 25_000;

const EVENT_RING_MAX = 100;
const EVENT_REDIS_TTL_SECONDS = 10 * 60;
const REDIS_WARNING_INTERVAL_MS = 60_000;
const EVENT_ORIGIN_ID = `${process.pid}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;

export interface DocumentEditRuntimeEventScope {
  scopeKind: "principal_record";
  scopeKey: string;
  tenantId?: string;
  planeKey?: string;
  realmKey?: string;
  effectivePrincipal: string;
  entityCode: string;
  recordId: string;
}

export interface DocumentEditRuntimeEvent {
  id: string;
  type: string;
  timestamp: number;
  scopeKind: DocumentEditRuntimeEventScope["scopeKind"];
  entityCode: string;
  recordId: string;
  payload: Record<string, unknown>;
  originId?: string;
  sourceTabId?: string;
}

export type DocumentEditRuntimeEventSubscriber = (event: DocumentEditRuntimeEvent) => void;

const eventRings = new Map<string, DocumentEditRuntimeEvent[]>();
const subscribers = new Map<string, Set<DocumentEditRuntimeEventSubscriber>>();
let sequence = 0;
let redisWarningLastAt = 0;

export function buildDocumentEditRuntimeEventScope(
  context: DocumentEditRuntimeRouteContext,
): DocumentEditRuntimeEventScope {
  const membership = context.session.activeOrg
    ? context.session.organizations[context.session.activeOrg]
    : undefined;
  const tenantId = membership?.tenantId ?? readRecordString(context.record as Record<string, unknown>, "tenant_id");
  const planeKey = context.session.planeKey;
  const realmKey = context.session.realmKey;
  const effectivePrincipal = context.session.userId;
  const payload = {
    scopeKind: "principal_record",
    tenantId,
    planeKey,
    realmKey,
    activeOrg: context.session.activeOrg,
    activeWorkbench: context.session.activeWorkbench,
    effectivePrincipal,
    entityCode: context.entityCode,
    recordId: context.recordId,
  };

  return {
    scopeKind: "principal_record",
    scopeKey: `document-edit-events:v1:${hashJson(payload)}`,
    ...(tenantId ? { tenantId } : {}),
    ...(planeKey ? { planeKey } : {}),
    ...(realmKey ? { realmKey } : {}),
    effectivePrincipal,
    entityCode: context.entityCode,
    recordId: context.recordId,
  };
}

export function publishDocumentEditRuntimeEvent(
  scope: DocumentEditRuntimeEventScope,
  input: {
    type: string;
    payload?: Record<string, unknown>;
    sourceTabId?: string;
  },
): DocumentEditRuntimeEvent {
  const event: DocumentEditRuntimeEvent = {
    id: createEventId(),
    type: input.type,
    timestamp: Date.now(),
    scopeKind: scope.scopeKind,
    entityCode: scope.entityCode,
    recordId: scope.recordId,
    payload: input.payload ?? {},
    originId: EVENT_ORIGIN_ID,
    ...(input.sourceTabId ? { sourceTabId: input.sourceTabId } : {}),
  };

  rememberLocalEvent(scope, event);
  deliverLocalEvent(scope, event);
  void publishRedisEvent(scope, event);

  return event;
}

export function subscribeDocumentEditRuntimeEvents(
  scope: DocumentEditRuntimeEventScope,
  subscriber: DocumentEditRuntimeEventSubscriber,
): () => void {
  const listeners = subscribers.get(scope.scopeKey) ?? new Set<DocumentEditRuntimeEventSubscriber>();
  listeners.add(subscriber);
  subscribers.set(scope.scopeKey, listeners);
  const redisSubscription = subscribeRedisEvents(scope, subscriber);

  return () => {
    listeners.delete(subscriber);
    if (listeners.size === 0) subscribers.delete(scope.scopeKey);
    void redisSubscription.then((unsubscribe) => unsubscribe()).catch(() => undefined);
  };
}

export async function readDocumentEditRuntimeEventBacklog(input: {
  scope: DocumentEditRuntimeEventScope;
  lastEventId: string | null;
  now?: number;
}): Promise<{ status: "ok"; events: DocumentEditRuntimeEvent[] } | { status: "stale"; events: [] }> {
  if (!input.lastEventId) return { status: "ok", events: [] };

  const ring = await readEventRing(input.scope);
  const index = ring.findIndex((event) => event.id === input.lastEventId);
  if (index >= 0) return { status: "ok", events: ring.slice(index + 1) };

  const newest = ring[ring.length - 1];
  if (!newest) return { status: "stale", events: [] };

  const now = input.now ?? Date.now();
  if (now - newest.timestamp <= DOCUMENT_EDIT_EVENT_CATCHUP_THRESHOLD_MS) {
    return { status: "ok", events: ring };
  }

  return { status: "stale", events: [] };
}

function rememberLocalEvent(
  scope: DocumentEditRuntimeEventScope,
  event: DocumentEditRuntimeEvent,
): void {
  const ring = eventRings.get(scope.scopeKey) ?? [];
  ring.push(event);
  while (ring.length > EVENT_RING_MAX) ring.shift();
  eventRings.set(scope.scopeKey, ring);
}

function deliverLocalEvent(
  scope: DocumentEditRuntimeEventScope,
  event: DocumentEditRuntimeEvent,
): void {
  const listeners = subscribers.get(scope.scopeKey);
  if (!listeners) return;
  for (const listener of listeners) listener(event);
}

async function publishRedisEvent(
  scope: DocumentEditRuntimeEventScope,
  event: DocumentEditRuntimeEvent,
): Promise<void> {
  const redis = await getEventRedisClient();
  if (!redis) return;
  try {
    const raw = JSON.stringify(event);
    await redis.rPush(redisRingKey(scope), raw);
    await redis.lTrim(redisRingKey(scope), -EVENT_RING_MAX, -1);
    await redis.expire(redisRingKey(scope), EVENT_REDIS_TTL_SECONDS);
    await redis.publish(redisChannelKey(scope), raw);
  } catch {
    // Local subscribers already received the event; Redis is a cross-instance
    // acceleration layer, not the source of truth for the transaction.
  }
}

async function subscribeRedisEvents(
  scope: DocumentEditRuntimeEventScope,
  subscriber: DocumentEditRuntimeEventSubscriber,
): Promise<() => void> {
  const redis = await getEventRedisClient();
  if (!redis) return () => {};
  const duplicate = redis.duplicate();
  try {
    await duplicate.connect();
    await duplicate.subscribe(redisChannelKey(scope), (raw) => {
      const event = parseEvent(raw);
      if (!event || event.originId === EVENT_ORIGIN_ID) return;
      rememberLocalEvent(scope, event);
      subscriber(event);
    });
    return () => {
      void duplicate.unsubscribe(redisChannelKey(scope)).finally(() => {
        void duplicate.quit().catch(() => duplicate.disconnect());
      });
    };
  } catch {
    void duplicate.disconnect();
    return () => {};
  }
}

async function readEventRing(scope: DocumentEditRuntimeEventScope): Promise<DocumentEditRuntimeEvent[]> {
  const local = eventRings.get(scope.scopeKey);
  if (local && local.length > 0) return local;

  const redis = await getEventRedisClient();
  if (!redis) return [];
  try {
    const rows = await redis.lRange(redisRingKey(scope), 0, -1);
    const events = rows.map(parseEvent).filter((event): event is DocumentEditRuntimeEvent => Boolean(event));
    if (events.length > 0) eventRings.set(scope.scopeKey, events.slice(-EVENT_RING_MAX));
    return events;
  } catch {
    return [];
  }
}

async function getEventRedisClient(): Promise<DocumentEditRedisClient | null> {
  try {
    return await createDocumentEditRedisClient({ logPrefix: "[document-edit/events/redis]" });
  } catch (error) {
    const now = Date.now();
    if (now - redisWarningLastAt > REDIS_WARNING_INTERVAL_MS) {
      redisWarningLastAt = now;
      console.warn("[document-edit/events] redis unavailable; using in-process event bus", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

function redisRingKey(scope: DocumentEditRuntimeEventScope): string {
  return `document-edit:events:ring:${scope.scopeKey}`;
}

function redisChannelKey(scope: DocumentEditRuntimeEventScope): string {
  return `document-edit:events:channel:${scope.scopeKey}`;
}

function parseEvent(raw: string): DocumentEditRuntimeEvent | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const event = value as Partial<DocumentEditRuntimeEvent>;
    if (typeof event.id !== "string" || typeof event.type !== "string") return null;
    if (typeof event.timestamp !== "number") return null;
    if (event.scopeKind !== "principal_record") return null;
    if (typeof event.entityCode !== "string" || typeof event.recordId !== "string") return null;
    return {
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      scopeKind: event.scopeKind,
      entityCode: event.entityCode,
      recordId: event.recordId,
      payload: event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? event.payload as Record<string, unknown>
        : {},
      ...(typeof event.originId === "string" ? { originId: event.originId } : {}),
      ...(typeof event.sourceTabId === "string" ? { sourceTabId: event.sourceTabId } : {}),
    };
  } catch {
    return null;
  }
}

function createEventId(): string {
  sequence = (sequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${Date.now().toString(36)}.${sequence.toString(36)}`;
}

function hashJson(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("base64url")
    .slice(0, 32);
}

function readRecordString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
