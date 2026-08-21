import type { PublicationArtifactProvenance, PublicationDeadLetter, PublicationDestinationHealth, PublicationOperationsRepository, PublicationPlane } from "@athyper/server-contract-publication";
import { sql, type Kysely } from "kysely";

type Database = Record<string, never>;
type Row = Record<string, unknown>;

export class KyselyPublicationOperationsRepository implements PublicationOperationsRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async getDeadLetter(tenantId: string, deliveryId: string): Promise<PublicationDeadLetter | null> {
    const result = await deadLetterSelect(this.database, tenantId, sql`AND d.id=${deliveryId}::uuid`, 1);
    return result.rows[0] ? mapDeadLetter(result.rows[0]) : null;
  }

  async listDeadLetters(input: { readonly tenantId: string; readonly plane?: PublicationPlane; readonly targetInstance?: string; readonly limit: number; readonly cursor?: string }): Promise<{ readonly items: readonly PublicationDeadLetter[]; readonly nextCursor?: string }> {
    const cursor = decodeCursor(input.cursor);
    const filters = sql`${input.plane ? sql`AND d.target_plane=${input.plane}` : sql``} ${input.targetInstance ? sql`AND d.target_instance=${input.targetInstance}` : sql``} ${cursor ? sql`AND (d.failed_at,d.id)<(${cursor.failedAt}::timestamptz,${cursor.id}::uuid)` : sql``}`;
    const result = await deadLetterSelect(this.database, input.tenantId, filters, input.limit + 1), rows = result.rows.slice(0, input.limit), last = rows.at(-1);
    return { items: rows.map(mapDeadLetter), ...(result.rows.length > input.limit && last ? { nextCursor: encodeCursor(date(last,"failed_at"),string(last,"id")) } : {}) };
  }

  async getDestinationHealth(tenantId: string, targetPlane: PublicationPlane, targetInstance: string): Promise<PublicationDestinationHealth> {
    const result = await sql<Row>`SELECT count(*)::integer sample_count,count(*) FILTER(WHERE status='failed')::integer failures,count(*) FILTER(WHERE status='activated')::integer successes,max(created_at) latest_created_at,max(activated_at) latest_activated_at,max(failed_at) latest_failed_at FROM (SELECT d.status,d.created_at,d.activated_at,d.failed_at FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id WHERE r.tenant_id=${tenantId}::uuid AND d.target_plane=${targetPlane} AND d.target_instance=${targetInstance} ORDER BY d.created_at DESC LIMIT 20) sample`.execute(this.database);
    const row = result.rows[0] ?? {}, samples = integer(row,"sample_count",0), failures = integer(row,"failures",0), successes = integer(row,"successes",0);
    const checkedAt = new Date().toISOString();
    if (samples === 0) return { targetPlane,targetInstance,status:"unknown",checkedAt,consecutiveFailures:0,evidence:{sampleCount:0} };
    const latestFailed = optionalDate(row["latest_failed_at"]), latestActivated = optionalDate(row["latest_activated_at"]), latestCreated = optionalDate(row["latest_created_at"]);
    const status = failures === samples ? "unavailable" : failures > 0 ? "degraded" : successes > 0 ? "healthy" : "unknown";
    return { targetPlane,targetInstance,status,checkedAt,consecutiveFailures:latestFailed && (!latestActivated || latestFailed > latestActivated) ? failures : 0, ...(latestCreated && latestActivated ? { acknowledgementLagMs: Math.max(0,new Date(latestActivated).valueOf()-new Date(latestCreated).valueOf()) } : {}), evidence:{sampleCount:samples,failures,successes} };
  }

  async createReplayDeployment(input: { readonly tenantId: string; readonly deliveryId: string; readonly replayCommandId: string; readonly actorId: string; readonly requestedAt: string }): Promise<{ readonly deploymentId: string; readonly targetPlane: PublicationPlane }> {
    return this.database.transaction().execute(async transaction => {
      const inserted = await sql<Row>`INSERT INTO publication.deployment(command_id,artifact_id,target_plane,target_environment,target_instance,status,attempt_no,correlation_id,created_at,created_by)
        SELECT ${input.replayCommandId}::uuid,d.artifact_id,d.target_plane,d.target_environment,d.target_instance,'pending',d.attempt_no+1,${input.replayCommandId}::uuid,${input.requestedAt}::timestamptz,${input.actorId}::uuid FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id WHERE d.id=${input.deliveryId}::uuid AND d.status='failed' AND r.tenant_id=${input.tenantId}::uuid
        ON CONFLICT(command_id) DO NOTHING RETURNING id,target_plane`.execute(transaction);
      const selected = inserted.rows[0] ? inserted.rows[0] : (await sql<Row>`SELECT d.id,d.target_plane FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id WHERE d.command_id=${input.replayCommandId}::uuid AND r.tenant_id=${input.tenantId}::uuid`.execute(transaction)).rows[0];
      if (!selected) throw new Error("PUBLICATION_DELIVERY_NOT_REPLAYABLE");
      if (inserted.rows[0]) await sql`INSERT INTO publication.deployment_event(deployment_id,from_status,to_status,evidence,occurred_at,occurred_by) VALUES(${string(selected,"id")}::uuid,NULL,'pending',${JSON.stringify({kind:"dlq_replay",sourceDeliveryId:input.deliveryId})}::jsonb,${input.requestedAt}::timestamptz,${input.actorId})`.execute(transaction);
      return { deploymentId:string(selected,"id"),targetPlane:string(selected,"target_plane") as PublicationPlane };
    });
  }

  async recordReplayRequested(input: { readonly tenantId: string; readonly deliveryId: string; readonly replayDeploymentId: string; readonly replayJobId: string; readonly actorId: string; readonly reason: string; readonly requestedAt: string }): Promise<void> {
    await sql`INSERT INTO publication.deployment_event(deployment_id,from_status,to_status,evidence,occurred_at,occurred_by) SELECT d.id,d.status,d.status,${JSON.stringify({kind:"replay_requested",replayDeploymentId:input.replayDeploymentId,replayJobId:input.replayJobId,actorId:input.actorId,reason:input.reason})}::jsonb,${input.requestedAt}::timestamptz,${input.actorId} FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id WHERE d.id=${input.deliveryId}::uuid AND d.status='failed' AND r.tenant_id=${input.tenantId}::uuid`.execute(this.database);
  }

  async getArtifactProvenance(tenantId: string, deploymentId: string): Promise<PublicationArtifactProvenance | null> {
    const result = await sql<Row>`SELECT d.id deployment_id,r.id release_id,r.release_no,r.release_key,d.target_plane,a.artifact_uri,a.content_hash,c.compiler_name,c.compiler_version,a.signing_key_id,a.signature_algorithm,c.created_at compiled_at FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id JOIN publication.artifact_compilation c ON c.publication_release_id=r.id AND c.plane_code=a.plane_code AND c.artifact_kind=a.artifact_kind WHERE d.id=${deploymentId}::uuid AND r.tenant_id=${tenantId}::uuid LIMIT 1`.execute(this.database);
    const row=result.rows[0]; if(!row)return null;
    return { deploymentId:string(row,"deployment_id"),releaseId:string(row,"release_id"),releaseNo:integer(row,"release_no"),publicationKey:string(row,"release_key"),targetPlane:string(row,"target_plane") as PublicationPlane,artifactUri:string(row,"artifact_uri"),artifactHash:string(row,"content_hash"),compilerName:string(row,"compiler_name"),compilerVersion:string(row,"compiler_version"),signingKeyId:string(row,"signing_key_id"),signatureAlgorithm:string(row,"signature_algorithm"),compiledAt:date(row,"compiled_at") };
  }
}

