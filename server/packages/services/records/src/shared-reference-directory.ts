import { sql, type Kysely } from "kysely";
import {
  isSharedReferenceSourceKey as isContractSharedReferenceSourceKey,
  sharedReferenceSourceKeys,
  type SharedReferenceChoice,
  type SharedReferenceDirectory,
  type SharedReferenceFilterName,
  type SharedReferenceLookupInput,
  type SharedReferenceLookupPage,
  type SharedReferenceSourceKey,
} from "@athyper/server-contract-master-data";

export { sharedReferenceSourceKeys } from "@athyper/server-contract-master-data";
export type {
  SharedReferenceChoice,
  SharedReferenceDirectory,
  SharedReferenceLookupInput,
  SharedReferenceLookupPage,
  SharedReferenceSourceKey,
} from "@athyper/server-contract-master-data";

/** Collect a bounded set for metadata-backed select filters. Large directories must use search. */
export async function sharedReferenceFilterChoices(directory: SharedReferenceDirectory, sourceKey: SharedReferenceSourceKey, maximum = 500): Promise<readonly { value: string; label: string }[]> {
  const choices: { value: string; label: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await directory.lookup({ sourceKey, limit: 100, ...(cursor ? { cursor } : {}) });
    choices.push(...page.items.map(({ value, label }) => ({ value, label })));
    if (choices.length > maximum) throw new Error("ENTITY_FILTER_CHOICES_REQUIRES_SEARCH");
    cursor = page.nextCursor;
  } while (cursor);
  return choices;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SourceDefinition = Readonly<{
  readonly allowedFilters: readonly SharedReferenceFilterName[];
  readonly storedValue: "code" | "uuid";
  readonly recordIdentity: "uuid";
}>;

/**
 * The registry is the source-of-truth for lookup identity and admitted
 * dependencies. SQL never receives a client-selected table or column name.
 */
export const sharedReferenceDefinitions: Readonly<
  Record<SharedReferenceSourceKey, SourceDefinition>
> = Object.freeze({
  "iso.country": { storedValue: "code", recordIdentity: "uuid", allowedFilters: [] },
  "shared.country": { storedValue: "code", recordIdentity: "uuid", allowedFilters: [] },
  "iso.currency": { storedValue: "code", recordIdentity: "uuid", allowedFilters: [] },
  "shared.currency": { storedValue: "code", recordIdentity: "uuid", allowedFilters: [] },
  "shared.language": { storedValue: "code", recordIdentity: "uuid", allowedFilters: [] },
  "shared.locale": { storedValue: "code", recordIdentity: "uuid", allowedFilters: ["languageCode", "countryCode"] },
  "shared.timezone": { storedValue: "code", recordIdentity: "uuid", allowedFilters: [] },
  "shared.uom": { storedValue: "code", recordIdentity: "uuid", allowedFilters: ["quantityType"] },
  // State is stored as its ISO subdivision code and is only unambiguous with country.
  "shared.state_region": { storedValue: "code", recordIdentity: "uuid", allowedFilters: ["countryCode"] },
  "shared.classification_scheme": { storedValue: "code", recordIdentity: "uuid", allowedFilters: ["schemeKind"] },
  "shared.commodity_code": { storedValue: "uuid", recordIdentity: "uuid", allowedFilters: ["domainCode"] },
  "shared.industry_code": { storedValue: "uuid", recordIdentity: "uuid", allowedFilters: ["domainCode"] },
  "shared.commodity_crosswalk": { storedValue: "uuid", recordIdentity: "uuid", allowedFilters: ["sourceDomainCode", "targetDomainCode"] },
  "shared.industry_crosswalk": { storedValue: "uuid", recordIdentity: "uuid", allowedFilters: ["sourceDomainCode", "targetDomainCode"] },
  "shared.bank_institution": { storedValue: "uuid", recordIdentity: "uuid", allowedFilters: ["countryCode"] },
  "shared.bank_branch": { storedValue: "uuid", recordIdentity: "uuid", allowedFilters: ["institutionId", "countryCode"] },
  "shared.bank_identifier": { storedValue: "uuid", recordIdentity: "uuid", allowedFilters: ["institutionId", "branchId", "jurisdiction", "scheme"] },
});

type Cursor = Readonly<{
  sourceKey: SharedReferenceSourceKey;
  scope: string;
  sort: readonly string[];
}>;

type Row = Readonly<{
  id: string;
  value: string;
  label: string;
  sort_1: string;
  sort_2: string;
  data?: Record<string, string>;
}>;

function encoded(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
function decoded(value: string): Cursor {
  try {
    const raw = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      !isSourceKey(raw.sourceKey) ||
      typeof raw.scope !== "string" ||
      !Array.isArray(raw.sort) ||
      raw.sort.length !== 2 ||
      raw.sort.some((item) => typeof item !== "string" || item.length > 512)
    ) throw new Error();
    return { sourceKey: raw.sourceKey, scope: raw.scope, sort: raw.sort as string[] };
  } catch {
    throw Error("REFERENCE_LOOKUP_CURSOR_INVALID");
  }
}
export function isSharedReferenceSourceKey(value: string): value is SharedReferenceSourceKey {
  return isContractSharedReferenceSourceKey(value);
}
/** A dependent source has no safe unscoped initial catalogue. */
export function requiresSharedReferenceDependency(sourceKey: SharedReferenceSourceKey): boolean {
  return [
    "shared.state_region",
    "shared.commodity_code",
    "shared.industry_code",
    "shared.commodity_crosswalk",
    "shared.industry_crosswalk",
    "shared.bank_branch",
    "shared.bank_identifier",
  ].includes(sourceKey);
}
function isSourceKey(value: unknown): value is SharedReferenceSourceKey {
  return isContractSharedReferenceSourceKey(value);
}
/** Validates the public contract before a source-specific query is constructed. */
export function normalizeSharedReferenceLookup(input: SharedReferenceLookupInput) {
  if (!isSourceKey(input.sourceKey)) throw Error("REFERENCE_LOOKUP_SOURCE_UNREGISTERED");
  const definition = sharedReferenceDefinitions[input.sourceKey]!;
  const query = input.query?.trim() ?? "";
  if (query.length > 120) throw Error("REFERENCE_LOOKUP_QUERY_INVALID");
  const limit = input.limit ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE)
    throw Error("REFERENCE_LOOKUP_PAGE_SIZE_INVALID");
  const filters = (input.filters ?? {}) as Readonly<Record<string, string | undefined>>;
  if (
    Object.keys(filters).some(
      (key) =>
        !definition.allowedFilters.includes(key as SharedReferenceFilterName) ||
        typeof filters[key] !== "string" ||
        !filters[key]!.trim() ||
        filters[key]!.length > 128,
    )
  ) throw Error("REFERENCE_LOOKUP_FILTER_INVALID");
  if (input.value !== undefined) {
    if (!input.value.trim() || input.value.length > 256 || query || input.cursor)
      throw Error("REFERENCE_LOOKUP_RESOLUTION_INVALID");
    if (definition.storedValue === "uuid" && !UUID.test(input.value))
      throw Error("REFERENCE_LOOKUP_VALUE_INVALID");
    if (definition.storedValue === "code" && UUID.test(input.value))
      throw Error("REFERENCE_LOOKUP_VALUE_INVALID");
  }
  // A subdivision code is only meaningful within its country. The same rule
  // applies to bank descendants: selection starts from their declared parent.
  // Exact historical resolution remains possible because an already-stored
  // identity does not need to be offered as a new selectable choice.
  if (!input.value && input.sourceKey === "shared.state_region" && !filters.countryCode)
    throw Error("REFERENCE_LOOKUP_DEPENDENCY_REQUIRED");
  if (!input.value && input.sourceKey === "shared.bank_branch" && !filters.institutionId)
    throw Error("REFERENCE_LOOKUP_DEPENDENCY_REQUIRED");
  if (!input.value && input.sourceKey === "shared.bank_identifier" && !filters.institutionId)
    throw Error("REFERENCE_LOOKUP_DEPENDENCY_REQUIRED");
  if (
    !input.value &&
    (input.sourceKey === "shared.commodity_code" || input.sourceKey === "shared.industry_code") &&
    !filters.domainCode
  ) throw Error("REFERENCE_LOOKUP_DEPENDENCY_REQUIRED");
  if (
    !input.value &&
    (input.sourceKey === "shared.commodity_crosswalk" || input.sourceKey === "shared.industry_crosswalk") &&
    (!filters.sourceDomainCode || !filters.targetDomainCode)
  ) throw Error("REFERENCE_LOOKUP_DEPENDENCY_REQUIRED");
  const scope = JSON.stringify(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)));
  const cursor = input.cursor ? decoded(input.cursor) : undefined;
  if (cursor && (cursor.sourceKey !== input.sourceKey || cursor.scope !== scope))
    throw Error("REFERENCE_LOOKUP_CURSOR_SCOPE_INVALID");
  return { definition, query, limit, filters, scope, cursor, value: input.value };
}
export function toSharedReferenceLookupPage(sourceKey: SharedReferenceSourceKey, scope: string, rows: readonly Row[], limit: number): SharedReferenceLookupPage {
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  const items: SharedReferenceChoice[] = visible.map((row) => ({
    value: row.value,
    recordId: row.id,
    label: row.label,
    ...(row.data && Object.keys(row.data).length ? { data: row.data } : {}),
  }));
  return {
    sourceKey,
    items,
    ...(rows.length > limit && last
      ? { nextCursor: encoded({ sourceKey, scope, sort: [last.sort_1, last.sort_2] }) }
      : {}),
  };
}
const term = (query: string) => `%${query.replace(/[\\%_]/g, "\\$&")}%`;
const active = (value: string | undefined) => value ? sql`true` : sql`status='active'`;
const bankActive = sql`status='active' AND effective_from<=CURRENT_DATE AND (effective_until IS NULL OR effective_until>CURRENT_DATE)`;
const after = (cursor: Cursor | undefined, first: string, second: string) =>
  cursor ? sql`AND (${sql.ref(first)},${sql.ref(second)})>(${cursor.sort[0]},${cursor.sort[1]})` : sql``;

