import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import { controlAdminPermissions, controlAdminSchemas, type CacheInvalidator, type ConnectorDraft, type ConnectorHealthJobs, type ConnectorRepository } from "@athyper/server-contract-control-admin";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { HttpError, validateRuntimeSchema } from "@athyper/server-runtime-http";

type ConnectorInput = Omit<ConnectorDraft, "tenantId" | "version">;
const transitions: Readonly<Record<ConnectorDraft["status"], readonly ConnectorDraft["status"][]>> = { draft: ["active", "deprecated"], active: ["suspended", "deprecated"], suspended: ["active", "deprecated"], deprecated: [] };
export function createConnectorControlService(options: { readonly authorizer: Authorizer; readonly repositories: ExactPlaneRepositoryProvider<ConnectorRepository>; readonly cache: CacheInvalidator; readonly healthJobs: ConnectorHealthJobs }) {
  const permit = async (context: VerifiedRequestContext) => {
    if (!(await options.authorizer.authorize({ context, permissionCode: controlAdminPermissions.connectorManage })).allowed) throw error(403, "CONTROL_ADMIN_PERMISSION_DENIED");
  };
  const repositoryFor = (context: VerifiedRequestContext) => {
    try { return options.repositories.require(context.planeKey); }
    catch (cause) {
      if (cause instanceof Error && "status" in cause && cause.status === 503) throw error(503, "CONTROL_ADMIN_CONNECTOR_REPOSITORY_UNAVAILABLE");
      throw cause;
    }
  };
  const get = async (repository: ConnectorRepository, context: VerifiedRequestContext, id: string) => {
    schema(controlAdminSchemas.connectorParams, { id });
    const current = await repository.get(context.tenantId, id);
    if (current && (current.tenantId !== context.tenantId || current.id !== id)) throw error(404, "CONTROL_ADMIN_NOT_FOUND");
    return current;
  };
  const invalidate = (context: VerifiedRequestContext, codes: readonly string[]) => options.cache.invalidate({ namespace: "connectors", tenantId: context.tenantId, keys: [...new Set(codes)] });
  const transition = async (context: VerifiedRequestContext, id: string, target: ConnectorDraft["status"], expectedVersion: number) => {
    await permit(context);
    version(expectedVersion, 1);
    const repository = repositoryFor(context), current = await get(repository, context, id);
    if (!current) throw error(404, "CONTROL_ADMIN_NOT_FOUND");
    if (current.version !== expectedVersion) throw error(409, "CONTROL_ADMIN_VERSION_CONFLICT");
    if (!transitions[current.status]?.includes(target)) throw error(409, "CONTROL_ADMIN_LIFECYCLE_INVALID");
    if (target === "active") {
      validateConnector(current);
      if (!current.baseUrl || current.endpoints.length === 0) throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID");
    }
    const value = await mutate(() => repository.transition(context.tenantId, id, target, expectedVersion, context.principalId));
    await invalidate(context, [current.code]);
    return value;
  };
  return {
    async saveDraft(context: VerifiedRequestContext, connector: ConnectorInput, expectedVersion: number) {
      await permit(context);
      version(expectedVersion, 0);
      validateConnector(connector);
      schema(controlAdminSchemas.connectorParams, { id: connector.id });
      if (connector.status !== "draft") throw error(409, "CONTROL_ADMIN_LIFECYCLE_INVALID");
      const repository = repositoryFor(context), current = await get(repository, context, connector.id);
      if ((current?.version ?? 0) !== expectedVersion) throw error(409, "CONTROL_ADMIN_VERSION_CONFLICT");
      if (current && current.status !== "draft") throw error(409, "CONTROL_ADMIN_LIFECYCLE_INVALID");
      // Project fields so runtime callers cannot override tenant/version or persistence metadata.
      const value = await mutate(() => repository.save({ ...definition(connector), id: connector.id, status: "draft", tenantId: context.tenantId, expectedVersion }, context.principalId));
      await invalidate(context, current ? [current.code, connector.code] : [connector.code]);
      return value;
    },
    async validate(context: VerifiedRequestContext, connector: ConnectorInput) {
      await permit(context); validateConnector(connector); return { valid: true as const };
    },
    activate: (context: VerifiedRequestContext, id: string, expectedVersion: number) => transition(context, id, "active", expectedVersion),
    suspend: (context: VerifiedRequestContext, id: string, expectedVersion: number) => transition(context, id, "suspended", expectedVersion),
    deprecate: (context: VerifiedRequestContext, id: string, expectedVersion: number) => transition(context, id, "deprecated", expectedVersion),
    async requestHealthCheck(context: VerifiedRequestContext, id: string) {
      await permit(context);
      const connector = await get(repositoryFor(context), context, id);
      if (!connector || connector.status === "deprecated") throw error(404, "CONTROL_ADMIN_NOT_FOUND");
      validateConnector(connector);
      if (!connector.baseUrl || connector.endpoints.length === 0) throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID");
      const jobId = await options.healthJobs.enqueue({ planeKey: context.planeKey, tenantId: context.tenantId, connectorId: id, requestedBy: context.principalId });
      if (typeof jobId !== "string" || !jobId.trim()) throw error(503, "CONTROL_ADMIN_CONNECTOR_HEALTH_JOB_UNAVAILABLE");
      return jobId;
    },
  };
}

