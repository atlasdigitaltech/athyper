import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  type NormalizedCoreContext,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256 } from "./deterministic.js";

type Catalogue = NormalizedCoreContext["catalogues"][number];
const rejected = (): never => {
  throw new AuthoringPolicyError(
    "NATIVE_STORAGE_CATALOGUE_UNAVAILABLE",
    "Resolve the exact PostgreSQL object on its registered storage plane; unsupported types require a provider adapter.",
  );
};
/** Physical facts for compilation, not authority to read business records.
 * The caller supplies the connection's independently configured plane; an author
 * cannot reinterpret a local object as evidence for another plane.
 */
export async function readNativeStorageCatalogue(
  tx: Transaction<Record<string, never>>,
  registeredPlane: "studio" | "neon" | "mesh",
  selection: { plane: string; schema: string; object: string },
): Promise<Catalogue> {
  if (
    !tx.isTransaction ||
    selection.plane !== registeredPlane ||
    !["studio", "neon", "mesh"].includes(registeredPlane) ||
    ![selection.schema, selection.object].every((value) =>
      /^[a-z_][a-z0-9_]{0,62}$/.test(value),
    )
  )
    rejected();
  const rows = (
    await sql<{
      path: string;
      storage_type: string;
      nullable: boolean;
      base_schema: string;
      base_type: string;
      type_kind: string;
      object_kind: string;
      generated: string;
      column_count: number;
      constraints: unknown;
      enum_labels: readonly string[];
      default_expression: string | null;
    }>`WITH RECURSIVE types AS (
      SELECT t.oid,t.oid AS root,t.typnamespace,t.typname,t.typtype,t.typbasetype,0 AS depth
      FROM pg_catalog.pg_type t
      UNION ALL
      SELECT t.oid,p.root,t.typnamespace,t.typname,t.typtype,t.typbasetype,p.depth+1
      FROM types p JOIN pg_catalog.pg_type t ON t.oid=p.typbasetype
      WHERE p.typtype='d' AND p.depth<8
    )
    SELECT a.attname AS path,pg_catalog.format_type(a.atttypid,a.atttypmod) AS storage_type,
      NOT (a.attnotnull OR EXISTS(SELECT 1 FROM types chain JOIN pg_catalog.pg_type dt ON dt.oid=chain.oid WHERE chain.root=a.atttypid AND dt.typnotnull)) AS nullable,
      tn.nspname AS base_schema,t.typname AS base_type,t.typtype AS type_kind,c.relkind::text AS object_kind,a.attgenerated::text AS generated,
      (SELECT count(*)::integer FROM pg_catalog.pg_attribute ca WHERE ca.attrelid=c.oid AND ca.attnum>0 AND NOT ca.attisdropped) AS column_count,
      (SELECT coalesce(jsonb_agg(pg_catalog.pg_get_constraintdef(co.oid) ORDER BY co.conname,co.oid),'[]'::jsonb) FROM pg_catalog.pg_constraint co WHERE co.conrelid=c.oid OR co.contypid IN(SELECT chain.oid FROM types chain WHERE chain.root=a.atttypid)) AS constraints,
      (SELECT pg_catalog.pg_get_expr(d.adbin,d.adrelid) FROM pg_catalog.pg_attrdef d WHERE d.adrelid=c.oid AND d.adnum=a.attnum) AS default_expression,
      (SELECT coalesce(jsonb_agg(e.enumlabel ORDER BY e.enumsortorder),'[]'::jsonb) FROM pg_catalog.pg_enum e WHERE e.enumtypid=t.oid) AS enum_labels
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    JOIN types t ON t.root=a.atttypid AND t.typbasetype=0
    JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace
    WHERE n.nspname=${selection.schema} AND c.relname=${selection.object}
    ORDER BY a.attnum LIMIT 4097`.execute(tx)
  ).rows;
  if (
    !rows.length ||
    rows.length > 4096 ||
    new Set(rows.map((row) => row.path)).size !== rows.length
  )
    rejected();
  const columns = rows.map((row) => {
    // Views/foreign tables need separately registered lineage; arrays, ranges and
    // user-defined codecs are not silently treated as scalar text.
    if (
      !["r", "p"].includes(row.object_kind) ||
      row.column_count !== rows.length ||
      typeof row.nullable !== "boolean"
    )
      return rejected();
    const types: Readonly<Record<string, readonly string[]>> = {
      uuid: ["uuid"],
      text: ["string", "text", "enum"],
      varchar: ["string", "text", "enum"],
      bpchar: ["string", "text", "enum"],
      bool: ["boolean"],
      int2: ["integer"],
      int4: ["integer"],
      int8: ["bigint"],
      numeric: ["decimal", "money"],
      date: ["date"],
      timestamp: ["datetime"],
      timestamptz: ["datetime"],
      jsonb: ["json"],
    };
    const supportedDataTypes =
      row.type_kind === "e"
        ? ["enum"]
        : row.base_schema === "pg_catalog"
          ? types[row.base_type]
          : undefined;
    if (!supportedDataTypes) return rejected();
    return {
      path: row.path,
      storageType: row.storage_type,
      nullable: row.nullable,
      supportedDataTypes,
      cardinalities: ["one"] as const,
    };
  });
  const facts = {
    plane: registeredPlane,
    schema: selection.schema,
    object: selection.object,
    columns,
  };
  return { hash: sha256({ facts, physical: rows }), ...facts };
}
