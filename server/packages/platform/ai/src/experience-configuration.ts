import { HttpError } from "@athyper/server-runtime-http";
import { createHash, randomUUID } from "node:crypto";
import type { AtlasAgentConfiguration, AtlasExperienceConfigurationRepository, AtlasExperienceDefinition, AtlasExperienceProjection, AtlasExperienceRelease, AtlasPromptConfiguration, AtlasSearchSourceConfiguration, AtlasWidgetConfiguration } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { sql, type Transaction } from "kysely";

type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;
const CODE = /^[a-z][a-z0-9_.:-]{0,127}$/;
const PLANES = ["neon", "mesh", "studio"] as const;

export class AtlasExperienceConfigurationService {
  constructor(private readonly repository: AtlasExperienceConfigurationRepository) {}

  async resolve(context: VerifiedRequestContext, scope = "home"): Promise<AtlasExperienceProjection | null> {
    const release = await this.repository.getPublished({ context, scope: validCode(scope, "scope") });
    if (!release) return null;
    const allowed = (access?: { readonly permissions?: readonly string[]; readonly features?: readonly string[] }) =>
      (access?.permissions ?? []).every((permission) => context.permissions.allowed.includes(permission)) &&
      (access?.features ?? []).length === 0;
    const onPlane = (planes: readonly string[]) => planes.includes(context.planeKey);
    return Object.freeze({
      schema: "atlas-experience-projection/1",
      scope: release.definition.scope,
      revision: release.revision,
      contentHash: release.contentHash,
      widgets: release.definition.widgets.filter((item) => item.enabled && onPlane(item.planes) && allowed(item.access)).sort((a, b) => a.order - b.order),
      searchSources: release.definition.searchSources.filter((item) => item.enabled && onPlane(item.planes) && (!item.permissionCode || context.permissions.allowed.includes(item.permissionCode))),
      prompts: release.definition.prompts.filter((item) => item.enabled && onPlane(item.planes) && allowed(item.access)),
      agents: release.definition.agents.filter((item) => item.enabled && onPlane(item.planes) && allowed(item.access)),
    });
  }

  async draft(context: VerifiedRequestContext, scope = "home"): Promise<AtlasExperienceRelease | null> { this.author(context); const validated=validCode(scope,"scope"); return await this.repository.getDraft({context,scope:validated}) ?? this.repository.getPublished({context,scope:validated}); }
  async saveDraft(context: VerifiedRequestContext, definition: AtlasExperienceDefinition, expectedRevision?: number): Promise<AtlasExperienceRelease> { this.author(context); return this.repository.saveDraft({ context, definition: validateAtlasExperienceDefinition(definition), ...(expectedRevision === undefined ? {} : { expectedRevision }) }); }
  async publish(context: VerifiedRequestContext, scope: string, expectedRevision: number): Promise<AtlasExperienceRelease> { this.author(context); if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw invalidDefinition("A positive expected revision is required."); return this.repository.publish({ context, scope: validCode(scope, "scope"), expectedRevision }); }
  private author(context: VerifiedRequestContext): void { if (context.planeKey !== "studio") throw new HttpError(403,"ATLAS_EXPERIENCE_STUDIO_REQUIRED","Atlas experience authoring is owned by Studio."); }
}

