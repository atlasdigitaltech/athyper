import { compareProfileChange, resolveProfileChange, type ProfileChangePreview } from "./business-partner-profile-change.js";
import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { BusinessPartnerRequestService } from "@athyper/server-contract-master-data";

type Tx = Transaction<Record<string, never>>;
type Row = Readonly<Record<string, unknown>>;
const ALGORITHM = Object.freeze({ code: "mesh_business_partner_candidate_v1", version: 1, weights: { accountCode: 100, legalName: 80, displayName: 60, websiteHost: 25, countryCode: 10 }, tieBreak: ["score_desc", "code_asc", "id_asc"] });
export const businessPartnerProfileMatchPermissions = Object.freeze({ create: "neon.business_partner_profile_match.create", read: "neon.business_partner_profile_match.read", request: "neon.business_partner_profile_match.request" } as const);
export const acceptedMeshBusinessPartnerFieldPaths = Object.freeze(["partner.accountCode", "partner.displayName", "partner.legalName", "partner.legalForm", "partner.countryCode", "partner.incorporationDate", "partner.websiteUrl", "partner.description"] as const);

export class NeonProfileMatchError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = "NeonProfileMatchError"; } }
export interface ProfileMatchTransactions { run<T>(plane: "neon", actor: { tenantId: string; principalId: string; requestId?: string; correlationId?: string }, work: (tx: Tx) => Promise<T>): Promise<T>; }
export interface ProfileMatchCandidate { readonly businessPartnerId: string; readonly code: string; readonly name: string; readonly displayName?: string; readonly legalName?: string; readonly legalForm?: string; readonly countryCode?: string; readonly incorporationDate?: string; readonly websiteUrl?: string; readonly description?: string; readonly score: number; readonly reasons: readonly string[]; readonly fingerprint: string; }
export interface ProfileMatch { readonly id: string; readonly snapshotId: string; readonly projectionId: string; readonly sourcePayloadHash: string; readonly sourcePublicationVersion: number; readonly operatingOrganizationId: string; readonly companyCodeId?: string; readonly candidateBusinessPartnerId?: string; readonly algorithm: { readonly code: string; readonly version: number; readonly hash: string }; readonly rankedCandidates: readonly ProfileMatchCandidate[]; readonly fieldDiff: readonly Readonly<Record<string, unknown>>[]; readonly diffHash: string; readonly createdAt: string; readonly replayed: boolean; }

export interface BusinessPartnerProfileMatchRepository {
  resolutionByKey(tenantId: string, key: string, tx: Tx): Promise<Row | null>;
  saveResolution(input: {tenantId:string;projectionId:string;orgId:string;preview:ProfileChangePreview;decisions:Readonly<Record<string,"source"|"local">>;proposed:Row;key:string;principalId:string}, tx:Tx): Promise<Row>;
  changeBaseline(tenantId: string, projectionId: string, businessPartnerId: string, tx: Tx): Promise<{snapshotId: string; payload: Row; paths: readonly string[]} | null>;
  currentPartner(tenantId: string, businessPartnerId: string, operatingOrganizationId: string, tx: Tx): Promise<{version: number; fields: Row} | null>;
  source(tenantId: string, snapshotId: string, tx: Tx): Promise<{ projectionId: string; publicationId: string; publicationVersion: number; payloadHash: string; payload: Readonly<Record<string, unknown>> } | null>;
  candidates(tenantId: string, operatingOrganizationId: string, tx: Tx): Promise<readonly CandidateRow[]>;
  matchByKey(tenantId: string, key: string, tx: Tx): Promise<Row | null>;
  match(tenantId: string, id: string, tx: Tx): Promise<Row | null>;
  createMatch(input: MatchInsert, tx: Tx): Promise<Row | null>;
  acceptanceByKey(tenantId: string, key: string, tx: Tx): Promise<Row | null>;
  createAcceptance(input: AcceptanceInsert, tx: Tx): Promise<Row | null>;
  caseEvent(tenantId: string, acceptanceId: string, tx: Tx): Promise<Row | null>;
  appendCaseEvent(input: { tenantId: string; acceptanceId: string; caseId: string; fingerprint: string; principalId: string }, tx: Tx): Promise<void>;
}
interface CandidateRow { id: string; code: string; name: string; displayName?: string; legalName?: string; legalForm?: string; countryCode?: string; incorporationDate?: string; websiteUrl?: string; description?: string; }
interface MatchInsert { tenantId: string; projectionId: string; snapshotId: string; payloadHash: string; publicationVersion: number; operatingOrganizationId: string; companyCodeId?: string; candidateId?: string; candidateFingerprint?: string; algorithmHash: string; ranked: readonly ProfileMatchCandidate[]; diff: readonly Readonly<Record<string, unknown>>[]; diffHash: string; key: string; principalId: string; }
interface AcceptanceInsert { tenantId: string; matchId: string; snapshotId: string; paths: readonly string[]; payload: Readonly<Record<string, unknown>>; hash: string; key: string; principalId: string; }

