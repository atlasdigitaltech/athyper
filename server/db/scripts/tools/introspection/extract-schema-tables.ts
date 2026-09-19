type Queryable = {
  query: <T extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

const qi = (value: string) => `"${value.replaceAll('"', '""')}"`;
const qn = (schemaName: string, objectName: string) => `${qi(schemaName)}.${qi(objectName)}`;
const ql = (value: string) => `'${value.replaceAll("'", "''")}'`;

export async function generateTablesSql(db: Queryable, schema: string, headerSource: string): Promise<string> {
  const tables = await db.query<{
    oid: number;
    table_name: string;
    relkind: string;
    persistence: string;
    is_partition: boolean;
    parent_name: string | null;
    partition_bound: string | null;
    partition_key: string | null;
    reloptions: string[] | null;
    comment: string | null;
  }>(
    `
      SELECT c.oid, c.relname AS table_name, c.relkind,
             c.relpersistence AS persistence,
             c.relispartition AS is_partition,
             parent.relname AS parent_name,
             CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound, c.oid) END
               AS partition_bound,
             CASE WHEN c.relkind = 'p' THEN pg_get_partkeydef(c.oid) END
               AS partition_key,
             c.reloptions,
             obj_description(c.oid, 'pg_class') AS comment
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_inherits i ON i.inhrelid = c.oid
        LEFT JOIN pg_class parent ON parent.oid = i.inhparent
       WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
       ORDER BY c.relispartition, c.relname
    `,
    [schema],
  );
  const columns = await db.query<{
    table_oid: number;
    column_name: string;
    data_type: string;
    not_null: boolean;
    identity_kind: string;
    generated_kind: string;
    default_expr: string | null;
    collation_schema: string | null;
    collation_name: string | null;
    comment: string | null;
  }>(
    `
      SELECT a.attrelid AS table_oid, a.attname AS column_name,
             format_type(a.atttypid, a.atttypmod) AS data_type,
             a.attnotnull AS not_null,
             a.attidentity AS identity_kind,
             a.attgenerated AS generated_kind,
             pg_get_expr(ad.adbin, ad.adrelid) AS default_expr,
             CASE WHEN a.attcollation <> t.typcollation THEN cn.nspname END
               AS collation_schema,
             CASE WHEN a.attcollation <> t.typcollation THEN coll.collname END
               AS collation_name,
             col_description(a.attrelid, a.attnum) AS comment
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_type t ON t.oid = a.atttypid
        LEFT JOIN pg_attrdef ad
          ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        LEFT JOIN pg_collation coll ON coll.oid = a.attcollation
        LEFT JOIN pg_namespace cn ON cn.oid = coll.collnamespace
       WHERE n.nspname = $1
         AND c.relkind IN ('r', 'p')
         AND a.attnum > 0
         AND NOT a.attisdropped
       ORDER BY a.attrelid, a.attnum
    `,
    [schema],
  );
  const sequenceOwners = await db.query<{
    sequence_name: string;
    table_name: string;
    column_name: string;
  }>(
    `
      SELECT seq.relname AS sequence_name, tbl.relname AS table_name,
             a.attname AS column_name
        FROM pg_class seq
        JOIN pg_namespace sn ON sn.oid = seq.relnamespace
        JOIN pg_depend d
          ON d.classid = 'pg_class'::regclass AND d.objid = seq.oid
         AND d.deptype = 'a'
        JOIN pg_class tbl ON tbl.oid = d.refobjid
        JOIN pg_attribute a
          ON a.attrelid = tbl.oid AND a.attnum = d.refobjsubid
       WHERE sn.nspname = $1 AND seq.relkind = 'S'
       ORDER BY seq.relname
    `,
    [schema],
  );

  const columnsByTable = new Map<number, typeof columns.rows>();
  for (const column of columns.rows) {
    const list = columnsByTable.get(column.table_oid) ?? [];
    list.push(column);
    columnsByTable.set(column.table_oid, list);
  }

  const parts = [headerSource];
  for (const table of tables.rows) {
    const name = qn(schema, table.table_name);
    if (table.is_partition && table.parent_name) {
      parts.push(
        `CREATE TABLE ${name}\n  PARTITION OF ${qn(schema, table.parent_name)}\n  ${table.partition_bound};\n`,
      );
    } else {
      const persistence =
        table.persistence === "u"
          ? "UNLOGGED "
          : table.persistence === "t"
            ? "TEMPORARY "
            : "";
      const definitions = (columnsByTable.get(table.oid) ?? []).map((column) => {
        const fragments = [qi(column.column_name), column.data_type];
        if (column.collation_schema && column.collation_name) {
          fragments.push(
            `COLLATE ${qn(column.collation_schema, column.collation_name)}`,
          );
        }
        if (column.generated_kind === "s") {
          fragments.push(`GENERATED ALWAYS AS (${column.default_expr}) STORED`);
        } else if (column.identity_kind) {
          fragments.push(
            `GENERATED ${
              column.identity_kind === "a" ? "ALWAYS" : "BY DEFAULT"
            } AS IDENTITY`,
          );
        } else if (column.default_expr) {
          fragments.push(`DEFAULT ${column.default_expr}`);
        }
        if (column.not_null) fragments.push("NOT NULL");
        return `  ${fragments.join(" ")}`;
      });
      const options = table.reloptions?.length
        ? `\nWITH (${table.reloptions.join(", ")})`
        : "";
      const partition = table.partition_key
        ? `\nPARTITION BY ${table.partition_key}`
        : "";
      parts.push(
        `CREATE ${persistence}TABLE ${name} (\n${definitions.join(
          ",\n",
        )}\n)${options}${partition};\n`,
      );
    }
    if (table.comment !== null) {
      parts.push(`COMMENT ON TABLE ${name} IS ${ql(table.comment)};\n`);
    }
    for (const column of columnsByTable.get(table.oid) ?? []) {
      if (column.comment !== null) {
        parts.push(
          `COMMENT ON COLUMN ${name}.${qi(column.column_name)} IS ${ql(
            column.comment,
          )};\n`,
        );
      }
    }
  }
  for (const owner of sequenceOwners.rows) {
    parts.push(
      `ALTER SEQUENCE ${qn(schema, owner.sequence_name)} OWNED BY ${qn(
        schema,
        owner.table_name,
      )}.${qi(owner.column_name)};\n`,
    );
  }
  return parts.join("\n");
}