export class KyselyAtlasExperienceConfigurationRepository implements AtlasExperienceConfigurationRepository {
  constructor(private readonly transactions: PlaneTransactionCoordinator<Tx>, private readonly now: () => Date = () => new Date(), private readonly createId: () => string = randomUUID) {}
  getDraft(input: { readonly context: VerifiedRequestContext; readonly scope: string }): Promise<AtlasExperienceRelease | null> { return this.one(input.context, input.scope, "draft"); }
  getPublished(input: { readonly context: VerifiedRequestContext; readonly scope: string }): Promise<AtlasExperienceRelease | null> { return this.one(input.context, input.scope, "published"); }
  async saveDraft(input: { readonly context: VerifiedRequestContext; readonly definition: AtlasExperienceDefinition; readonly expectedRevision?: number }): Promise<AtlasExperienceRelease> {
    return this.transactions.run(input.context.planeKey, { tenantId: input.context.tenantId, principalId: input.context.principalId }, async (tx) => {
      const current = (await sql<Row>`SELECT * FROM ai.atlas_experience_release WHERE tenant_id=${input.context.tenantId}::uuid AND scope=${input.definition.scope} AND status='draft' FOR UPDATE`.execute(tx)).rows[0];
      const currentRevision = current ? Number(current["revision"]) : 0;
      if (input.expectedRevision !== undefined && input.expectedRevision !== currentRevision) throw new HttpError(409,"ATLAS_EXPERIENCE_REVISION_CONFLICT","Atlas experience revision conflict.");
      const published = (await sql<{ revision: number }>`SELECT revision FROM ai.atlas_experience_release WHERE tenant_id=${input.context.tenantId}::uuid AND scope=${input.definition.scope} AND status='published'`.execute(tx)).rows[0];
      const revision = Math.max(currentRevision, Number(published?.revision ?? 0)) + 1;
      const at = this.now().toISOString(), definition = JSON.stringify(input.definition), hash = contentHash(input.definition);
      const result = current
        ? await sql<Row>`UPDATE ai.atlas_experience_release SET revision=${revision},definition=${definition}::jsonb,content_hash=${hash},updated_at=${at}::timestamptz,updated_by=${input.context.principalId}::uuid WHERE id=${String(current["id"])}::uuid RETURNING *`.execute(tx)
        : await sql<Row>`INSERT INTO ai.atlas_experience_release(id,tenant_id,scope,revision,status,definition,content_hash,created_at,created_by) VALUES(${this.createId()}::uuid,${input.context.tenantId}::uuid,${input.definition.scope},${revision},'draft',${definition}::jsonb,${hash},${at}::timestamptz,${input.context.principalId}::uuid) RETURNING *`.execute(tx);
      return release(result.rows[0]!);
    });
  }
  async publish(input: { readonly context: VerifiedRequestContext; readonly scope: string; readonly expectedRevision: number }): Promise<AtlasExperienceRelease> {
    return this.transactions.run(input.context.planeKey, { tenantId: input.context.tenantId, principalId: input.context.principalId }, async (tx) => {
      const draft = (await sql<Row>`SELECT * FROM ai.atlas_experience_release WHERE tenant_id=${input.context.tenantId}::uuid AND scope=${input.scope} AND status='draft' AND revision=${input.expectedRevision} FOR UPDATE`.execute(tx)).rows[0];
      if (!draft) throw new HttpError(409,"ATLAS_EXPERIENCE_REVISION_CONFLICT","Atlas experience draft is missing or stale.");
      const at = this.now().toISOString();
      await sql`UPDATE ai.atlas_experience_release SET status='retired',updated_at=${at}::timestamptz,updated_by=${input.context.principalId}::uuid WHERE tenant_id=${input.context.tenantId}::uuid AND scope=${input.scope} AND status='published'`.execute(tx);
      const result = await sql<Row>`UPDATE ai.atlas_experience_release SET status='published',published_at=${at}::timestamptz,published_by=${input.context.principalId}::uuid,updated_at=${at}::timestamptz,updated_by=${input.context.principalId}::uuid WHERE id=${String(draft["id"])}::uuid RETURNING *`.execute(tx);
      return release(result.rows[0]!);
    });
  }
  private one(context: VerifiedRequestContext, scope: string, status: "draft" | "published"): Promise<AtlasExperienceRelease | null> { return this.transactions.run(context.planeKey, { tenantId: context.tenantId, principalId: context.principalId }, async (tx) => { const row = (await sql<Row>`SELECT * FROM ai.atlas_experience_release WHERE tenant_id=${context.tenantId}::uuid AND scope=${scope} AND status=${status} LIMIT 1`.execute(tx)).rows[0]; return row ? release(row) : null; }); }
}

export function validateAtlasExperienceDefinition(value: AtlasExperienceDefinition): AtlasExperienceDefinition {
  if (value.schema !== "atlas-experience-definition/1") throw invalidDefinition("Unsupported Atlas experience schema.");
  validCode(value.scope, "scope"); bounded(value.widgets, 8, "widgets"); bounded(value.searchSources, 32, "search sources"); bounded(value.prompts, 24, "prompts"); bounded(value.agents, 12, "agents");
  unique(value.widgets.map((item) => item.code), "widget"); unique(value.searchSources.map((item) => item.code), "search source"); unique(value.prompts.map((item) => item.code), "prompt"); unique(value.agents.map((item) => item.code), "agent");
  if (new Set(value.widgets.map((item) => item.kind)).size !== value.widgets.length) throw invalidDefinition("Each built-in widget kind can be configured only once.");
  value.widgets.forEach(validateWidget); value.searchSources.forEach(validateSource); value.agents.forEach(validateAgent);
  const agents = new Map(value.agents.map((item) => [item.code,item])); value.prompts.forEach((item) => { validatePrompt(item); const agent=agents.get(item.agentCode); if (!agent) throw invalidDefinition(`Prompt ${item.code} references an unknown agent.`); if(item.planes.some((plane)=>!agent.planes.includes(plane)))throw invalidDefinition(`Prompt ${item.code} targets a plane where its agent is unavailable.`); });
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 128 * 1024) throw invalidDefinition("Atlas experience definition exceeds 128 KiB.");
  return Object.freeze(value);
}

