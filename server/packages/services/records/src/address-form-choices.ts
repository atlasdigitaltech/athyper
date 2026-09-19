import { sql, type Kysely } from "kysely";
/** Called only after form access is authorized. Values are shared reference data. */
export async function addressFormChoices(
  database: Kysely<any>,
  source: string,
) {
  if (source === "shared.state_region") {
    const result = await sql<{
      code: string;
      country_code: string;
      name: string;
    }>`SELECT code,country_code,name FROM shared.state_region WHERE status='active' ORDER BY name,code LIMIT 10001`.execute(
      database,
    );
    if (result.rows.length > 10000)
      throw Error("INTAKE_LOOKUP_REQUIRES_PAGED_SOURCE");
    return result.rows.map((r) => ({
      value: r.code,
      label: r.name,
      data: { countryCode: r.country_code.trim(), name: r.name },
    }));
  }
  const result = await sql<{
    code: string;
    name: string;
    region_label: string;
    postal_code_label: string;
    postal_code_pattern: string | null;
    postal_code_example: string | null;
    has_postal_codes: boolean;
  }>`SELECT code,name,region_label,postal_code_label,postal_code_pattern,postal_code_example,has_postal_codes FROM shared.country ORDER BY name LIMIT 500`.execute(
    database,
  );
  return result.rows.map((r) => ({
    value: r.code.trim(),
    label: r.name,
    data: {
      regionLabel: r.region_label,
      postalLabel: r.postal_code_label,
      postalPattern: r.postal_code_pattern ?? "",
      postalExample: r.postal_code_example ?? "",
      postalHelp: r.has_postal_codes
        ? r.postal_code_example
          ? `Example: ${r.postal_code_example}`
          : ""
        : "Postal codes are not used for this country.",
    },
  }));
}
