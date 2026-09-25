import { sql, type Transaction } from "kysely";

const sources = {
  operatingOrganizationId: "master.operating_organization",
  companyCodeId: "master.company_code",
  legalEntityId: "master.legal_entity",
  paymentTermId: "master.payment_term",
} as const;

/** Resolve only registered references already present in an admitted section. */
export async function businessPartnerDisplayReferences(
  value: unknown,
  tenantId: string,
  tx: Transaction<Record<string, never>>,
): Promise<unknown> {
  const references = new Map<string, Set<string>>();
  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (
        Object.hasOwn(sources, key) &&
        typeof item === "string" &&
        /^[0-9a-f-]{36}$/i.test(item)
      ) {
        const ids = references.get(key) ?? new Set<string>();
        ids.add(item);
        references.set(key, ids);
      } else if (typeof item === "object") visit(item);
    }
  }
  visit(value);
  const names = new Map<string, string>();
  await Promise.all(
    [...references].map(async ([key, ids]) => {
      const result = await sql<{
        id: string;
        code: string;
        name: string;
      }>`SELECT id::text,code,name FROM ${sql.table(sources[key as keyof typeof sources])} WHERE tenant_id=${tenantId}::uuid AND id=ANY(${[...ids]}::uuid[])`.execute(
        tx,
      );
      for (const row of result.rows)
        names.set(`${key}:${row.id}`, `${row.code} · ${row.name}`);
    }),
  );
  function project(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(project);
    if (!value || typeof value !== "object") return value;
    const entries = Object.entries(value);
    const displayValues = Object.fromEntries(
      entries.flatMap(([key, id]) =>
        typeof id === "string" && names.has(`${key}:${id}`)
          ? [[key, names.get(`${key}:${id}`)]]
          : [],
      ),
    );
    return {
      ...Object.fromEntries(entries.map(([key, item]) => [key, project(item)])),
      ...(Object.keys(displayValues).length ? { displayValues } : {}),
    };
  }
  return project(value);
}
