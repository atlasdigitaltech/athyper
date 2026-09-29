import type { ActivityView } from "@athyper/contract-platform-entity-runtime";
import { resolveActivityDateRange, type ActivityDateRange } from "@athyper/contract-platform-entity-runtime";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type {
  ActivityAuditItem,
  ActivityTimelineItem,
  ActivityEventFilters,
  ActivityCollectionComparisonResult,
  ActivityCollectionSnapshot,
  ActivityCollectionPage,
  ActivityVersionItem,
  ActivityComparison,
  ActivityDescription,
  ActivityPage,
  ActivitySnapshot,
  ActivitySnapshotItem,
} from "@athyper/contract-platform-entity-runtime";
import type {
  EntityActivityRequest,
  createEntityActivityPolicy,
} from "./entity-activity-policy.js";
import { EntityCapabilityPolicyError } from "./entity-capability-policy.js";

export class EntityActivityError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
export type ActivitySubject = Pick<
  EntityActivityRequest,
  "context" | "entityCode" | "recordId"
>;
export type ActivityAdmission = Awaited<
  ReturnType<ReturnType<typeof createEntityActivityPolicy>["resolve"]>
>;
export interface ActivityWindow {
  readonly from: string;
  readonly until: string;
  readonly after?: { readonly at: string; readonly id: string };
  readonly limit: number;
  readonly filters?: ActivityEventFilters;
}
export interface EntityActivityProvider {
  timeline?(input:ActivitySubject,admission:ActivityAdmission,page:ActivityWindow):Promise<readonly ActivityTimelineItem[]>;
  collection?(input: ActivitySubject, admission: ActivityAdmission, snapshotId: string, key: string): Promise<ActivityCollectionSnapshot>;
  compareCollection?(input: ActivitySubject, admission: ActivityAdmission, from: string, to: string, key: string): Promise<ActivityCollectionComparisonResult>;
  versions?(
    input: ActivitySubject,
    admission: ActivityAdmission,
    page: ActivityWindow,
  ): Promise<readonly ActivityVersionItem[]>;
  audit(
    input: ActivitySubject,
    admission: ActivityAdmission,
    page: ActivityWindow,
  ): Promise<readonly ActivityAuditItem[]>;
  snapshots(
    input: ActivitySubject,
    admission: ActivityAdmission,
    page: ActivityWindow,
  ): Promise<readonly ActivitySnapshotItem[]>;
  snapshot(
    input: ActivitySubject,
    admission: ActivityAdmission,
    id: string,
  ): Promise<ActivitySnapshot>;
  compare(
    input: ActivitySubject,
    admission: ActivityAdmission,
    from: string,
    to: string,
  ): Promise<ActivityComparison>;
  capture(
    input: ActivitySubject,
    admission: ActivityAdmission,
    key: string,
  ): Promise<{ readonly id: string; readonly replayed: boolean }>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createEntityActivityService(options: {
  policy: ReturnType<typeof createEntityActivityPolicy>;
  provider(): EntityActivityProvider | undefined;
  cursorKey?: Uint8Array;
  now?: () => Date;
}) {
  const secret = options.cursorKey ?? randomBytes(32);
  if (secret.length < 32) throw Error("ACTIVITY_CURSOR_KEY_TOO_SHORT");
  const now = () => (options.now?.() ?? new Date()).toISOString();
  const provider = () => {
    const value = options.provider();
    if (!value)
      throw new EntityActivityError(503, "ACTIVITY_PROVIDER_UNAVAILABLE");
    return value;
  };
  const check = (input: ActivitySubject) => {
    if (
      !uuid.test(input.recordId) ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(input.entityCode)
    )
      throw new EntityActivityError(400, "ACTIVITY_INPUT_INVALID");
  };
  async function admit(
    input: ActivitySubject,
    action: string,
    idempotencyKey?: string,
  ) {
    check(input);
    return options.policy.resolve({ ...input, action, idempotencyKey });
  }
  function sign(body: string) {
    return createHmac("sha256", secret).update(body).digest("base64url");
  }
  function encode(value: unknown) {
    const body = Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${body}.${sign(body)}`;
  }
  function decode(cursor: string): any {
    try {
      if (cursor.length > 4096) throw Error();
      const [body, mac, ...extra] = cursor.split(".");
      if (!body || !mac || extra.length) throw Error();
      const expected = Buffer.from(sign(body));
      const received = Buffer.from(mac);
      if (
        expected.length !== received.length ||
        !timingSafeEqual(expected, received)
      )
        throw Error();
      return JSON.parse(Buffer.from(body, "base64url").toString());
    } catch {
      throw new EntityActivityError(400, "ACTIVITY_CURSOR_INVALID");
    }
  }
  async function page(
    input: ActivitySubject & {
      view: "timeline" | "auditLog" | "versions" | "snapshots";
      days?: number;
      range?: ActivityDateRange;
      filters?: ActivityEventFilters;
      cursor?: string;
    },
  ): Promise<
    ActivityPage<ActivityAuditItem | ActivityVersionItem | ActivitySnapshotItem>
  > {
    const admission = await admit(
      input,
      input.view === "timeline" ? "timeline_query" : input.view === "auditLog"
        ? "audit_query"
        : input.view === "versions"
          ? "versions_read"
          : "snapshots_read",
    );
    const filters=input.filters ?? {};
    if(Object.keys(filters).some(key=>!["event","actor","outcome"].includes(key)) ||
      (Object.keys(filters).length && !["auditLog","timeline"].includes(input.view)) ||
      (filters.event!==undefined && (typeof filters.event!=="string" || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(filters.event))) ||
      (filters.actor!==undefined && !uuid.test(filters.actor)) ||
      (filters.outcome!==undefined && !["success","failure","denied"].includes(filters.outcome))) throw new EntityActivityError(400,"ACTIVITY_FILTER_INVALID");
    const days = input.days ?? admission.binding.query.defaultRangeDays;
    if (
      !Number.isInteger(days) ||
      days < 1 ||
      days > admission.binding.query.maxRangeDays
    )
      throw new EntityActivityError(400, "ACTIVITY_RANGE_INVALID");
    const binding = createHash("sha256")
      .update(
        JSON.stringify([
          input.context.tenantId,
          input.context.principalId,
          input.context.planeKey,
          input.context.authEpoch,
          input.context.profileHash,
          input.entityCode,
          input.recordId,
          admission.releaseHash,
          input.view,
          days,
          input.range ?? null,
          [filters.event??null,filters.actor??null,filters.outcome??null],
          admission.projection.actions.map(action=>action.key).sort(),
        ]),
      )
      .digest("hex");
    const cursor = input.cursor ? decode(input.cursor) : undefined;
    if (
      cursor &&
      (cursor.binding !== binding ||
        typeof cursor.until !== "string" ||
        typeof cursor.from !== "string" ||
        !cursor.after ||
        !(input.view === "timeline" ? /^(audit|snapshot|version):[0-9a-f-]{36}$/i.test(cursor.after.id) : uuid.test(cursor.after.id)) ||
        typeof cursor.after.at !== "string" ||
        (!Number.isFinite(Date.parse(cursor.expires)) || Date.parse(cursor.expires) < Date.parse(now())))
    )
      throw new EntityActivityError(400, "ACTIVITY_CURSOR_INVALID");
    let resolved: {from:string;until:string} | undefined;
    try {
      if(input.range && !cursor) resolved=resolveActivityDateRange(input.range,days,admission.binding.query.maxRangeDays,new Date(now()));
    } catch { throw new EntityActivityError(400,"ACTIVITY_RANGE_INVALID"); }
    const until = cursor?.until ?? resolved?.until ?? now();
    const from =
      cursor?.from ?? resolved?.from ??
      new Date(Date.parse(until) - days * 86400000).toISOString();
    const size = admission.binding.query.pageSize;
    const window = { from, until, after: cursor?.after, limit: size + 1, filters };
    if(input.view === "timeline" && !provider().timeline)throw new EntityActivityError(503,"ACTIVITY_TIMELINE_UNAVAILABLE");
    if (input.view === "versions" && !provider().versions)
      throw new EntityActivityError(503, "ACTIVITY_VERSIONS_UNAVAILABLE");
    const rows =
      input.view === "timeline" ? await provider().timeline!(input,admission,window) : input.view === "auditLog"
        ? await provider().audit(input, admission, window)
        : input.view === "versions"
          ? await provider().versions!(input, admission, window)
          : await provider().snapshots(input, admission, window);
    const items = rows.slice(0, size),
      last = items.at(-1);
    return {
      items,
      releaseHash: admission.releaseHash,
      ...(rows.length > size && last
        ? {
            nextCursor: encode({
              binding,
              from,
              until,
              expires:
                cursor?.expires ??
                new Date(Date.parse(now()) + 3600000).toISOString(),
              after: {
                at: "occurredAt" in last ? last.occurredAt : last.capturedAt,
                id: last.id,
              },
            }),
          }
        : {}),
    };
  }
  async function collectionPage(input: ActivitySubject & { key: string; id?: string; from?: string; to?: string; cursor?: string }, compare: boolean): Promise<ActivityCollectionPage<ActivityCollectionSnapshot | ActivityCollectionComparisonResult>> {
    if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(input.key) || (compare ? !uuid.test(input.from ?? "") || !uuid.test(input.to ?? "") || input.from === input.to : !uuid.test(input.id ?? ""))) throw new EntityActivityError(400,"ACTIVITY_INPUT_INVALID");
    const admission = await admit(input,compare ? "snapshots_compare" : "snapshots_read");
    if (!admission.binding.collections?.some(item => item.definition.key === input.key)) throw new EntityActivityError(404,"ACTIVITY_COLLECTION_UNAVAILABLE");
    const p=provider();
    if (compare ? !p.compareCollection : !p.collection) throw new EntityActivityError(503,"ACTIVITY_COLLECTION_PROVIDER_UNAVAILABLE");
    // Reauthorize and compute the complete bounded projection BEFORE slicing it.
    const result = compare ? await p.compareCollection!(input,admission,input.from!,input.to!,input.key) : await p.collection!(input,admission,input.id!,input.key);
    const binding = createHash("sha256").update(JSON.stringify(["collection-v1",input.context.tenantId,input.context.principalId,input.context.planeKey,input.context.authEpoch,input.context.profileHash,input.entityCode,input.recordId,admission.releaseHash,compare,input.key,input.id,input.from,input.to,result])).digest("hex");
    const cursor=input.cursor ? decode(input.cursor) : undefined;
    if(cursor && (cursor.binding!==binding || !Number.isSafeInteger(cursor.offset) || cursor.offset<0 || cursor.offset>=result.items.length || !Number.isFinite(Date.parse(cursor.expires)) || Date.parse(cursor.expires)<=Date.parse(now()))) throw new EntityActivityError(400,"ACTIVITY_CURSOR_INVALID");
    const offset=cursor?.offset ?? 0, size=admission.binding.query.pageSize;
    const items=result.items.slice(offset,offset+size);
    return {...result,items,totalItems:result.items.length,releaseHash:admission.releaseHash,
      ...(offset+size<result.items.length ? {nextCursor:encode({binding,offset:offset+size,expires:cursor?.expires ?? new Date(Date.parse(now())+3600000).toISOString()})} : {})} as ActivityCollectionPage<ActivityCollectionSnapshot | ActivityCollectionComparisonResult>;
  }
  return {
    async describe(
      input: ActivitySubject,
    ): Promise<ActivityDescription | null> {
      check(input);
      if (!options.provider()) return null;
      for (const action of ["timeline_query", "audit_query", "versions_read", "snapshots_read"])
        try {
          const a = await admit(input, action);
          const views = a.projection.views.filter(
            (view) => (view !== "versions" || Boolean(provider().versions)) && (view !== "timeline" || Boolean(provider().timeline)),
          );
          if (!views.length) continue;
          const maxRangeDays=a.binding.query.maxRangeDays;
          return {
            views,
            defaultView:
              (!a.projection.defaultView || !views.includes(a.projection.defaultView))
                ? views[0]
                : a.projection.defaultView,
            canCapture: a.projection.actions.some(
              (action) => action.key === "snapshots_capture",
            ),
            releaseHash: a.releaseHash,
            maxRangeDays,
            defaultRangeDays: Math.min(a.binding.query.defaultRangeDays,maxRangeDays),
            supportsCalendarRanges: true,
          };
        } catch (error) {
          if (!(error instanceof EntityCapabilityPolicyError)) throw error;
        }
      return null;
    },
    page,
    collection: (input: ActivitySubject & {key:string; id:string; cursor?:string}) => collectionPage(input,false),
    compareCollection: (input: ActivitySubject & {key:string; from:string; to:string; cursor?:string}) => collectionPage(input,true),
    async snapshot(input: ActivitySubject & { id: string }) {
      if (!uuid.test(input.id))
        throw new EntityActivityError(400, "ACTIVITY_INPUT_INVALID");
      return provider().snapshot(
        input,
        await admit(input, "snapshots_read"),
        input.id,
      );
    },
    async compare(input: ActivitySubject & { from: string; to: string }) {
      if (!uuid.test(input.from) || !uuid.test(input.to) || input.from === input.to)
        throw new EntityActivityError(400, "ACTIVITY_INPUT_INVALID");
      return provider().compare(
        input,
        await admit(input, "snapshots_compare"),
        input.from,
        input.to,
      );
    },
    async capture(input: ActivitySubject & { idempotencyKey: string }) {
      const a = await admit(input, "snapshots_capture", input.idempotencyKey);
      return provider().capture(input, a, input.idempotencyKey);
    },
  };
}