export class KyselyBusinessPartnerProfileMatchRepository implements BusinessPartnerProfileMatchRepository {
  async resolutionByKey(tenantId:string,key:string,tx:Tx) {
    return (await sql<Row>`SELECT r.*,c.entity_case_id FROM document.mesh_profile_change_resolution r LEFT JOIN document.mesh_profile_change_case c ON c.tenant_id=r.tenant_id AND c.resolution_id=r.id WHERE r.tenant_id=${tenantId}::uuid AND r.idempotency_key=${key}`.execute(tx)).rows[0]??null;
  }
  async saveResolution(i:{tenantId:string;projectionId:string;orgId:string;preview:ProfileChangePreview;decisions:Readonly<Record<string,"source"|"local">>;proposed:Row;key:string;principalId:string},tx:Tx) {
    const p=i.preview;
    const row=(await sql<Row>`INSERT INTO document.mesh_profile_change_resolution(tenant_id,projection_id,baseline_snapshot_id,incoming_snapshot_id,business_partner_id,operating_organization_id,expected_target_version,preview_fingerprint,preview,decisions,proposed_values,idempotency_key,created_by)
      VALUES(${i.tenantId}::uuid,${i.projectionId}::uuid,${p.baselineSnapshotId}::uuid,${p.incomingSnapshotId}::uuid,${p.businessPartnerId}::uuid,${i.orgId}::uuid,${p.targetVersion},${p.fingerprint},${JSON.stringify(p)}::jsonb,${JSON.stringify(i.decisions)}::jsonb,${JSON.stringify(i.proposed)}::jsonb,${i.key},${i.principalId}::uuid)
      ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING *`.execute(tx)).rows[0];
    return row??(await this.resolutionByKey(i.tenantId,i.key,tx))!;
  }
  async changeBaseline(tenantId: string, projectionId: string, businessPartnerId: string, tx: Tx) {
    const resolved=(await sql<Row>`SELECT r.incoming_snapshot_id,s.payload_json,r.decisions FROM document.mesh_profile_change_resolution r
      JOIN document.mesh_profile_change_case link ON link.tenant_id=r.tenant_id AND link.resolution_id=r.id
      JOIN document.entity_case c ON c.tenant_id=link.tenant_id AND c.id=link.entity_case_id AND c.status='materialized'
      JOIN snapshot.mesh_business_partner_profile_received s ON s.tenant_id=r.tenant_id AND s.id=r.incoming_snapshot_id
      WHERE r.tenant_id=${tenantId}::uuid AND r.projection_id=${projectionId}::uuid AND r.business_partner_id=${businessPartnerId}::uuid
      ORDER BY s.publication_version DESC,r.created_at DESC,r.id DESC LIMIT 1`.execute(tx)).rows[0];
    if(resolved) return {snapshotId:String(resolved["incoming_snapshot_id"]),payload:object(resolved["payload_json"]),paths:Object.entries(object(resolved["decisions"])).filter(([,choice])=>choice==="source").map(([path])=>path)};
    const row = (await sql<Row>`SELECT a.snapshot_id,a.accepted_field_paths,s.payload_json
      FROM document.mesh_business_partner_acceptance a
      JOIN document.mesh_business_partner_match m ON m.tenant_id=a.tenant_id AND m.id=a.match_id
      JOIN document.mesh_business_partner_acceptance_event e ON e.tenant_id=a.tenant_id AND e.acceptance_id=a.id AND e.event_kind='case_created'
      JOIN document.entity_case c ON c.tenant_id=e.tenant_id AND c.id=e.entity_case_id
      JOIN snapshot.mesh_business_partner_profile_received s ON s.tenant_id=a.tenant_id AND s.id=a.snapshot_id
      WHERE a.tenant_id=${tenantId}::uuid AND m.projection_id=${projectionId}::uuid
        AND c.target_entity_id=${businessPartnerId}::uuid AND c.status='materialized'
      ORDER BY s.publication_version DESC,a.created_at DESC,a.id DESC LIMIT 1`.execute(tx)).rows[0];
    return row ? {snapshotId: String(row["snapshot_id"]), payload: object(row["payload_json"]), paths: array(row["accepted_field_paths"]) as readonly string[]} : null;
  }
  async currentPartner(tenantId: string, businessPartnerId: string, operatingOrganizationId: string, tx: Tx) {
    const row = (await sql<Row>`SELECT bp.record_version,bp.display_name,bp.legal_name,bp.legal_form,bp.registration_country_code,bp.incorporation_date::text,bp.website_url,bp.description
      FROM master.business_partner bp WHERE bp.tenant_id=${tenantId}::uuid AND bp.id=${businessPartnerId}::uuid AND bp.is_active
      AND EXISTS(SELECT 1 FROM master.business_partner_operating_organization_assignment a WHERE a.tenant_id=bp.tenant_id AND a.business_partner_id=bp.id AND a.operating_organization_id=${operatingOrganizationId}::uuid AND a.is_active) FOR SHARE OF bp`.execute(tx)).rows[0];
    return row ? {version: Number(row["record_version"]), fields: {displayName: row["display_name"], legalName: row["legal_name"], legalForm: row["legal_form"], countryCode: row["registration_country_code"], incorporationDate: row["incorporation_date"], websiteUrl: row["website_url"], description: row["description"]}} : null;
  }
  async source(tenantId: string, snapshotId: string, tx: Tx) { const row=(await sql<Row>`SELECT p.id projection_id,s.publication_id,s.publication_version,s.payload_hash,s.payload_json FROM snapshot.mesh_business_partner_profile_received s JOIN control.mesh_business_partner_profile_projection p ON p.tenant_id=s.tenant_id AND p.current_snapshot_id=s.id WHERE s.tenant_id=${tenantId}::uuid AND s.id=${snapshotId}::uuid AND p.projection_status='active' FOR SHARE OF p`.execute(tx)).rows[0]; return row?{projectionId:String(row["projection_id"]),publicationId:String(row["publication_id"]),publicationVersion:Number(row["publication_version"]),payloadHash:String(row["payload_hash"]),payload:object(row["payload_json"])}:null; }
  async candidates(tenantId: string, operatingOrganizationId: string, tx: Tx) { const rows=(await sql<Row>`SELECT DISTINCT bp.id,bp.code,bp.name,bp.display_name,bp.legal_name,bp.legal_form,bp.registration_country_code,bp.incorporation_date::text,bp.website_url,bp.description FROM master.business_partner bp JOIN master.business_partner_operating_organization_assignment a ON a.tenant_id=bp.tenant_id AND a.business_partner_id=bp.id WHERE bp.tenant_id=${tenantId}::uuid AND a.operating_organization_id=${operatingOrganizationId}::uuid AND bp.is_active AND a.is_active ORDER BY bp.code,bp.id LIMIT 500`.execute(tx)).rows; return rows.map(row=>({id:String(row["id"]),code:String(row["code"]),name:String(row["name"]),...optional(row,"display_name","displayName"),...optional(row,"legal_name","legalName"),...optional(row,"legal_form","legalForm"),...optional(row,"registration_country_code","countryCode"),...optional(row,"incorporation_date","incorporationDate"),...optional(row,"website_url","websiteUrl"),...optional(row,"description","description")})); }
  async matchByKey(tenantId:string,key:string,tx:Tx){return (await sql<Row>`SELECT * FROM document.mesh_business_partner_match WHERE tenant_id=${tenantId}::uuid AND idempotency_key=${key}`.execute(tx)).rows[0]??null;}
  async match(tenantId:string,id:string,tx:Tx){return (await sql<Row>`SELECT * FROM document.mesh_business_partner_match WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`.execute(tx)).rows[0]??null;}
  async createMatch(i:MatchInsert,tx:Tx){return (await sql<Row>`INSERT INTO document.mesh_business_partner_match(tenant_id,projection_id,snapshot_id,source_payload_hash,source_publication_version,operating_organization_id,company_code_id,candidate_business_partner_id,candidate_fingerprint,algorithm_code,algorithm_version,algorithm_hash,ranked_candidates,field_diff,diff_hash,idempotency_key,created_by) VALUES(${i.tenantId}::uuid,${i.projectionId}::uuid,${i.snapshotId}::uuid,${i.payloadHash},${i.publicationVersion},${i.operatingOrganizationId}::uuid,${i.companyCodeId??null}::uuid,${i.candidateId??null}::uuid,${i.candidateFingerprint??null},${ALGORITHM.code},${ALGORITHM.version},${i.algorithmHash},${JSON.stringify(i.ranked)}::jsonb,${JSON.stringify(i.diff)}::jsonb,${i.diffHash},${i.key},${i.principalId}::uuid) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING *`.execute(tx)).rows[0]??null;}
  async acceptanceByKey(tenantId:string,key:string,tx:Tx){return (await sql<Row>`SELECT a.*,event.entity_case_id FROM document.mesh_business_partner_acceptance a LEFT JOIN document.mesh_business_partner_acceptance_event event ON event.tenant_id=a.tenant_id AND event.acceptance_id=a.id AND event.event_kind='case_created' WHERE a.tenant_id=${tenantId}::uuid AND a.request_idempotency_key=${key}`.execute(tx)).rows[0]??null;}
  async createAcceptance(i:AcceptanceInsert,tx:Tx){const row=(await sql<Row>`INSERT INTO document.mesh_business_partner_acceptance(tenant_id,match_id,snapshot_id,accepted_field_paths,proposed_payload,acceptance_hash,request_idempotency_key,created_by) VALUES(${i.tenantId}::uuid,${i.matchId}::uuid,${i.snapshotId}::uuid,${i.paths}::text[],${JSON.stringify(i.payload)}::jsonb,${i.hash},${i.key},${i.principalId}::uuid) ON CONFLICT(tenant_id,request_idempotency_key) DO NOTHING RETURNING *`.execute(tx)).rows[0]; if(row) await sql`INSERT INTO document.mesh_business_partner_acceptance_event(tenant_id,acceptance_id,lifecycle_version,event_kind,event_fingerprint,recorded_by) VALUES(${i.tenantId}::uuid,${String(row["id"])}::uuid,1,'prepared',${i.hash},${i.principalId}::uuid)`.execute(tx); return row??null;}
  async caseEvent(tenantId:string,acceptanceId:string,tx:Tx){return (await sql<Row>`SELECT event.* FROM document.mesh_business_partner_acceptance_event event WHERE event.tenant_id=${tenantId}::uuid AND event.acceptance_id=${acceptanceId}::uuid AND event.event_kind='case_created' LIMIT 1`.execute(tx)).rows[0]??null;}
  async appendCaseEvent(i:{tenantId:string;acceptanceId:string;caseId:string;fingerprint:string;principalId:string},tx:Tx){await sql`INSERT INTO document.mesh_business_partner_acceptance_event(tenant_id,acceptance_id,lifecycle_version,event_kind,entity_case_id,event_fingerprint,recorded_by) VALUES(${i.tenantId}::uuid,${i.acceptanceId}::uuid,2,'case_created',${i.caseId}::uuid,${i.fingerprint},${i.principalId}::uuid) ON CONFLICT(tenant_id,acceptance_id,lifecycle_version) DO NOTHING`.execute(tx);}
}

