import { sql, type Kysely } from "kysely";
import type { CompiledEntityQueryPlan, EntityQueryExecutor, EntityQuerySort, QueryPredicate } from "./entity-query.types.js";

export class KyselyEntityQueryExecutor implements EntityQueryExecutor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: Kysely<any>) {}

  async executeData(plan: CompiledEntityQueryPlan): Promise<readonly Record<string, unknown>[]> {
    const table = `${plan.schema}.${plan.table}`;
    let query = this.db.selectFrom(table)
      .select(plan.columns.map(({ column, field }) => sql.ref(column).as(field)));
    query = applyPredicates(query, plan.predicates);
    if (plan.search?.columns.length) {
      const term = `%${plan.search.term}%`;
      query = query.where(({ eb, or }) => or(plan.search!.columns.map((column) => eb(this.db.dynamic.ref(column), "ilike", term))));
    }
    if (plan.boundary) query = applyBoundary(query, this.db, plan.sort, plan.boundary.values);
    for (const sort of plan.sort) {
      query = query.orderBy(sql`${sql.ref(sort.column)} ${sql.raw(sort.direction)} nulls ${sql.raw(sort.nulls)}`);
    }
    query = query.limit(plan.limit);
    if (plan.offset !== undefined) query = query.offset(plan.offset);
    return query.execute() as Promise<Record<string, unknown>[]>;
  }

  async executeExactCount(plan: CompiledEntityQueryPlan): Promise<number> {
    const table = `${plan.schema}.${plan.table}`;
    let query = this.db.selectFrom(table).select(this.db.fn.countAll<string>().as("count"));
    query = applyPredicates(query, plan.predicates);
    if (plan.search?.columns.length) {
      const term = `%${plan.search.term}%`;
      query = query.where(({ eb, or }) => or(plan.search!.columns.map((column) => eb(this.db.dynamic.ref(column), "ilike", term))));
    }
    const row = await query.executeTakeFirst();
    return Number(row?.count ?? 0);
  }
}

// Kysely's table type is intentionally erased here: every identifier was validated
// when ExecutionDescriptorV1 was activated, and values remain parameter-bound.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyPredicates(query: any, predicates: readonly QueryPredicate[]): any {
  for (const predicate of predicates) {
    query = query.where(({ eb }: { eb: any }) => {
      const ref = eb.ref(predicate.column);
      switch (predicate.operator) {
        case "eq": return eb(ref, "=", predicate.value);
        case "ne": return eb(ref, "!=", predicate.value);
        case "in": {
          const values = predicate.value as readonly unknown[];
          return values.length === 0 ? eb.val(false) : eb(ref, "in", values);
        }
        case "gt": return eb(ref, ">", predicate.value);
        case "gte": return eb(ref, ">=", predicate.value);
        case "lt": return eb(ref, "<", predicate.value);
        case "lte": return eb(ref, "<=", predicate.value);
        case "is_null": return eb(ref, "is", null);
        case "is_not_null": return eb(ref, "is not", null);
      }
    });
  }
  return query;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyBoundary(query: any, db: Kysely<any>, sort: readonly (EntityQuerySort & { column: string })[], values: readonly unknown[]): any {
  return query.where(({ eb, or, and }: { eb: any; or: any; and: any }) => or(sort.map((entry, index) => {
    const equalPrefix = sort.slice(0, index).map((prefix, prefixIndex) => {
      const value = values[prefixIndex];
      return eb(db.dynamic.ref(prefix.column), value === null ? "is" : "=", value);
    });
    const value = values[index];
    const ref = db.dynamic.ref(entry.column);
    let after;
    if (value === null) {
      after = entry.nulls === "first" ? eb(ref, "is not", null) : eb.val(false);
    } else {
      const comparison = eb(ref, entry.direction === "asc" ? ">" : "<", value);
      after = entry.nulls === "last" ? or([comparison, eb(ref, "is", null)]) : comparison;
    }
    return and([...equalPrefix, after]);
  })));
}
