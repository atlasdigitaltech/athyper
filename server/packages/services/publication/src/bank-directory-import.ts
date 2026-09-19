import { createHash } from "node:crypto";
import type {
  BankDirectoryPayload,
  BankDirectoryRelease,
} from "@athyper/server-contract-publication";

export interface DirectoryIssue {
  readonly code: string;
  readonly record: string;
  readonly message: string;
  readonly candidates?: readonly string[];
}
export interface DirectoryImportReport {
  readonly valid: boolean;
  readonly issues: readonly DirectoryIssue[];
  readonly additions: readonly string[];
  readonly changes: readonly string[];
  readonly retirements: readonly string[];
  readonly deltas: readonly {
    readonly collection: string;
    readonly id: string;
    readonly before: unknown;
    readonly after: unknown;
  }[];
}
export interface DirectoryImport {
  readonly schema: "athyper.bank-directory-import/1";
  readonly sources: BankDirectoryRelease["sources"];
  readonly payload: BankDirectoryPayload;
  readonly resolutions?: Readonly<Record<string, string>>;
}
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function directoryId(key: string) {
  const h = hash(key);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const sourceKey = (source: string, id: string) =>
  JSON.stringify([source, id]);
const date = (s: unknown) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function normalizeBankDirectoryImport(
  value: unknown,
  prior: BankDirectoryPayload,
  countries: ReadonlySet<string>,
): {
  payload: BankDirectoryPayload;
  sources: BankDirectoryRelease["sources"];
  report: DirectoryImportReport;
} {
  if (
    !object(value) ||
    value.schema !== "athyper.bank-directory-import/1" ||
    !object(value.payload) ||
    !Array.isArray(value.sources) ||
    !value.sources.length
  )
    throw new TypeError("BANK_DIRECTORY_SOURCE_FORMAT_INVALID");
  if (
    Object.keys(value).some(
      (k) => !["schema", "sources", "payload", "resolutions"].includes(k),
    )
  )
    throw new TypeError("BANK_DIRECTORY_UNKNOWN_IMPORT_FIELD");
  if (value.resolutions !== undefined && !object(value.resolutions))
    throw new TypeError("BANK_DIRECTORY_RESOLUTIONS_INVALID");
  const raw = value.payload;
  if (
    Object.keys(raw).some(
      (k) =>
        !["institutions", "branches", "identifiers", "sourceRecords"].includes(
          k,
        ),
    )
  )
    throw new TypeError("BANK_DIRECTORY_UNKNOWN_COLLECTION");
  for (const key of [
    "institutions",
    "branches",
    "identifiers",
    "sourceRecords",
  ])
    if (
      !Array.isArray(raw[key]) ||
      raw[key].length > 50000 ||
      !(raw[key] as unknown[]).every(object)
    )
      throw new TypeError(`BANK_DIRECTORY_COLLECTION_INVALID:${key}`);
  if (
    value.sources.some(
      (s) =>
        !object(s) ||
        Object.keys(s).some(
          (k) => !["source", "version", "retrievedAt"].includes(k),
        ) ||
        typeof s.source !== "string" ||
        !s.source.trim() ||
        typeof s.version !== "string" ||
        !s.version.trim() ||
        typeof s.retrievedAt !== "string" ||
        !date(s.retrievedAt.slice(0, 10)) ||
        !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
          s.retrievedAt,
        ) ||
        !Number.isFinite(Date.parse(s.retrievedAt)),
    )
  )
    throw new TypeError("BANK_DIRECTORY_SOURCE_PROVENANCE_REQUIRED");
  const allowed: Record<string, string[]> = {
    institutions: [
      "id",
      "name",
      "countryCode",
      "institutionType",
      "status",
      "effectiveFrom",
      "effectiveUntil",
    ],
    branches: [
      "id",
      "institutionId",
      "name",
      "countryCode",
      "location",
      "status",
      "effectiveFrom",
      "effectiveUntil",
    ],
    identifiers: [
      "id",
      "institutionId",
      "branchId",
      "scheme",
      "schemeNamespace",
      "jurisdiction",
      "value",
      "effectiveFrom",
      "effectiveUntil",
    ],
    sourceRecords: ["source", "sourceRecordId", "institutionId", "branchId"],
  };
  for (const [collection, keys] of Object.entries(allowed))
    for (const row of raw[collection] as Record<string, unknown>[])
      if (Object.keys(row).some((k) => !keys.includes(k)))
        throw new TypeError(`BANK_DIRECTORY_UNKNOWN_FIELD:${collection}`);
  const required: Record<string, readonly string[]> = {
    institutions: [
      "id",
      "name",
      "countryCode",
      "institutionType",
      "status",
      "effectiveFrom",
    ],
    branches: [
      "id",
      "institutionId",
      "name",
      "countryCode",
      "status",
      "effectiveFrom",
    ],
    identifiers: [
      "id",
      "institutionId",
      "scheme",
      "schemeNamespace",
      "jurisdiction",
      "value",
      "effectiveFrom",
    ],
    sourceRecords: ["source", "sourceRecordId", "institutionId"],
  };
  for (const [collection, keys] of Object.entries(required))
    for (const row of raw[collection] as Record<string, unknown>[]) {
      if (
        keys.some(
          (k) => typeof row[k] !== "string" || !(row[k] as string).trim(),
        )
      )
        throw new TypeError(`BANK_DIRECTORY_REQUIRED_FIELD:${collection}`);
      if (
        row["branchId"] !== undefined &&
        (typeof row["branchId"] !== "string" || !row["branchId"].trim())
      )
        throw new TypeError(
          `BANK_DIRECTORY_BRANCH_REFERENCE_INVALID:${collection}`,
        );
    }
  const incoming = structuredClone(raw) as unknown as BankDirectoryPayload;
  const issues: DirectoryIssue[] = [],
    sources = value.sources as unknown as BankDirectoryRelease["sources"];
  const issue = (
    code: string,
    record: string,
    message: string,
    candidates?: string[],
  ) =>
    issues.push({
      code,
      record,
      message,
      ...(candidates ? { candidates } : {}),
    });
  const existingMap = new Map(
    prior.sourceRecords.map((r) => [sourceKey(r.source, r.sourceRecordId), r]),
  );
  const mappings = new Map<string, string>(),
    branchMappings = new Map<string, string>();
  const resolutions = object(value.resolutions) ? value.resolutions : {};
  const refs = incoming.sourceRecords;
  const routingKey = (r: BankDirectoryPayload["identifiers"][number]) =>
    JSON.stringify([
      r.scheme,
      r.schemeNamespace,
      String(r.jurisdiction).toUpperCase(),
      String(r.value).replace(/\s+/g, "").toUpperCase(),
    ]);
  const identityKey = (r: BankDirectoryPayload["identifiers"][number]) =>
    JSON.stringify([
      r.institutionId,
      r.branchId ?? null,
      routingKey(r),
      r.effectiveFrom,
    ]);
  const previousIdentifierIds = new Map(
    prior.identifiers.map((r) => [identityKey(r), r.id]),
  );
  function group<T>(items: readonly T[], key: (r: T) => string) {
    const m = new Map<string, T[]>();
    for (const r of items) {
      const k = key(r);
      const bucket = m.get(k) ?? [];
      bucket.push(r);
      m.set(k, bucket);
    }
    return m;
  }
  const routing = group(prior.identifiers, routingKey),
    incomingRouting = group(incoming.identifiers, (r) => r.institutionId);
  const institutionRefs = group(
      refs.filter((r) => !r.branchId),
      (r) => r.institutionId,
    ),
    branchRefs = group(
      refs.filter((r) => !!r.branchId),
      (r) => r.branchId!,
    );
  for (const collection of [
    incoming.institutions,
    incoming.branches,
    incoming.identifiers,
  ])
    if (new Set(collection.map((r) => r.id)).size !== collection.length)
      issue(
        "DUPLICATE_INPUT_ID",
        "payload",
        "Input record IDs must be unique within each collection",
      );
  if (new Set(sources.map((s) => s.source)).size !== sources.length)
    issue(
      "DUPLICATE_SOURCE",
      "sources",
      "A source must have one version per import",
    );
  if (
    new Set(refs.map((r) => sourceKey(r.source, r.sourceRecordId))).size !==
    refs.length
  )
    issue(
      "DUPLICATE_SOURCE_RECORD",
      "sourceRecords",
      "Source record keys must be unique",
    );
  for (const r of refs)
    if (
      !sources.some((s) => s.source === r.source) ||
      typeof r.sourceRecordId !== "string" ||
      !r.sourceRecordId.trim()
    )
      issue(
        "UNKNOWN_SOURCE",
        String(r.sourceRecordId),
        "Source record must belong to the supplied source manifest",
      );
  for (const entity of incoming.institutions) {
    const references = [...(institutionRefs.get(entity.id) ?? [])].sort(
      (a, b) =>
        sourceKey(a.source, a.sourceRecordId).localeCompare(
          sourceKey(b.source, b.sourceRecordId),
        ),
    );
    if (!references.length) {
      issue(
        "SOURCE_MAPPING_REQUIRED",
        entity.id,
        "Institution requires a source-record mapping",
      );
      continue;
    }
    const oldTargets = [
      ...new Set(
        references
          .map(
            (r) =>
              existingMap.get(sourceKey(r.source, r.sourceRecordId))
                ?.institutionId,
          )
          .filter((x): x is string => !!x),
      ),
    ];
    const candidates = [
      ...new Set(
        (incomingRouting.get(entity.id) ?? [])
          .filter((i) => !i.branchId)
          .flatMap((i) =>
            (routing.get(routingKey(i)) ?? []).map((p) => p.institutionId),
          ),
      ),
    ];
    const resolution =
      resolutions[
        sourceKey(references[0]!.source, references[0]!.sourceRecordId)
      ];
    let target = oldTargets[0];
    if (oldTargets.length > 1) {
      issue(
        "AMBIGUOUS_SOURCE_MAPPING",
        entity.id,
        "Source mappings identify different institutions",
        oldTargets,
      );
      continue;
    }
    if (typeof resolution === "string") {
      const resolved = prior.institutions.find((p) => p.id === resolution);
      if (
        !resolved ||
        resolved.countryCode !==
          String(entity.countryCode).trim().toUpperCase() ||
        (target && target !== resolution)
      ) {
        issue(
          "INVALID_RESOLUTION",
          entity.id,
          "Resolution must preserve existing mappings and country",
        );
        continue;
      }
      target = resolution;
    }
    if (!target && candidates.length) {
      issue(
        "REVIEW_REQUIRED",
        entity.id,
        "Existing routing identifiers require explicit identity resolution",
        candidates,
      );
      continue;
    }
    target ??= directoryId(
      sourceKey(references[0]!.source, references[0]!.sourceRecordId),
    );
    mappings.set(entity.id, target);
  }
  for (const branch of incoming.branches) {
    const ref = branchRefs.get(branch.id)?.[0];
    if (!ref) {
      issue(
        "SOURCE_MAPPING_REQUIRED",
        branch.id,
        "Branch requires a source-record mapping",
      );
      continue;
    }
    const parent = mappings.get(branch.institutionId);
    if (!parent) {
      issue("PARENT_UNRESOLVED", branch.id, "Resolve the institution first");
      continue;
    }
    const previous = existingMap.get(sourceKey(ref.source, ref.sourceRecordId));
    if (previous && (!previous.branchId || previous.institutionId !== parent)) {
      issue(
        "BRANCH_PARENT_CONFLICT",
        branch.id,
        "A stable branch cannot change institution",
      );
      continue;
    }
    branchMappings.set(
      branch.id,
      previous?.branchId ??
        directoryId(sourceKey(ref.source, ref.sourceRecordId)),
    );
  }
  const cleanRange = (
    r: { effectiveFrom: string; effectiveUntil?: string },
    id: string,
  ) => {
    if (
      !date(r.effectiveFrom) ||
      (r.effectiveUntil !== undefined &&
        (!date(r.effectiveUntil) || r.effectiveUntil <= r.effectiveFrom))
    )
      issue(
        "INVALID_EFFECTIVE_DATES",
        id,
        "Dates must be real ISO dates with an exclusive end after the start",
      );
  };
  const institutions = incoming.institutions.map((r) => {
    const row = {
      ...r,
      id: mappings.get(r.id) ?? r.id,
      name: String(r.name ?? "").trim(),
      countryCode: String(r.countryCode ?? "")
        .trim()
        .toUpperCase(),
    };
    cleanRange(row, row.id);
    if (
      !row.name ||
      !countries.has(row.countryCode) ||
      !["bank", "credit_union", "payment_institution", "other"].includes(
        row.institutionType,
      ) ||
      !["active", "retired"].includes(row.status)
    )
      issue(
        "INVALID_INSTITUTION",
        r.id,
        "Check name, country, institution type and lifecycle",
      );
    return row;
  });
  const branches = incoming.branches.map((r) => {
    const row = {
      ...r,
      id: branchMappings.get(r.id) ?? r.id,
      institutionId: mappings.get(r.institutionId) ?? r.institutionId,
      name: String(r.name ?? "").trim(),
      countryCode: String(r.countryCode ?? "")
        .trim()
        .toUpperCase(),
    };
    cleanRange(row, row.id);
    if (
      !row.name ||
      !countries.has(row.countryCode) ||
      !object(row.location) ||
      Object.values(row.location).some((v) => typeof v !== "string") ||
      !["active", "retired"].includes(row.status)
    )
      issue(
        "INVALID_BRANCH",
        r.id,
        "Check branch name, country, location and lifecycle",
      );
    return row;
  });
  const identifiers = incoming.identifiers.map((r) => {
    const row = {
      ...r,
      institutionId: mappings.get(r.institutionId) ?? r.institutionId,
      ...(r.branchId
        ? { branchId: branchMappings.get(r.branchId) ?? r.branchId }
        : {}),
      value: String(r.value ?? "")
        .replace(/\s+/g, "")
        .toUpperCase(),
      jurisdiction: String(r.jurisdiction ?? "")
        .trim()
        .toUpperCase(),
    };
    cleanRange(row, r.id);
    if (
      ![
        "bic",
        "national_bank_code",
        "national_branch_code",
        "clearing_member_id",
      ].includes(row.scheme) ||
      !row.schemeNamespace ||
      !row.value ||
      !countries.has(row.jurisdiction) ||
      !mappings.has(r.institutionId) ||
      (r.branchId && !branchMappings.has(r.branchId))
    )
      issue(
        "INVALID_IDENTIFIER",
        r.id,
        "Check identifier scheme, jurisdiction and target",
      );
    if (
      row.scheme === "bic" &&
      (!/^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(row.value) ||
        row.value.slice(4, 6) !== row.jurisdiction ||
        row.schemeNamespace !== "iso9362")
    )
      issue(
        "INVALID_BIC",
        r.id,
        "BIC format, country and namespace must agree",
      );
    return {
      ...row,
      id:
        previousIdentifierIds.get(identityKey(row)) ??
        directoryId(identityKey(row)),
    };
  });
  const sourceRecords = refs.map((r) => ({
    ...r,
    institutionId: mappings.get(r.institutionId) ?? r.institutionId,
    ...(r.branchId
      ? { branchId: branchMappings.get(r.branchId) ?? r.branchId }
      : {}),
  }));
  const additions: string[] = [],
    changes: string[] = [],
    retirements: string[] = [];
  const deltas: {
    collection: string;
    id: string;
    before: unknown;
    after: unknown;
  }[] = [];
  function merge<T extends { id: string }>(
    collection: string,
    before: readonly T[],
    after: readonly T[],
  ) {
    const all = new Map(before.map((r) => [r.id, r])),
      seen = new Set<string>();
    for (const row of after) {
      if (seen.has(row.id))
        issue(
          "DUPLICATE_RESOLVED_ID",
          row.id,
          "Multiple input records resolve to the same identity; consolidate them before approval",
        );
      seen.add(row.id);
      const old = all.get(row.id);
      if (!old) {
        additions.push(row.id);
        deltas.push({ collection, id: row.id, before: null, after: row });
      } else if (
        JSON.stringify(canonical(old)) !== JSON.stringify(canonical(row))
      ) {
        changes.push(row.id);
        deltas.push({ collection, id: row.id, before: old, after: row });
      }
      if (
        (row as { status?: string }).status === "retired" &&
        (old as { status?: string } | undefined)?.status !== "retired"
      )
        retirements.push(row.id);
      all.set(row.id, row);
    }
    return [...all.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  const payload = {
    institutions: merge("institutions", prior.institutions, institutions),
    branches: merge("branches", prior.branches, branches),
    identifiers: merge("identifiers", prior.identifiers, identifiers),
    sourceRecords: [
      ...new Map(
        [...prior.sourceRecords, ...sourceRecords].map((r) => [
          sourceKey(r.source, r.sourceRecordId),
          r,
        ]),
      ).values(),
    ].sort((a, b) =>
      sourceKey(a.source, a.sourceRecordId).localeCompare(
        sourceKey(b.source, b.sourceRecordId),
      ),
    ),
  };
  for (const records of group(payload.identifiers, routingKey).values()) {
    records.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    let end = "";
    for (const r of records) {
      if (r.effectiveFrom < end)
        issue("IDENTIFIER_CONFLICT", r.id, "Identifier assignments overlap");
      end =
        end > (r.effectiveUntil ?? "9999-12-31")
          ? end
          : (r.effectiveUntil ?? "9999-12-31");
    }
  }
  const institutionIds = new Set(payload.institutions.map((i) => i.id));
  for (const branch of payload.branches)
    if (!institutionIds.has(branch.institutionId))
      issue(
        "INVALID_BRANCH_PARENT",
        branch.id,
        "Branch institution is missing",
      );
  const targets = new Map(payload.branches.map((b) => [b.id, b.institutionId]));
  for (const r of [...payload.identifiers, ...payload.sourceRecords])
    if (r.branchId && targets.get(r.branchId) !== r.institutionId)
      issue(
        "BRANCH_PARENT_CONFLICT",
        r.branchId,
        "Branch must belong to the selected institution",
      );
  return {
    payload,
    sources,
    report: {
      valid: issues.length === 0,
      issues,
      additions,
      changes,
      retirements,
      deltas,
    },
  };
}
