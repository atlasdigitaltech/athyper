import { randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { ProcessSelectionPublication, ProcessExecutionManifest, ProcessTaskBinding } from "@athyper/server-contract-control-admin";
import { createProcessSelectionCatalog, compileProcessSelection, processManifestHash } from "@athyper/server-platform-control-admin";
import { readSupplierProcessWorkflow } from "./supplier-process-workflow.js";
import { HttpError } from "@athyper/server-runtime-http";
type Tx = Transaction<Record<string, never>>; type Row = Record<string, any>;
const object = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function fail(code: string): never { throw new HttpError(409, code, code.replaceAll("_", " ")); }
const catalog = createProcessSelectionCatalog({ planeKey: "neon", workflow: async (revision, scope, tx) => !!await readSupplierProcessWorkflow(revision, scope, tx) });
export async function taskRuleBaselines(tenantId: string, tx: Tx) {
 return (await sql<Row>`SELECT b.id,b.publication->'scope' scope,COALESCE(r.publication,b.publication) publication,r.id release_id FROM control.process_selection_publication b LEFT JOIN LATERAL (SELECT id,publication FROM control.process_task_rule_release WHERE tenant_id=b.tenant_id AND base_publication_id=b.id ORDER BY activated_at DESC LIMIT 1) r ON true WHERE b.tenant_id=${tenantId}::uuid AND b.plane_key='neon' AND b.process_family='supplier_onboarding' AND b.effective_from<=clock_timestamp() AND (b.effective_until IS NULL OR b.effective_until>clock_timestamp()) ORDER BY b.id`.execute(tx)).rows;
}
/** Store the exact proposed task controls with the draft policy, before independent approval. */
export async function proposeTaskRules(input: { tenantId: string; principalId: string; definitionId: string; version: number; hash: string; effectiveOn: string; binding: unknown }, tx: Tx) {
 const b = input.binding;
 if (!object(b) || !uuid(b.basePublicationId) || (b.expectedReleaseId !== null && !uuid(b.expectedReleaseId)) || !Array.isArray(b.tasks) || !b.tasks.length || Object.keys(b).some(k => !["basePublicationId","expectedReleaseId","tasks"].includes(k))) fail("TASK_RULE_BINDING_INVALID");
 const base = (await taskRuleBaselines(input.tenantId, tx)).find(r => r.id === b.basePublicationId);
 if (!base || (base.release_id ?? null) !== b.expectedReleaseId) fail("TASK_RULE_BASE_CHANGED");
 const publication = structuredClone(base.publication) as ProcessSelectionPublication;
 const identities = new Set<string>();
 const controls = new Map<string, Row>();
 for (const t of b.tasks) {
  if (!object(t) || typeof t.profile !== "string" || typeof t.code !== "string" || Object.keys(t).some(k => !["profile","code","informationPolicy","escalationPolicy","caseAuthority"].includes(k))) fail("TASK_RULE_CONTROL_INVALID");
  const key = `${t.profile}:${t.code}`;
  if (controls.has(key)) fail("TASK_RULE_DUPLICATE_CONTROL"); controls.set(key,t);
  const informationSupervisor=t.informationPolicy?.overdueSupervisorRole;
  if (informationSupervisor !== undefined && (typeof informationSupervisor !== "string" || !(await sql`SELECT id FROM authz.role WHERE tenant_id=${input.tenantId}::uuid AND code=${informationSupervisor} AND status='active'`.execute(tx)).rows.length)) fail("TASK_RULE_SUPERVISOR_ROLE_UNAVAILABLE");
  if (t.escalationPolicy !== undefined) {
   if (!object(t.escalationPolicy) || typeof t.escalationPolicy.supervisorRole !== "string") fail("TASK_RULE_SUPERVISOR_INVALID");
   if (!(await sql`SELECT id FROM authz.role WHERE tenant_id=${input.tenantId}::uuid AND code=${t.escalationPolicy.supervisorRole} AND status='active'`.execute(tx)).rows.length) fail("TASK_RULE_SUPERVISOR_ROLE_UNAVAILABLE");
  }
 }
 const manifests = publication.manifests.map(m => {
  const tasks = m.tasks.map(task => {
   const key = `${m.profile.code}:${task.code}`, control = controls.get(key);
   if (!control) return task;
   if (!["review","approval"].includes(task.executionKind)) fail("TASK_RULE_HUMAN_CONTROL_REQUIRED");
   identities.add(key);
   const { profile: _profile, code: _code, ...patch } = control;
   return { ...task, ...patch } as ProcessTaskBinding;
  });
  const next: ProcessExecutionManifest = { ...m, tasks, editPolicy: { id: input.definitionId, definitionId: input.definitionId, version: input.version, hash: input.hash, effectiveOn: input.effectiveOn }, revision: { id: randomUUID(), version: m.revision.version + 1, hash: "" } };
  return { ...next, revision: { ...next.revision, hash: processManifestHash(next) } };
 });
 if (identities.size !== controls.size) fail("TASK_RULE_UNKNOWN_TASK");
 const candidate = { ...publication, manifests }, ports = catalog.compiler(tx);
 const compiled = await compileProcessSelection(candidate, { ...ports, isPublished: async (kind,r,s) => {
  if (kind === "edit_policy" && r.id === input.definitionId && r.hash === input.hash && r.version === input.version) return true;
  if (kind === "manifest" && manifests.some(m => m.revision.id === r.id && m.revision.hash === r.hash && m.revision.version === r.version)) return true;
  return ports.isPublished(kind,r,s);
 } });
 if (!compiled.valid) throw new HttpError(422,"TASK_RULE_COMPILATION_FAILED",JSON.stringify(compiled.issues));
 await sql`INSERT INTO control.process_task_rule_proposal(policy_definition_id,tenant_id,base_publication_id,expected_release_id,publication,created_by)
  VALUES(${input.definitionId}::uuid,${input.tenantId}::uuid,${b.basePublicationId}::uuid,${b.expectedReleaseId}::uuid,${JSON.stringify(candidate)}::jsonb,${input.principalId}::uuid)`.execute(tx);
 return { basePublicationId: b.basePublicationId, expectedReleaseId: b.expectedReleaseId, publication: candidate };
}
export async function publishTaskRules(tenantId: string, principalId: string, definitionId: string, tx: Tx) {
 const proposal = (await sql<Row>`SELECT * FROM control.process_task_rule_proposal WHERE tenant_id=${tenantId}::uuid AND policy_definition_id=${definitionId}::uuid`.execute(tx)).rows[0];
 if (!proposal) return undefined;
 const publication = proposal.publication as ProcessSelectionPublication, s = publication.scope;
 // Same scope lock as the selection publisher; base row lock also serializes release insertions at the database boundary.
 await sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([s.tenantId,s.planeKey,s.processFamily,s.operatingOrganizationId,s.companyCodeId])},0))`.execute(tx);
 await sql`SELECT id FROM control.process_selection_publication WHERE tenant_id=${tenantId}::uuid AND id=${proposal.base_publication_id}::uuid FOR UPDATE`.execute(tx);
 const current = (await taskRuleBaselines(tenantId, tx)).find(r => r.id === proposal.base_publication_id);
 if (!current || (current.release_id ?? null) !== proposal.expected_release_id) fail("TASK_RULE_BASE_CHANGED");
 for (const m of publication.manifests) await sql`INSERT INTO control.process_selection_catalog_revision(id,tenant_id,plane_key,process_family,operating_organization_id,company_code_id,kind,version,content_hash,definition,effective_from,published_by)
  VALUES(${m.revision.id}::uuid,${tenantId}::uuid,'neon',${s.processFamily},${s.operatingOrganizationId}::uuid,${s.companyCodeId}::uuid,'manifest',${m.revision.version},${m.revision.hash},${JSON.stringify(m)}::jsonb,clock_timestamp(),${principalId}::uuid)`.execute(tx);
 const compiled = await compileProcessSelection(publication,catalog.compiler(tx));
 if (!compiled.valid) throw new HttpError(422,"TASK_RULE_COMPILATION_FAILED",JSON.stringify(compiled.issues));
 const release = (await sql<Row>`INSERT INTO control.process_task_rule_release(tenant_id,policy_definition_id,base_publication_id,publication,activated_by)
  VALUES(${tenantId}::uuid,${definitionId}::uuid,${proposal.base_publication_id}::uuid,${JSON.stringify(publication)}::jsonb,${principalId}::uuid) RETURNING id,activated_at`.execute(tx)).rows[0]!;
 return { id: release.id, activatedAt: release.activated_at, basePublicationId: proposal.base_publication_id };
}
