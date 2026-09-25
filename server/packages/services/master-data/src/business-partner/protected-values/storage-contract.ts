import { sql, type RawBuilder } from "kysely";

const referencePattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,511}$/;
export function validProtectedReference(value: unknown): value is string {
  return typeof value === "string" && referencePattern.test(value) && !value.includes("..") && !value.includes("//");
}

/** Storage representation, not permission. Inconsistent flags/tokens never become plaintext. */
export function restrictedValueFromStorage(metadata: unknown, value?: unknown, tokenOnly = false): {tokenOrValue:string;protected:boolean}|null {
  if (metadata !== null && metadata !== undefined && (typeof metadata !== "object" || Array.isArray(metadata))) return null;
  const meta = (metadata ?? {}) as Record<string,unknown>;
  if (meta.protected !== undefined && typeof meta.protected !== "boolean") return null;
  const token = typeof meta.protectedValueToken === "string" ? meta.protectedValueToken.trim() : undefined;
  if (meta.protectedValueToken !== undefined && meta.protectedValueToken !== null && typeof meta.protectedValueToken !== "string") return null;
  if (token) return meta.protected === false || !validProtectedReference(token) ? null : {tokenOrValue:token,protected:true};
  if (meta.protected === true) return typeof value === "string" && /^(identifier|tax|vault):/.test(value) && validProtectedReference(value) ? {tokenOrValue:value,protected:true} : null;
  if (tokenOnly || typeof value !== "string" || !value || /^(identifier|tax|bank|vault):/.test(value)) return null;
  return {tokenOrValue:value,protected:false};
}

/** Boolean availability queries use this expression without returning the token to a projection. */
export function protectedTokenSql(metadata: RawBuilder<unknown>): RawBuilder<string|null> {
  const token = sql<string>`NULLIF(btrim(${metadata}->>'protectedValueToken'),'')`;
  return sql<string|null>`CASE WHEN
    (NOT (${metadata} ? 'protected') OR ${metadata}->'protected'='true'::jsonb)
    AND jsonb_typeof(${metadata}->'protectedValueToken')='string'
    AND length(${token}) BETWEEN 8 AND 512
    AND ${token} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
    AND position('..' in ${token})=0 AND position('//' in ${token})=0
    THEN ${token} ELSE NULL END`;
}