export function createBusinessPartnerProfileMatchService(options:{authorizer:Authorizer;repository:BusinessPartnerProfileMatchRepository;transactions:ProfileMatchTransactions;businessPartnerRequests:BusinessPartnerRequestService}) {
  return Object.freeze({
    async previewChange(input: {context: VerifiedRequestContext; snapshotId: string; businessPartnerId: string; operatingOrganizationId: string}) {
      validateContext(input.context);
      const snapshotId=uuid(input.snapshotId,"snapshotId"), businessPartnerId=uuid(input.businessPartnerId,"businessPartnerId"), orgId=uuid(input.operatingOrganizationId,"operatingOrganizationId");
      await authorize(options.authorizer,input.context,businessPartnerProfileMatchPermissions.read,orgId);
      return options.transactions.run("neon",actor(input.context),async tx=>{
        const source=await options.repository.source(input.context.tenantId,snapshotId,tx);
        if(!source) throw failure(409,"MESH_PROFILE_SNAPSHOT_NOT_ACTIVE","Select the current active received profile");
        const current=await options.repository.currentPartner(input.context.tenantId,businessPartnerId,orgId,tx);
        if(!current) throw failure(409,"MESH_PROFILE_CANDIDATE_OUT_OF_SCOPE","Partner is not active in the selected operating organization");
        const baseline=await options.repository.changeBaseline(input.context.tenantId,source.projectionId,businessPartnerId,tx);
        if(!baseline) throw failure(409,"MESH_PROFILE_CHANGE_BASELINE_REQUIRED","A materialized acceptance for this partner and relationship is required");
        if(baseline.snapshotId===snapshotId) throw failure(409,"MESH_PROFILE_CHANGE_NOT_NEW","This source snapshot is already accepted");
        return compareProfileChange({baselineSnapshotId:baseline.snapshotId,incomingSnapshotId:snapshotId,businessPartnerId,targetVersion:current.version,
          baseline:object(baseline.payload["partner"]),incoming:object(source.payload["partner"]),current:current.fields,acceptedBaselinePaths:baseline.paths});
      });
    },
    async resolveChange(input:{context:VerifiedRequestContext;snapshotId:string;businessPartnerId:string;operatingOrganizationId:string;fingerprint:string;decisions:Readonly<Record<string,"source"|"local">>;idempotencyKey:string}) {
      validateContext(input.context);
      const snapshotId=uuid(input.snapshotId,"snapshotId"), targetId=uuid(input.businessPartnerId,"businessPartnerId"), orgId=uuid(input.operatingOrganizationId,"operatingOrganizationId"), key=idempotency(input.idempotencyKey);
      if(key.length>180)throw failure(400,"MESH_PROFILE_IDEMPOTENCY_INVALID","Resolution keys must contain at most 180 characters");
      await authorize(options.authorizer,input.context,businessPartnerProfileMatchPermissions.request,orgId);
      const prepared=await options.transactions.run("neon",actor(input.context),async tx=>{
        let row=await options.repository.resolutionByKey(input.context.tenantId,key,tx);
        if(!row){
          const source=await options.repository.source(input.context.tenantId,snapshotId,tx);
          if(!source)throw failure(409,"MESH_PROFILE_SNAPSHOT_NOT_ACTIVE","Received profile is no longer active");
          const current=await options.repository.currentPartner(input.context.tenantId,targetId,orgId,tx);
          const baseline=await options.repository.changeBaseline(input.context.tenantId,source.projectionId,targetId,tx);
          if(!current||!baseline||baseline.snapshotId===snapshotId)throw failure(409,"MESH_PROFILE_CHANGE_BASELINE_REQUIRED","A new source and scoped materialized baseline are required");
          const preview=compareProfileChange({baselineSnapshotId:baseline.snapshotId,incomingSnapshotId:snapshotId,businessPartnerId:targetId,targetVersion:current.version,baseline:object(baseline.payload["partner"]),incoming:object(source.payload["partner"]),current:current.fields,acceptedBaselinePaths:baseline.paths});
          let resolved;
          try{resolved=resolveProfileChange(preview,input.fingerprint,input.decisions);}catch(cause){throw failure(cause instanceof Error&&cause.message.endsWith("STALE")?409:400,"MESH_PROFILE_CHANGE_INVALID",cause instanceof Error?cause.message:"Invalid profile choices");}
          row=await options.repository.saveResolution({tenantId:input.context.tenantId,projectionId:source.projectionId,orgId,preview,decisions:input.decisions,proposed:resolved.proposed,key,principalId:input.context.principalId},tx);
        }
        if(String(row["incoming_snapshot_id"])!==snapshotId||String(row["business_partner_id"])!==targetId||String(row["operating_organization_id"])!==orgId||String(row["created_by"])!==input.context.principalId||String(row["preview_fingerprint"])!==input.fingerprint||stable(row["decisions"])!==stable(input.decisions))throw failure(409,"MESH_PROFILE_CHANGE_KEY_COLLISION","Resolution key was reused for different decisions");
        return row;
      });
      if(prepared["entity_case_id"])return{resolutionId:String(prepared["id"]),requestId:String(prepared["entity_case_id"]),replayed:true};
      // The case repository loads the retained resolution, captures choices in the
      // approved snapshot and links the case in its own atomic draft transaction.
      const source=await options.transactions.run("neon",actor(input.context),tx=>options.repository.source(input.context.tenantId,snapshotId,tx));
      if(!source)throw failure(409,"MESH_PROFILE_SNAPSHOT_NOT_ACTIVE","Received profile is no longer active");
      try {
      const result=await options.businessPartnerRequests.create({context:input.context,idempotencyKey:`mesh-change:${prepared["id"]}`,kind:"amend_partner",targetBusinessPartnerId:targetId,operatingOrganizationId:orgId,
        source:{kind:"mesh",systemCode:"athyper_mesh",entityCode:"business_partner_profile_change",entityId:source.publicationId,projectionId:snapshotId,version:source.publicationVersion,payloadHash:source.payloadHash},
        proposedPayload:{meshChangeResolutionId:String(prepared["id"]),reasonCode:"MESH_PROFILE_CHANGE"}});
      return{resolutionId:String(prepared["id"]),requestId:result.request.id,replayed:result.replayed};
      } catch(cause) {
        // A concurrent request may have committed the same immutable resolution's
        // case while this request was preparing its draft. Recover only that link.
        const linked=await options.transactions.run("neon",actor(input.context),tx=>options.repository.resolutionByKey(input.context.tenantId,key,tx));
        if(linked&&linked["id"]===prepared["id"]&&linked["entity_case_id"])return{resolutionId:String(linked["id"]),requestId:String(linked["entity_case_id"]),replayed:true};
        throw cause;
      }
    },
    async create(input:{context:VerifiedRequestContext;snapshotId:string;operatingOrganizationId:string;companyCodeId?:string;candidateBusinessPartnerId?:string;idempotencyKey:string}) {
      validateContext(input.context); const snapshotId=uuid(input.snapshotId,"snapshotId"), orgId=uuid(input.operatingOrganizationId,"operatingOrganizationId"), companyId=input.companyCodeId?uuid(input.companyCodeId,"companyCodeId"):undefined, candidateId=input.candidateBusinessPartnerId?uuid(input.candidateBusinessPartnerId,"candidateBusinessPartnerId"):undefined, key=idempotency(input.idempotencyKey);
      await authorize(options.authorizer,input.context,businessPartnerProfileMatchPermissions.create,orgId,companyId);
      return options.transactions.run("neon",actor(input.context),async tx=>{
        const existing=await options.repository.matchByKey(input.context.tenantId,key,tx); if(existing) { if(String(existing["snapshot_id"])!==snapshotId||String(existing["operating_organization_id"])!==orgId||nullable(existing["company_code_id"])!==companyId||nullable(existing["candidate_business_partner_id"])!==candidateId)throw failure(409,"MESH_PROFILE_MATCH_KEY_COLLISION","Idempotency key was reused with different match coordinates");return mapMatch(existing,true); }
        const source=await options.repository.source(input.context.tenantId,snapshotId,tx); if(!source) throw failure(409,"MESH_PROFILE_SNAPSHOT_NOT_ACTIVE","Snapshot is not the current active verified MESH projection");
        const partner=object(source.payload["partner"]); const ranked=(await options.repository.candidates(input.context.tenantId,orgId,tx)).map(candidate=>rank(partner,candidate)).sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code)||a.businessPartnerId.localeCompare(b.businessPartnerId));
        const selected=candidateId?ranked.find(value=>value.businessPartnerId===candidateId):undefined;
        if(candidateId&&!selected) throw failure(409,"MESH_PROFILE_CANDIDATE_OUT_OF_SCOPE","Candidate is not active in the selected operating organization");
        const diff=makeDiff(partner,selected); const diffHash=hash(diff),algorithmHash=hash(ALGORITHM);
        const created=await options.repository.createMatch({tenantId:input.context.tenantId,projectionId:source.projectionId,snapshotId,payloadHash:source.payloadHash,publicationVersion:source.publicationVersion,operatingOrganizationId:orgId,...(companyId?{companyCodeId:companyId}:{}),...(selected?{candidateId:selected.businessPartnerId,candidateFingerprint:selected.fingerprint}:{}),algorithmHash,ranked,diff,diffHash,key,principalId:input.context.principalId},tx);
        const row=created??await options.repository.matchByKey(input.context.tenantId,key,tx);
        if(!row||String(row["snapshot_id"])!==snapshotId||String(row["operating_organization_id"])!==orgId||nullable(row["company_code_id"])!==companyId||nullable(row["candidate_business_partner_id"])!==candidateId)throw failure(409,"MESH_PROFILE_MATCH_KEY_COLLISION","Idempotency key was concurrently reused with different match coordinates");
        return mapMatch(row,!created);
      });
    },
    async get(input:{context:VerifiedRequestContext;matchId:string}) { validateContext(input.context); const id=uuid(input.matchId,"matchId"); return options.transactions.run("neon",actor(input.context),async tx=>{const row=await options.repository.match(input.context.tenantId,id,tx);if(!row)throw failure(404,"MESH_PROFILE_MATCH_NOT_FOUND","Match was not found");await authorize(options.authorizer,input.context,businessPartnerProfileMatchPermissions.read,String(row["operating_organization_id"]),nullable(row["company_code_id"]));return mapMatch(row,false);}); },
    async createRequest(input:{context:VerifiedRequestContext;matchId:string;acceptedFieldPaths:readonly string[];idempotencyKey:string}) {
      validateContext(input.context); const matchId=uuid(input.matchId,"matchId"),key=idempotency(input.idempotencyKey),paths=pathsOf(input.acceptedFieldPaths);
      const prepared=await options.transactions.run("neon",actor(input.context),async tx=>{const match=await options.repository.match(input.context.tenantId,matchId,tx);if(!match)throw failure(404,"MESH_PROFILE_MATCH_NOT_FOUND","Match was not found");await authorize(options.authorizer,input.context,businessPartnerProfileMatchPermissions.request,String(match["operating_organization_id"]),nullable(match["company_code_id"]));const source=await options.repository.source(input.context.tenantId,String(match["snapshot_id"]),tx);if(!source)throw failure(409,"MESH_PROFILE_SNAPSHOT_NOT_ACTIVE","Pinned source snapshot was withdrawn or superseded before acceptance");const payload=acceptedPayload(object(source.payload["partner"]),paths);const acceptanceHash=hash({matchId,paths,payload,sourcePayloadHash:String(match["source_payload_hash"])});let acceptance=await options.repository.acceptanceByKey(input.context.tenantId,key,tx);if(acceptance&&String(acceptance["acceptance_hash"])!==acceptanceHash)throw failure(409,"MESH_PROFILE_ACCEPTANCE_KEY_COLLISION","Idempotency key was reused with different accepted fields");acceptance??=await options.repository.createAcceptance({tenantId:input.context.tenantId,matchId,snapshotId:String(match["snapshot_id"]),paths,payload,hash:acceptanceHash,key,principalId:input.context.principalId},tx);acceptance??=await options.repository.acceptanceByKey(input.context.tenantId,key,tx);if(!acceptance||String(acceptance["acceptance_hash"])!==acceptanceHash)throw failure(409,"MESH_PROFILE_ACCEPTANCE_KEY_COLLISION","Idempotency key was concurrently reused with different accepted fields");return{match,source,acceptance,payload,acceptanceHash};});
      const existingRequestId=nullable(prepared.acceptance["entity_case_id"]); if(existingRequestId)return{acceptanceId:String(prepared.acceptance["id"]),caseId:existingRequestId,requestId:existingRequestId,replayed:true};
      const proposedRole=meshProposedRole(prepared.source.payload),target=nullable(prepared.match["candidate_business_partner_id"]);
      const result=await options.businessPartnerRequests.create({context:input.context,idempotencyKey:`mesh-match:${key}`,kind:target?(proposedRole==="customer"?"add_customer":"add_supplier"):"new_partner",source:{kind:"mesh",systemCode:"athyper_mesh",entityCode:`${proposedRole}_business_partner_profile`,entityId:prepared.source.publicationId,projectionId:String(prepared.match["snapshot_id"]),version:prepared.source.publicationVersion,payloadHash:prepared.source.payloadHash},...(target?{targetBusinessPartnerId:target}:{}),requestedRole:proposedRole,operatingOrganizationId:String(prepared.match["operating_organization_id"]),...(prepared.match["company_code_id"]?{companyCodeId:String(prepared.match["company_code_id"])}:{}),proposedPayload:{...prepared.payload,partnerCategory:"organization",...(proposedRole==="customer"?{customerType:"corporate"}:{supplierType:"general"})}});
      await options.transactions.run("neon",actor(input.context),tx=>options.repository.appendCaseEvent({tenantId:input.context.tenantId,acceptanceId:String(prepared.acceptance["id"]),caseId:result.request.id,fingerprint:hash({acceptanceHash:prepared.acceptanceHash,caseId:result.request.id}),principalId:input.context.principalId},tx));
      return{acceptanceId:String(prepared.acceptance["id"]),caseId:result.request.id,requestId:result.request.id,replayed:result.replayed};
    }
  });
}
export type BusinessPartnerProfileMatchService=ReturnType<typeof createBusinessPartnerProfileMatchService>;