function definition(connector: ConnectorInput) {
  return {
    connectorTypeId: connector.connectorTypeId, code: connector.code, name: connector.name, config: connector.config, endpoints: connector.endpoints,
    ...(connector.baseUrl !== undefined ? { baseUrl: connector.baseUrl } : {}),
    ...(connector.secretReference !== undefined ? { secretReference: connector.secretReference } : {}),
  };
}
export function validateConnector(connector: ConnectorInput): void {
  if (!connector || typeof connector !== "object" || Array.isArray(connector)) throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID");
  schema(controlAdminSchemas.connector, { ...definition(connector), ...(connector.id !== undefined ? { id: connector.id } : {}), ...(connector.status !== undefined ? { status: connector.status } : {}) });
  if (containsSecret(connector.config)) throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID");
  const origin = connector.baseUrl === undefined ? new URL("https://connector.invalid") : baseUrl(connector.baseUrl);
  if (connector.secretReference !== undefined) {
    const reference = connector.secretReference;
    let parsed: URL;
    try { parsed = new URL(reference); } catch { throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID"); }
    if (!/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(reference) || /[\\\s]/.test(reference) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID");
  }
  const codes = new Set<string>();
  for (const endpoint of connector.endpoints) {
    if (codes.has(endpoint.code)) throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID");
    codes.add(endpoint.code);
    let path = endpoint.path;
    // Check decoded forms too: downstream clients and proxies may decode delimiters.
    for (let depth = 0; ; depth++) {
      let resolved: URL;
      try { resolved = new URL(path, origin); } catch { throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID"); }
      if (!path.startsWith("/") || path.startsWith("//") || /[\\\s#]/.test(path) || path.split("?")[0]!.split("/").some(segment => segment === "." || segment === "..") || resolved.origin !== origin.origin || credentialQuery(resolved)) throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID");
      let decoded: string;
      try { decoded = decodeURIComponent(path); } catch { throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID"); }
      if (decoded === path) break;
      if (depth >= 3) throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID");
      path = decoded;
    }
  }
}
function baseUrl(value: string): URL {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID"); }
  if (!value.startsWith("https://") || /[\\\s]/.test(value) || parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash || credentialQuery(parsed)) throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID");
  return parsed;
}
function secretKey(key: string): boolean { return /password|secret|token|api[_-]?key|credential|authorization|private[_-]?key/i.test(key); }
function credentialQuery(url: URL): boolean { return [...url.searchParams].some(([key, value]) => secretKey(key) && value.length > 0); }
function containsSecret(value: unknown, key = "", depth = 0, seen = new Set<object>()): boolean {
  if (secretKey(key)) return true;
  if (value === null || typeof value !== "object") return typeof value === "number" && !Number.isFinite(value) || !["string", "number", "boolean"].includes(typeof value) && value !== null;
  if (depth > 32 || seen.has(value)) return true;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return true;
  if (Object.getOwnPropertySymbols(value).length || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !("value" in d))) return true;
  if (Array.isArray(value)) for(let i=0;i<value.length;i++) if(!Object.hasOwn(value,i)) return true;
  seen.add(value);
  const invalid = Object.entries(value).some(([child, item]) => containsSecret(item, child, depth + 1, seen));
  seen.delete(value);
  return invalid;
}
function version(value: number, minimum: number): void { if (!Number.isSafeInteger(value) || value < minimum) throw error(400, "CONTROL_ADMIN_INVALID_EXPECTED_VERSION"); }
function schema(value: Parameters<typeof validateRuntimeSchema>[0], input: unknown): void { try { validateRuntimeSchema(value, input); } catch { throw error(400, "CONTROL_ADMIN_CONNECTOR_INVALID"); } }
function error(status: number, code: string): HttpError { return new HttpError(status, code, code); }

async function mutate(work: () => Promise<ConnectorDraft>): Promise<ConnectorDraft> {
  try { return await work(); }
  catch (cause) {
    if (cause instanceof Error && "code" in cause && (cause.code === "CONTROL_ADMIN_VERSION_CONFLICT" || cause.code === "CONTROL_ADMIN_LIFECYCLE_INVALID")) throw error(409, cause.code);
    throw cause;
  }
}