/** Read-only shared-reference directory. Callers must already have access to their form/surface. */
export function createSharedReferenceDirectory(database: Kysely<any>): SharedReferenceDirectory {
  return {
    async lookup(input) {
      const { query, limit, filters, scope, cursor, value } = normalizeSharedReferenceLookup(input);
      const search = term(query);
      const take = limit + 1;
      let rows: readonly Row[];
      switch (input.sourceKey) {
        case "iso.country":
        case "shared.country":
          rows = (await sql<Row>`SELECT id::text,code::text value,name label,name sort_1,code::text sort_2,
            jsonb_build_object('regionLabel',region_label,'postalLabel',postal_code_label,'postalPattern',COALESCE(postal_code_pattern,''),'postalExample',COALESCE(postal_code_example,''),'postalHelp',CASE WHEN has_postal_codes THEN COALESCE('Example: '||postal_code_example,'') ELSE 'Postal codes are not used for this country.' END) data
            FROM shared.country WHERE ${active(value)} AND (${value ?? null}::text IS NULL OR code=${value ?? null}) AND (${query}='' OR code ILIKE ${search} ESCAPE '\\' OR name ILIKE ${search} ESCAPE '\\') ${after(cursor,'name','code')} ORDER BY name,code LIMIT ${take}`.execute(database)).rows;
          break;
        case "iso.currency":
        case "shared.currency":
          rows = (await sql<Row>`SELECT id::text,code::text value,name label,name sort_1,code::text sort_2 FROM shared.currency WHERE ${active(value)} AND (${value ?? null}::text IS NULL OR code=${value ?? null}) AND (${query}='' OR code ILIKE ${search} ESCAPE '\\' OR name ILIKE ${search} ESCAPE '\\') ${after(cursor,'name','code')} ORDER BY name,code LIMIT ${take}`.execute(database)).rows;
          break;
        case "shared.language":
          rows = (await sql<Row>`SELECT id::text,code value,name label,name sort_1,code sort_2 FROM shared.language WHERE ${active(value)} AND (${value ?? null}::text IS NULL OR code=${value ?? null}) AND (${query}='' OR code ILIKE ${search} ESCAPE '\\' OR name ILIKE ${search} ESCAPE '\\') ${after(cursor,'name','code')} ORDER BY name,code LIMIT ${take}`.execute(database)).rows;
          break;
        case "shared.locale":
          rows = (await sql<Row>`SELECT id::text,code value,name label,name sort_1,code sort_2 FROM shared.locale WHERE ${active(value)} AND (${value ?? null}::text IS NULL OR code=${value ?? null}) AND (${filters.languageCode ?? null}::text IS NULL OR language_code=${filters.languageCode ?? null}) AND (${filters.countryCode ?? null}::text IS NULL OR country_code=${filters.countryCode ?? null}) AND (${query}='' OR code ILIKE ${search} ESCAPE '\\' OR name ILIKE ${search} ESCAPE '\\') ${after(cursor,'name','code')} ORDER BY name,code LIMIT ${take}`.execute(database)).rows;
          break;
        case "shared.timezone":
          rows = (await sql<Row>`SELECT id::text,code value,COALESCE(name,code) label,code sort_1,id::text sort_2,jsonb_build_object('canonicalCode',COALESCE(canonical_code,''),'isAlias',is_alias::text) data FROM shared.timezone WHERE ${active(value)} AND (${value ?? null}::text IS NULL OR code=${value ?? null}) AND (${query}='' OR code ILIKE ${search} ESCAPE '\\' OR COALESCE(name,'') ILIKE ${search} ESCAPE '\\') ${after(cursor,'code','id')} ORDER BY code,id LIMIT ${take}`.execute(database)).rows;
          break;
        case "shared.uom":
          rows = (await sql<Row>`SELECT id::text,code value,name label,name sort_1,code sort_2,jsonb_build_object('quantityType',quantity_type::text) data FROM shared.uom WHERE ${active(value)} AND (${value ?? null}::text IS NULL OR code=${value ?? null}) AND (${filters.quantityType ?? null}::text IS NULL OR quantity_type::text=${filters.quantityType ?? null}) AND (${query}='' OR code ILIKE ${search} ESCAPE '\\' OR name ILIKE ${search} ESCAPE '\\') ${after(cursor,'name','code')} ORDER BY name,code LIMIT ${take}`.execute(database)).rows;
          break;
        case "shared.state_region":
          rows = (await sql<Row>`SELECT id::text,code value,name label,name sort_1,id::text sort_2,jsonb_build_object('countryCode',country_code::text,'name',name) data FROM shared.state_region WHERE ${active(value)} AND (${value ?? null}::text IS NULL OR code=${value ?? null}) AND (${filters.countryCode ?? null}::text IS NULL OR country_code=${filters.countryCode ?? null}) AND (${query}='' OR code ILIKE ${search} ESCAPE '\\' OR name ILIKE ${search} ESCAPE '\\') ${after(cursor,'name','id')} ORDER BY name,id LIMIT ${take}`.execute(database)).rows;
          break;
        case "shared.classification_scheme":
          rows = (await sql<Row>`SELECT id::text,code value,name label,name sort_1,code sort_2,jsonb_build_object('schemeKind',scheme_kind::text,'edition',edition) data FROM shared.classification_scheme WHERE ${active(value)} AND (${value ?? null}::text IS NULL OR code=${value ?? null}) AND (${filters.schemeKind ?? null}::text IS NULL OR scheme_kind::text=${filters.schemeKind ?? null}) AND (${query}='' OR code ILIKE ${search} ESCAPE '\\' OR name ILIKE ${search} ESCAPE '\\') ${after(cursor,'name','code')} ORDER BY name,code LIMIT ${take}`.execute(database)).rows;
          break;
        case "shared.commodity_code":
        case "shared.industry_code": {
          const table = input.sourceKey === "shared.commodity_code" ? sql`shared.commodity_code` : sql`shared.industry_code`;
          rows = (await sql<Row>`SELECT id::text,id::text value,domain_code||' · '||code||' · '||name label,domain_code sort_1,id::text sort_2,jsonb_build_object('domainCode',domain_code,'code',code,'name',name,'parentCode',COALESCE(parent_code,''),'levelNo',level_no::text,'isLeaf',is_leaf::text) data FROM ${table} WHERE ${active(value)} AND (${value ?? null}::uuid IS NULL OR id=${value ?? null}::uuid) AND (${filters.domainCode ?? null}::text IS NULL OR domain_code=${filters.domainCode ?? null}) AND (${query}='' OR code ILIKE ${search} ESCAPE '\\' OR name ILIKE ${search} ESCAPE '\\' OR domain_code ILIKE ${search} ESCAPE '\\') ${after(cursor,'domain_code','id')} ORDER BY domain_code,id LIMIT ${take}`.execute(database)).rows;
          break;
        }
        case "shared.commodity_crosswalk":
        case "shared.industry_crosswalk": {
          const table = input.sourceKey === "shared.commodity_crosswalk" ? sql`shared.commodity_crosswalk` : sql`shared.industry_crosswalk`;
          rows = (await sql<Row>`SELECT id::text,id::text value,source_domain_code||':'||source_code||' → '||target_domain_code||':'||target_code label,source_domain_code sort_1,id::text sort_2,jsonb_build_object('sourceDomainCode',source_domain_code,'sourceCode',source_code,'targetDomainCode',target_domain_code,'targetCode',target_code,'mappingType',mapping_type::text,'confidence',COALESCE(confidence::text,''),'provenance',provenance::text,'verified',is_verified::text) data FROM ${table} WHERE ${active(value)} AND (${value ?? null}::uuid IS NULL OR id=${value ?? null}::uuid) AND (${filters.sourceDomainCode ?? null}::text IS NULL OR source_domain_code=${filters.sourceDomainCode ?? null}) AND (${filters.targetDomainCode ?? null}::text IS NULL OR target_domain_code=${filters.targetDomainCode ?? null}) AND (${query}='' OR source_code ILIKE ${search} ESCAPE '\\' OR target_code ILIKE ${search} ESCAPE '\\') ${after(cursor,'source_domain_code','id')} ORDER BY source_domain_code,id LIMIT ${take}`.execute(database)).rows;
          break;
        }
        case "shared.bank_institution":
          rows = (await sql<Row>`SELECT id::text,id::text value,name label,name sort_1,id::text sort_2,jsonb_build_object('institutionId',id::text,'countryCode',country_code::text,'name',name) data FROM shared.bank_institution WHERE ${value ? sql`id=${value}::uuid` : bankActive} AND (${filters.countryCode ?? null}::text IS NULL OR country_code=${filters.countryCode ?? null}) AND (${query}='' OR name ILIKE ${search} ESCAPE '\\') ${after(cursor,'name','id')} ORDER BY name,id LIMIT ${take}`.execute(database)).rows;
          break;
        case "shared.bank_branch":
          rows = (await sql<Row>`SELECT b.id::text,b.id::text value,b.name label,b.name sort_1,b.id::text sort_2,jsonb_build_object('institutionId',b.institution_id::text,'countryCode',b.country_code::text,'branch',b.name,'effectiveFrom',b.effective_from::text,'effectiveUntil',b.effective_until::text) data FROM shared.bank_branch b JOIN shared.bank_institution i ON i.id=b.institution_id WHERE ${value ? sql`b.id=${value}::uuid` : sql`b.status='active' AND b.effective_from<=CURRENT_DATE AND (b.effective_until IS NULL OR b.effective_until>CURRENT_DATE) AND i.status='active' AND i.effective_from<=CURRENT_DATE AND (i.effective_until IS NULL OR i.effective_until>CURRENT_DATE)`} AND (${filters.institutionId ?? null}::text IS NULL OR b.institution_id=${filters.institutionId ?? null}::uuid) AND (${filters.countryCode ?? null}::text IS NULL OR b.country_code=${filters.countryCode ?? null}) AND (${query}='' OR b.name ILIKE ${search} ESCAPE '\\') ${after(cursor,'b.name','b.id')} ORDER BY b.name,b.id LIMIT ${take}`.execute(database)).rows;
          break;
        case "shared.bank_identifier":
          rows = (await sql<Row>`SELECT id::text,id::text value,scheme||' · '||value label,scheme sort_1,id::text sort_2,jsonb_build_object('institutionId',institution_id::text,'branchId',COALESCE(branch_id::text,''),'jurisdiction',jurisdiction::text,'scheme',scheme,'namespace',scheme_namespace,'effectiveFrom',effective_from::text,'effectiveUntil',effective_until::text) data FROM shared.bank_identifier WHERE ${value ? sql`id=${value}::uuid` : sql`effective_from<=CURRENT_DATE AND (effective_until IS NULL OR effective_until>CURRENT_DATE) AND EXISTS(SELECT 1 FROM shared.bank_institution i WHERE i.id=bank_identifier.institution_id AND ${bankActive})`} AND (${filters.institutionId ?? null}::text IS NULL OR institution_id=${filters.institutionId ?? null}::uuid) AND (${filters.branchId ?? null}::text IS NULL OR branch_id=${filters.branchId ?? null}::uuid) AND (${filters.jurisdiction ?? null}::text IS NULL OR jurisdiction=${filters.jurisdiction ?? null}) AND (${filters.scheme ?? null}::text IS NULL OR scheme=${filters.scheme ?? null}) AND (${query}='' OR value ILIKE ${search} ESCAPE '\\' OR scheme ILIKE ${search} ESCAPE '\\') ${after(cursor,'scheme','id')} ORDER BY scheme,id LIMIT ${take}`.execute(database)).rows;
          break;
      }
      return toSharedReferenceLookupPage(input.sourceKey, scope, rows!, limit);
    },
  };
}