function rank(source:Readonly<Record<string,unknown>>,candidate:CandidateRow):ProfileMatchCandidate{let score=0;const reasons:string[]=[];const add=(ok:boolean,points:number,reason:string)=>{if(ok){score+=points;reasons.push(reason);}};add(normal(source["accountCode"])!==""&&normal(source["accountCode"])===normal(candidate.code),100,"ACCOUNT_CODE_EXACT");add(normal(source["legalName"])!==""&&normal(source["legalName"])===normal(candidate.legalName),80,"LEGAL_NAME_NORMALIZED");add(normal(source["displayName"])!==""&&normal(source["displayName"])===normal(candidate.displayName??candidate.name),60,"DISPLAY_NAME_NORMALIZED");add(host(source["websiteUrl"])!==""&&host(source["websiteUrl"])===host(candidate.websiteUrl),25,"WEBSITE_HOST_EXACT");add(normal(source["countryCode"])!==""&&normal(source["countryCode"])===normal(candidate.countryCode),10,"COUNTRY_CODE_EXACT");const base={businessPartnerId:candidate.id,code:candidate.code,name:candidate.name,...(candidate.displayName?{displayName:candidate.displayName}:{}),...(candidate.legalName?{legalName:candidate.legalName}:{}),...(candidate.legalForm?{legalForm:candidate.legalForm}:{}),...(candidate.countryCode?{countryCode:candidate.countryCode}:{}),...(candidate.incorporationDate?{incorporationDate:candidate.incorporationDate}:{}),...(candidate.websiteUrl?{websiteUrl:candidate.websiteUrl}:{}),...(candidate.description?{description:candidate.description}:{}),score,reasons};return{...base,fingerprint:hash(base)};}
function makeDiff(source:Readonly<Record<string,unknown>>,candidate?:ProfileMatchCandidate){return acceptedMeshBusinessPartnerFieldPaths.map(path=>{const field=path.slice(8);const sourceValue=source[field]??null;const candidateValue=candidate?candidate[(field==="accountCode"?"code":field) as keyof ProfileMatchCandidate]??null:null;return{path,sourceValue,candidateValue,equal:stable(sourceValue)===stable(candidateValue)};});}
function acceptedPayload(source:Readonly<Record<string,unknown>>,paths:readonly string[]){if(!paths.includes("partner.legalName"))throw failure(400,"MESH_PROFILE_LEGAL_NAME_REQUIRED","Legal name must be explicitly accepted for the onboarding request");const map:Record<string,string>={accountCode:"partnerCode",displayName:"displayName",legalName:"legalName",legalForm:"legalForm",countryCode:"registrationCountryCode",incorporationDate:"incorporationDate",websiteUrl:"websiteUrl",description:"description"};const result:Record<string,unknown>={};for(const path of paths){const field=path.slice(8),value=source[field];if(value!==undefined&&value!==null&&String(value).trim()!=="")result[map[field]!]=value;}if(!result["legalName"])throw failure(409,"MESH_PROFILE_LEGAL_NAME_MISSING","Pinned MESH snapshot has no legal name to accept");return result;}
function meshProposedRole(payload:Readonly<Record<string,unknown>>):"supplier"|"customer"{const recipient=object(payload["recipient"]),role=recipient["proposedNeonRole"];if(role!=="supplier"&&role!=="customer")throw failure(409,"MESH_PROFILE_ROLE_INVALID","Verified MESH projection must propose supplier or customer role");return role;}
function mapMatch(row:Row,replayed:boolean):ProfileMatch{return{id:String(row["id"]),snapshotId:String(row["snapshot_id"]),projectionId:String(row["projection_id"]),sourcePayloadHash:String(row["source_payload_hash"]),sourcePublicationVersion:Number(row["source_publication_version"]),operatingOrganizationId:String(row["operating_organization_id"]),...(row["company_code_id"]?{companyCodeId:String(row["company_code_id"])}:{}),...(row["candidate_business_partner_id"]?{candidateBusinessPartnerId:String(row["candidate_business_partner_id"])}:{}),algorithm:{code:String(row["algorithm_code"]),version:Number(row["algorithm_version"]),hash:String(row["algorithm_hash"])},rankedCandidates:array(row["ranked_candidates"]) as unknown as ProfileMatchCandidate[],fieldDiff:array(row["field_diff"]) as Readonly<Record<string,unknown>>[],diffHash:String(row["diff_hash"]),createdAt:new Date(String(row["created_at"])).toISOString(),replayed};}
async function authorize(authorizer:Authorizer,context:VerifiedRequestContext,permissionCode:string,orgId:string,companyId?:string){const decision=await authorizer.authorize({context,permissionCode,resource:{tenantId:context.tenantId,operatingOrganizationId:orgId,...(companyId?{companyCodeId:companyId}:{})}});if(!decision.allowed)throw failure(403,"FORBIDDEN",`Permission denied: ${permissionCode}`);}
function validateContext(value:VerifiedRequestContext){if(value.planeKey!=="neon")throw failure(400,"NEON_PROFILE_MATCH_REQUIRED","Profile matching executes only in NEON");}
function actor(value:VerifiedRequestContext){return{tenantId:value.tenantId,principalId:value.principalId,requestId:value.requestId,correlationId:value.correlationId};}
function pathsOf(values:readonly string[]){if(!Array.isArray(values)||values.length<1||values.length>8)throw failure(400,"MESH_PROFILE_ACCEPTANCE_INVALID","Select between one and eight supported fields");const paths=[...new Set(values)].sort();if(paths.length!==values.length||paths.some(path=>!(acceptedMeshBusinessPartnerFieldPaths as readonly string[]).includes(path)))throw failure(400,"MESH_PROFILE_ACCEPTANCE_INVALID","Accepted fields must be unique supported MESH profile paths");return paths;}
function idempotency(value:string){const text=String(value).trim();if(text.length<8||text.length>200)throw failure(400,"MESH_PROFILE_IDEMPOTENCY_INVALID","Idempotency key must contain 8 to 200 characters");return text;}
function uuid(value:string,name:string){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value)))throw failure(400,"MESH_PROFILE_MATCH_INVALID",`${name} must be a UUID`);return String(value);}
function object(value:unknown):Readonly<Record<string,unknown>>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Readonly<Record<string,unknown>>:{};}
function array(value:unknown):readonly unknown[]{return Array.isArray(value)?value:[];}
function optional(row:Row,column:string,key:string){return row[column]==null?{}:{[key]:String(row[column])};}
function nullable(value:unknown){return value==null?undefined:String(value);}
function normal(value:unknown){return String(value??"").normalize("NFKC").trim().toLocaleLowerCase("en").replace(/[^a-z0-9]/g,"");}
function host(value:unknown){try{return new URL(String(value??"")).hostname.toLowerCase().replace(/^www\./,"");}catch{return "";}}
function stable(value:unknown):string{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;return`{${Object.entries(value as Record<string,unknown>).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;}
function hash(value:unknown){return createHash("sha256").update(stable(value)).digest("hex");}
function failure(status:number,code:string,message:string){return new NeonProfileMatchError(status,code,message);}