function validateWidget(item: AtlasWidgetConfiguration) { validCode(item.code, "widget code"); if (!["recommendations", "quick-actions", "workspaces", "recent"].includes(item.kind)) throw invalidDefinition("Widget kind is invalid."); text(item.title, 80, "widget title"); planes(item.planes); if (!Number.isSafeInteger(item.order) || item.order < 0 || item.order > 100) throw invalidDefinition("Widget order is invalid."); access(item.access); }
function validateSource(item: AtlasSearchSourceConfiguration) { validCode(item.code, "source code"); if (!["navigation", "record", "knowledge"].includes(item.kind)) throw invalidDefinition("Search source kind is invalid."); text(item.label, 100, "source label"); planes(item.planes); if (item.permissionCode) validCode(item.permissionCode, "permission code"); if (item.entityCode) validCode(item.entityCode, "entity code"); if (item.routePrefix && (!item.routePrefix.startsWith("/") || item.routePrefix.includes(".."))) throw invalidDefinition("Search source route is invalid."); }
function validatePrompt(item: AtlasPromptConfiguration) { validCode(item.code, "prompt code"); validCode(item.agentCode, "agent code"); text(item.label, 100, "prompt label"); text(item.prompt, 1000, "prompt"); planes(item.planes); access(item.access); }
function validateAgent(item: AtlasAgentConfiguration) { validCode(item.code, "agent code"); text(item.promptRevision, 128, "prompt revision"); text(item.name, 80, "agent name"); text(item.description, 240, "agent description"); text(item.publicModelId, 128, "public model id"); if (!["public", "internal", "confidential", "restricted"].includes(item.dataClass)) throw invalidDefinition("Agent data class is invalid."); planes(item.planes); bounded(item.toolCodes, 32, "agent tools"); item.toolCodes.forEach((code) => validCode(code, "tool code")); access(item.access); }
function access(value?: { readonly permissions?: readonly string[]; readonly features?: readonly string[] }) { bounded(value?.permissions ?? [], 32, "permissions"); bounded(value?.features ?? [], 32, "features"); value?.permissions?.forEach((item) => validCode(item, "permission")); value?.features?.forEach((item) => validCode(item, "feature")); }
function planes(value: readonly string[]) { if (!value.length || value.some((plane) => !PLANES.includes(plane as typeof PLANES[number]))) throw invalidDefinition("At least one valid target plane is required."); }
function bounded(value: readonly unknown[], maximum: number, label: string) { if (!Array.isArray(value) || value.length > maximum) throw invalidDefinition(`Atlas experience ${label} exceed the configured limit.`); }
function unique(values: readonly string[], label: string) { const normalized = values.map((value) => validCode(value, `${label} code`)); if (new Set(normalized).size !== normalized.length) throw invalidDefinition(`Atlas experience ${label} codes must be unique.`); }
function validCode(value: string, label: string): string { if (!CODE.test(value)) throw invalidDefinition(`Atlas experience ${label} is invalid.`); return value; }
function text(value: string, maximum: number, label: string) { if (!value.trim() || value.length > maximum) throw invalidDefinition(`Atlas experience ${label} is invalid.`); }
function contentHash(value: AtlasExperienceDefinition): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
function canonical(value:unknown):string{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;return`{${Object.entries(value as Record<string,unknown>).filter(([,item])=>item!==undefined).sort(([left],[right])=>left.localeCompare(right)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;}
function release(row: Row): AtlasExperienceRelease { const definition = (typeof row["definition"] === "string" ? JSON.parse(row["definition"]) : row["definition"]) as AtlasExperienceDefinition; return Object.freeze({ releaseId: String(row["id"]), tenantId: String(row["tenant_id"]), revision: Number(row["revision"]), status: String(row["status"]) as AtlasExperienceRelease["status"], definition, contentHash: String(row["content_hash"]), createdAt: new Date(String(row["created_at"])).toISOString(), createdBy: String(row["created_by"]), ...(row["published_at"] ? { publishedAt: new Date(String(row["published_at"])).toISOString() } : {}), ...(row["published_by"] ? { publishedBy: String(row["published_by"]) } : {}) }); }

function invalidDefinition(message: string): HttpError { return new HttpError(400,"ATLAS_EXPERIENCE_INVALID_DEFINITION",message); }