function deadLetterSelect(database:Kysely<Database>,tenantId:string,filters:ReturnType<typeof sql>,limit:number){return sql<Row>`SELECT d.id,d.target_plane,d.target_instance,d.attempt_no,d.failure_code,d.failed_at,d.status,a.content_hash FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id JOIN publication.release r ON r.id=a.publication_release_id WHERE d.status='failed' AND r.tenant_id=${tenantId}::uuid ${filters} ORDER BY d.failed_at DESC,d.id DESC LIMIT ${limit}`.execute(database);}
function mapDeadLetter(row:Row):PublicationDeadLetter{const attempts=integer(row,"attempt_no");return{deliveryId:string(row,"id"),deploymentId:string(row,"id"),targetPlane:string(row,"target_plane") as PublicationPlane,targetInstance:string(row,"target_instance"),status:"dead_letter",attempts,failureCode:typeof row["failure_code"]==="string"?row["failure_code"]:"PUBLICATION_FAILURE",failedAt:date(row,"failed_at"),artifactHash:string(row,"content_hash")};}
function encodeCursor(failedAt:string,id:string):string{return Buffer.from(JSON.stringify({failedAt,id}),"utf8").toString("base64url");} function decodeCursor(value:string|undefined):{failedAt:string;id:string}|undefined{if(!value)return undefined;try{const item=JSON.parse(Buffer.from(value,"base64url").toString("utf8")) as Record<string,unknown>;if(typeof item["failedAt"]==="string"&&typeof item["id"]==="string")return{failedAt:item["failedAt"],id:item["id"]};}catch{}throw new TypeError("PUBLICATION_CURSOR_INVALID");}
function string(row:Row,key:string):string{const value=row[key];if(typeof value!=="string")throw new Error(`PUBLICATION_ROW_INVALID:${key}`);return value;} function integer(row:Row,key:string,fallback?:number):number{if(row[key]===undefined&&fallback!==undefined)return fallback;const value=Number(row[key]);if(!Number.isSafeInteger(value))throw new Error(`PUBLICATION_ROW_INVALID:${key}`);return value;} function date(row:Row,key:string):string{const value=optionalDate(row[key]);if(!value)throw new Error(`PUBLICATION_ROW_INVALID:${key}`);return value;} function optionalDate(value:unknown):string|undefined{if(value===null||value===undefined)return undefined;const parsed=value instanceof Date?value:new Date(String(value));return Number.isNaN(parsed.valueOf())?undefined:parsed.toISOString();}
