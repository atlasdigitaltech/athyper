import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../routes/records.route.ts", import.meta.url), "utf8");
const mutationRoute = readFileSync(new URL("../routes/entity-mutation.route.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../mutation/entity-mutation.service.ts", import.meta.url), "utf8");

describe("Phase 3 pilot architecture contract", () => {
  it("routes classic POST, PUT, and PATCH pilots through EntityMutationService with legacy fallback", () => {
    expect(route).toContain('"company_code,cost_center"');
    expect(route).toContain("registerEntityMutationRoutes(router, {");
    expect(mutationRoute).toContain("if (!deps.isCanonicalEntity(entityCode)) return deps.legacy.create(req, res, next)");
    expect(mutationRoute).toContain("if (!deps.isCanonicalEntity(entityCode)) return deps.legacy.put(req, res, next)");
    expect(mutationRoute).toContain("if (!deps.isCanonicalEntity(entityCode)) return deps.legacy.patch(req, res, next)");
    expect(mutationRoute).toContain("deps.service.create(command)");
    expect(mutationRoute.match(/deps\.service\.patch\(\{/g)).toHaveLength(2);
    expect(mutationRoute).toContain("deps.service.delete({");
    expect(mutationRoute).toContain("deps.service.validateCreate(command)");
    expect(mutationRoute).toContain("deps.service.validateDelete({");
    expect(mutationRoute).toContain('router.put(`${root}/:entity/:id`, handlers.update);');
  });

  it("keeps the durable mutation pipeline inside one service transaction", () => {
    expect(service).toContain("executeDurableMutationTransaction(this.deps.db, async (trx)");
    expect(service).toContain("await claimIdempotency(trx");
    expect(service).toContain("await writeRequiredRouteAudit(trx");
    expect(service).toContain("await emitOutboxEvent(trx");
    expect(service).not.toContain('selectFrom("snapshot.entity_compiled');
    expect(service).not.toContain('selectFrom("control.entity');
    expect(service).toContain("await provider.get({");
    expect(service).toContain("completeIdempotency(trx");
  });

  it("does not import Express in the mutation service or command contract", () => {
    expect(service).not.toContain('from "express"');
    const types = readFileSync(new URL("../mutation/entity-mutation.types.ts", import.meta.url), "utf8");
    expect(types).not.toContain('from "express"');
  });
});
