import { sql, type Kysely } from "kysely";
import type { PlaneKey } from "@athyper/server-foundation/context";
import {
  bankFormChoices,
  bankFormSources,
  createSharedReferenceDirectory,
  isSharedReferenceSourceKey,
  requiresSharedReferenceDependency,
  sharedReferenceFilterChoices,
} from "@athyper/server-service-records";
import type { EntityServiceOptions } from "./services.js";

type ChoiceResolvers = Pick<
  NonNullable<EntityServiceOptions["presentation"]>,
  "formChoices" | "filterChoices"
>;
type LookupRegistration = Readonly<{ plane: PlaneKey; table: string }>;

/** Source keys are metadata references; physical tables are registered by the owning host. */
const lookupRegistrations: Readonly<Record<string, LookupRegistration>> =
  Object.freeze({
    "neon.commodity_category": {
      plane: "neon",
      table: "master.commodity_category",
    },
    "neon.tax_jurisdiction": {
      plane: "neon",
      table: "master.tax_jurisdiction",
    },
    "neon.tax_type": { plane: "neon", table: "master.tax_type" },
    "neon.certification_type": {
      plane: "neon",
      table: "master.certification_type",
    },
  });

export function createEntityPresentationChoiceResolvers(
  databases: Partial<Record<PlaneKey, Kysely<Record<string, never>>>>,
): ChoiceResolvers {
  return {
    formChoices: async (context, sourceKey) => {
      const database = databases[context.planeKey];
      if (!database) throw Error("INTAKE_LOOKUP_DATABASE_UNAVAILABLE");
      if ((bankFormSources as readonly string[]).includes(sourceKey))
        return bankFormChoices(database, sourceKey);
      if (isSharedReferenceSourceKey(sourceKey)) {
        if (requiresSharedReferenceDependency(sourceKey)) return [];
        const page = await createSharedReferenceDirectory(database).lookup({
          sourceKey,
          limit: 25,
        });
        return page.items.map(({ value, label, data }) => ({
          value,
          label,
          ...(data ? { data } : {}),
        }));
      }
      const registration = Object.hasOwn(lookupRegistrations, sourceKey)
        ? lookupRegistrations[sourceKey]
        : undefined;
      if (!registration || registration.plane !== context.planeKey)
        throw Error("INTAKE_LOOKUP_SOURCE_UNREGISTERED");
      const result = await sql<{ id: string; code: string; name: string }>`
        SELECT id::text, code, name FROM ${sql.table(registration.table)}
        WHERE tenant_id=${context.tenantId}::uuid AND status='active'
        ORDER BY name, id LIMIT 2001
      `.execute(database);
      if (result.rows.length > 2000)
        throw Error("INTAKE_LOOKUP_REQUIRES_PAGED_SOURCE");
      return result.rows.map((row) => ({
        value: row.id,
        label: `${row.code} · ${row.name}`,
      }));
    },
    filterChoices: async (context, fields) => {
      const countries = fields.filter(
        (field) => field.list?.semanticRole === "country_code",
      );
      if (!countries.length) return {};
      const database = databases[context.planeKey];
      if (!database) return {};
      const choices = await sharedReferenceFilterChoices(
        createSharedReferenceDirectory(database),
        "iso.country",
      );
      return Object.fromEntries(countries.map((field) => [field.key, choices]));
    },
  };
}
