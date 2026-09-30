import { parseInstant } from "@athyper/platform-temporal";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { sql, type Kysely } from "kysely";
import { evaluateEntitlement, type EntitlementDecision } from "./evaluation.js";

type Plane = "studio" | "neon" | "mesh";
type Context = Pick<VerifiedRequestContext, "planeKey" | "tenantId" | "principalId">;
export interface EffectiveTenantEntitlement {
  readonly tenantId: string;
  readonly planeKey: Plane;
  readonly planCode: string;
  readonly planId: string;
  readonly version: number;
  readonly revision: string;
  readonly modules: readonly string[];
  readonly limits: Readonly<Record<string, number | null>>;
  readonly overrides: readonly { readonly id: string; readonly version: number }[];
}
type Stored = Omit<EffectiveTenantEntitlement, "tenantId" | "planeKey" | "limits"> & { limits: Record<string, string | null> };

/** Always resolves committed state in the exact plane. Decisions are not cached:
 * scheduled starts/ends and another host's mutations take effect on the next read.
 * This checks availability; authorization and atomic usage reservation remain separate.
 */
export function createKyselyEntitlementRuntime(databases: Readonly<Partial<Record<Plane, Kysely<Record<string, never>>>>>) {
  const provider = createExactPlaneRepositoryProvider(databases, { unavailableCode: "ENTITLEMENT_EXACT_PLANE_UNAVAILABLE" });
  const resolve = async (context: Context, at = new Date().toISOString(), dimensionCode = "*"): Promise<EffectiveTenantEntitlement | undefined> => {
    if (!Number.isFinite(parseInstant(at))) throw error(400,"ENTITLEMENT_INVALID_INSTANT");
    if (!/^(?:\*|[a-z][a-z0-9_]{1,62})$/.test(dimensionCode)) throw error(400,"ENTITLEMENT_INVALID_DIMENSION");
    const db = provider.require(context.planeKey);
    return db.transaction().execute(async tx => {
      const plane = (await sql<{plane:string}>`SELECT current_setting('app.database_plane',true) AS plane`.execute(tx)).rows[0]?.plane;
      if (plane !== context.planeKey) throw error(503,"ENTITLEMENT_PLANE_MISMATCH");
      await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true), set_config('app.current_principal_id',${context.principalId},true)`.execute(tx);
      const stored = (await sql<{value:Stored|null}>`SELECT control.effective_tenant_entitlement(${context.tenantId}::uuid,${at}::timestamptz,${dimensionCode}) AS value`.execute(tx)).rows[0]?.value;
      if (!stored) return undefined;
      const limits = Object.fromEntries(Object.entries(stored.limits).map(([code,value]) => {
        if (value === null) return [code,null];
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < 0) throw error(500,"ENTITLEMENT_LIMIT_OUT_OF_RANGE");
        return [code,number];
      }));
      return {...stored,limits,tenantId:context.tenantId,planeKey:context.planeKey};
    });
  };
  return Object.freeze({ resolve,
    async evaluate(context: Context, request: {readonly module?:string; readonly limit?:string; readonly usage?:number}, at = new Date().toISOString(), dimensionCode = "*"): Promise<EntitlementDecision> {
      const effective = await resolve(context,at,dimensionCode);
      if (!effective) return {entitled:false,reason:"no_effective_plan"};
      return evaluateEntitlement([{planCode:effective.planCode,revision:effective.version,effectiveFrom:at,
        modules:effective.modules,features:[],limits:effective.limits}],effective.planCode,at,request);
    },
  });
}
function error(statusCode: number, code: string): Error { return Object.assign(new Error(code),{statusCode,code}); }
