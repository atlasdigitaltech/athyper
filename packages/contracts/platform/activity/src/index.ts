import {
  parseCollectionState,
  COLLECTION_PROVIDERS,
  type CollectionState,
  type CollectionConfiguration,
} from "@athyper/contract-platform-collection";
export type ActivityKind = "notifications" | "inbox";
export interface ActivityQuery {
  /** Set by the trusted provider resolver, never accepted from request JSON. */
  searchFields?: readonly string[];
  collection?: CollectionState;
  timeZone: string;
  search: string;
  read: string;
  type: string;
  entity: string;
  from: string;
  to: string;
  status: string;
  priority: string;
  assignment: string;
  due: string;
  attention: boolean;
  group: string;
  sort: string;
  density: string;
}
export function defaultActivityQuery(
  kind: ActivityKind,
  timeZone = "UTC",
): ActivityQuery {
  return {
    timeZone,
    search: "",
    read: "all",
    type: "",
    entity: "",
    from: "",
    to: "",
    status: "active",
    priority: "all",
    assignment: "all",
    due: "all",
    attention: false,
    group: kind === "notifications" ? "date" : "due",
    sort: kind === "notifications" ? "newest" : "due",
    density: "comfortable",
  };
}
export function parseActivityQuery(
  kind: ActivityKind,
  input: unknown,
): ActivityQuery {
  if (typeof input === "string") {
    if (input.length > 16384) throw new Error("Activity query is too long");
    input = JSON.parse(input);
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Activity query must be an object");
  const result = defaultActivityQuery(kind),
    source = input as Record<string, unknown>;
  for (const key of Object.keys(source))
    if (key !== "collection" && !Object.hasOwn(result, key))
      throw new Error(`Unknown activity filter: ${key}`);
  for (const key of Object.keys(result) as (keyof ActivityQuery)[]) {
    if (key === "collection" || key === "searchFields") continue;
    const value = source[key];
    if (value === undefined) continue;
    if (key === "attention") {
      if (typeof value !== "boolean")
        throw new Error("Invalid attention filter");
      result.attention = value;
    } else {
      if (typeof value !== "string" || value.length > 200)
        throw new Error(`Invalid ${key} filter`);
      result[key] = value.trim();
    }
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: result.timeZone }).format();
  } catch {
    throw new Error("Invalid time zone");
  }
  if (source.collection !== undefined)
    result.collection = parseCollectionState(
      source.collection,
      COLLECTION_PROVIDERS.find(
        (p) => p.key === `platform.activity.${kind}.v1`,
      )!.fields,
    );
  const enums = {
    read: ["all", "read", "unread"],
    status: [
      "active",
      "all",
      "open",
      "claimed",
      "in_progress",
      "blocked",
      "completed",
      "cancelled",
    ],
    priority: ["all", "low", "normal", "high", "urgent"],
    assignment: ["all", "me", "team"],
    due: ["all", "overdue", "today", "upcoming", "none"],
    group:
      kind === "notifications"
        ? ["date", "type", "entity", "none"]
        : ["date", "due", "status", "priority", "entity", "none"],
    sort:
      kind === "notifications"
        ? ["newest", "oldest"]
        : ["due", "newest", "oldest"],
    density: ["comfortable", "compact", "spacious"],
  };
  for (const [key, values] of Object.entries(enums))
    if (!values.includes(String(result[key as keyof ActivityQuery])))
      throw new Error(`Invalid ${key} option`);
  for (const key of ["from", "to"] as const)
    if (
      result[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(result[key]) ||
        !Number.isFinite(Date.parse(result[key])) ||
        new Date(result[key]).toISOString().slice(0, 10) !== result[key])
    )
      throw new Error(`Invalid ${key} date`);
  if (result.from && result.to && result.from > result.to)
    throw new Error("Start date must be before end date");
  return result;
}
export function activityHref(kind: ActivityKind, query: ActivityQuery): string {
  return `/${kind}?activityQuery=${encodeURIComponent(JSON.stringify(query))}`;
}
export interface ActivityQueryRow {
  id: string;
  createdAt: string;
  title: string;
  summary?: string;
  recordLabel?: string;
  entity: string;
  type: string;
  unread?: boolean;
  status?: string;
  priority?: string;
  assignment?: string;
  dueAt?: string;
}
const human = (value: string) =>
  value.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
function dateInZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function dueBucket(row: ActivityQueryRow, now: string, timeZone: string) {
  if (!row.dueAt) return "none";
  if (Date.parse(row.dueAt) < Date.parse(now)) return "overdue";
  return dateInZone(row.dueAt, timeZone) === dateInZone(now, timeZone)
    ? "today"
    : "upcoming";
}
export function queryActivity<T>(input: {
  kind: ActivityKind;
  query: ActivityQuery;
  rows: readonly T[];
  project: (row: T) => ActivityQueryRow;
  limit: number;
  cursor?: string;
  scope: string;
  now?: string;
}) {
  const { kind, query: q, scope, limit } = input;
  const signature = JSON.stringify([scope, kind, q]);
  let now = input.now ?? new Date().toISOString(),
    after: string[] | undefined;
  if (input.cursor) {
    try {
      if (input.cursor.length > 8192) throw new Error();
      const c = JSON.parse(input.cursor);
      if (
        c.signature !== signature ||
        typeof c.now !== "string" ||
        !Number.isFinite(Date.parse(c.now)) ||
        !Array.isArray(c.after) ||
        c.after.length < 3 ||
        c.after.some((x: unknown) => typeof x !== "string")
      )
        throw new Error();
      now = c.now;
      after = c.after;
    } catch {
      throw new Error("Invalid activity cursor; refresh the list");
    }
  }
  const group = (r: ActivityQueryRow): [string, string] => {
    if (q.group === "none") return ["", ""];
    if (q.group === "due") {
      const b = dueBucket(r, now, q.timeZone);
      return [
        { overdue: "0", today: "1", upcoming: "2", none: "3" }[b],
        {
          overdue: "Overdue",
          today: "Due today",
          upcoming: "Upcoming",
          none: "No due date",
        }[b],
      ];
    }
    if (q.group === "date") {
      const date = dateInZone(r.createdAt, q.timeZone);
      return [
        q.sort === "oldest" ? date : invertDate(date),
        date === dateInZone(now, q.timeZone) ? "Today" : date,
      ];
    }
    const value =
      q.group === "type"
        ? r.type
        : q.group === "entity"
          ? r.entity
          : q.group === "status"
            ? r.status
            : r.priority;
    return [value ?? "", human(value || "Other")];
  };
  const candidates = input.rows
    .map((row) => ({ row, r: input.project(row) }))
    .filter(({ r }) => Date.parse(r.createdAt) <= Date.parse(now));
  const entities = [
    ...new Set(candidates.map(({ r }) => r.entity).filter(Boolean)),
  ].sort();
  const types = [
    ...new Set(candidates.map(({ r }) => r.type).filter(Boolean)),
  ].sort();
  const matches = candidates
    .filter(({ r }) => {
      if (q.collection)
        return matchesCollection(
          r,
          q.collection,
          now,
          q.timeZone,
          q.searchFields,
        );
      if (
        q.search &&
        ![r.title, r.summary, r.recordLabel]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(q.search.toLocaleLowerCase())
      )
        return false;
      if (
        (q.entity && r.entity !== q.entity) ||
        (q.type &&
          !(q.type === "mentions" ? /mention/.test(r.type) : r.type === q.type))
      )
        return false;
      if (
        (q.from && dateInZone(r.createdAt, q.timeZone) < q.from) ||
        (q.to && dateInZone(r.createdAt, q.timeZone) > q.to)
      )
        return false;
      if (kind === "notifications")
        return q.read === "all" || (q.read === "unread" ? r.unread : !r.unread);
      if (
        q.status === "active"
          ? !["open", "claimed", "in_progress", "blocked"].includes(
              r.status ?? "",
            )
          : q.status !== "all" && r.status !== q.status
      )
        return false;
      return (
        (q.priority === "all" || r.priority === q.priority) &&
        (q.assignment === "all" || r.assignment === q.assignment) &&
        (q.due === "all" || dueBucket(r, now, q.timeZone) === q.due) &&
        (!q.attention ||
          dueBucket(r, now, q.timeZone) === "overdue" ||
          ["high", "urgent"].includes(r.priority ?? ""))
      );
    })
    .map(({ row, r }) => {
      const [key, label] = group(r);
      if (q.collection) {
        const order = q.collection.sort.map((s) =>
          collectionOrder(r, s.field, s.direction),
        );
        return {
          row,
          groupLabel: label,
          key: [key, ...(order.length ? order : [""]), r.id],
        };
      }
      const order =
        q.sort === "due"
          ? r.dueAt
            ? new Date(r.dueAt).toISOString()
            : "9999"
          : q.sort === "oldest"
            ? new Date(r.createdAt).toISOString()
            : invertDate(new Date(r.createdAt).toISOString());
      return { row, groupLabel: label, key: [key, order, r.id] };
    });
  matches.sort((a, b) => compare(a.key, b.key));
  const remaining = after
    ? matches.filter((x) => compare(x.key, after!) > 0)
    : matches;
  const page = remaining.slice(0, limit),
    last = page.at(-1);
  return {
    data: page.map(({ row, groupLabel }) => ({ ...row, groupLabel })),
    matchingCount: matches.length,
    facets: { entities, types },
    viewScope: scope,
    ...(remaining.length > limit && last
      ? { nextCursor: JSON.stringify({ signature, now, after: last.key }) }
      : {}),
  };
}
function compare(a: string[], b: string[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return 0;
}
function invertDate(value: string) {
  return value.replace(/\d/g, (d) => String(9 - Number(d)));
}

/** Bridge the collection presentation state into the existing authorized Activity provider. */
export function collectionActivityQuery(
  kind: ActivityKind,
  state: CollectionState,
  timeZone = "UTC",
): ActivityQuery {
  const q = defaultActivityQuery(kind, timeZone);
  return {
    ...q,
    collection: state,
    search: state.query,
    density: state.density,
    group:
      state.group === "createdAt"
        ? "date"
        : state.group === "dueAt"
          ? "due"
          : (state.group ?? "none"),
    sort:
      state.sort[0]?.field === "createdAt"
        ? state.sort[0].direction === "asc"
          ? "oldest"
          : "newest"
        : "due",
  };
}
export function activityCollectionState(
  kind: ActivityKind,
  q: ActivityQuery,
  configuration: CollectionConfiguration,
): CollectionState {
  if (q.collection)
    return parseCollectionState(q.collection, configuration.fields);
  if (q.attention || q.type === "mentions")
    throw new TypeError("This legacy shortcut cannot be represented by the published filters. Select a current view.");
  const filters: CollectionState["filters"][number][] = [];
  for (const field of [
    "read",
    "type",
    "entity",
    "status",
    "priority",
    "assignment",
    "due",
  ] as const) {
    const value = q[field];
    if (
      !configuration.fields.some((f) => f.key === field) ||
      !value ||
      value === "all"
    )
      continue;
    if (field === "status" && value === "active")
      filters.push({
        field,
        operator: "in",
        value: ["open", "claimed", "in_progress", "blocked"],
      });
    else filters.push({ field, operator: "eq", value });
  }
  if (q.from)
    filters.push({ field: "createdAt", operator: "gte", value: q.from });
  if (q.to)
    filters.push({
      field: "createdAt",
      operator: "lte",
      value: q.to + "T23:59:59.999Z",
    });
  return parseCollectionState(
    {
      query: q.search,
      filters,
      sort: [
        {
          field: q.sort === "due" ? "dueAt" : "createdAt",
          direction: q.sort === "newest" ? "desc" : "asc",
        },
      ],
      group:
        q.group === "none"
          ? undefined
          : q.group === "date"
            ? "createdAt"
            : q.group,
      density: q.density,
    },
    configuration.fields,
  );
}
function collectionValue(
  r: ActivityQueryRow,
  field: string,
  now: string,
  zone: string,
): unknown {
  if (field === "read") return r.unread ? "unread" : "read";
  if (field === "due") return dueBucket(r, now, zone);
  return r[field as keyof ActivityQueryRow];
}
function matchesCollection(
  r: ActivityQueryRow,
  s: CollectionState,
  now: string,
  zone: string,
  searchFields: readonly string[] = ["title", "summary", "recordLabel"],
): boolean {
  if (
    s.query &&
    !searchFields
      .map((key) => r[key as keyof ActivityQueryRow])
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(s.query.toLowerCase())
  )
    return false;
  return s.filters.every((f) => {
    const actual = collectionValue(r, f.field, now, zone),
      value = f.value;
    if (f.operator === "contains")
      return String(actual ?? "")
        .toLowerCase()
        .includes(String(value).toLowerCase());
    if (f.operator === "in")
      return Array.isArray(value) && value.includes(actual as never);
    if (f.operator === "relative")
      return relativeActivityDate(
        String(actual ?? ""),
        String(value),
        now,
        zone,
      );
    if (f.field === "createdAt" || f.field === "dueAt") {
      if (!actual) return false;
      const a = Date.parse(String(actual)),
        b = Date.parse(String(value));
      return f.operator === "gte"
        ? a >= b
        : f.operator === "lte"
          ? a <= b
          : a === b;
    }
    return actual === value;
  });
}
function collectionOrder(
  r: ActivityQueryRow,
  field: string,
  direction: string,
): string {
  const raw =
    field === "priority"
      ? String(
          ["low", "normal", "high", "urgent"].indexOf(r.priority ?? "normal"),
        )
      : String(r[field as keyof ActivityQueryRow] ?? "9999");
  return direction === "asc" ? raw : invertDate(raw);
}
function relativeActivityDate(
  value: string,
  period: string,
  now: string,
  zone: string,
): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  const current = new Date(dateInZone(now, zone) + "T00:00:00Z"),
    date = dateInZone(value, zone);
  let start = new Date(current),
    end = new Date(current);
  end.setUTCDate(end.getUTCDate() + 1);
  const shift = (n: number) => {
    start.setUTCDate(start.getUTCDate() + n);
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
  };
  if (period === "yesterday") shift(-1);
  else if (period === "tomorrow") shift(1);
  else if (/^last_\d+_days$/.test(period))
    start.setUTCDate(start.getUTCDate() - Number(period.split("_")[1]));
  else if (/^next_\d+_days$/.test(period))
    end.setUTCDate(end.getUTCDate() + Number(period.split("_")[1]));
  else if (period === "this_week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
  } else if (period === "this_month" || period === "this_quarter") {
    start.setUTCDate(1);
    if (period === "this_quarter")
      start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3);
    end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + (period === "this_month" ? 1 : 3));
  } else if (["last_year", "this_year", "next_year"].includes(period)) {
    start = new Date(
      Date.UTC(
        current.getUTCFullYear() +
          (period === "last_year" ? -1 : period === "next_year" ? 1 : 0),
        0,
        1,
      ),
    );
    end = new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1));
  }
  return (
    date >= start.toISOString().slice(0, 10) &&
    date < end.toISOString().slice(0, 10)
  );
}

export interface ActivityCollectionSnapshot {
  configuration: CollectionConfiguration;
  releaseNo: number;
  releaseId: string;
  plane: string;
}
export interface ActivitySavedViews {
  views: readonly {
    id: string;
    name: string;
    scope: string;
    version: number;
    compatible: boolean;
    state: { schemaVersion: number; collection: CollectionState };
  }[];
  personalDefault?: string;
  sharedDefault?: string;
  createdId?: string;
  capabilities: {
    createShared: boolean;
    manageShared: boolean;
    setSharedDefault: boolean;
  };
}
