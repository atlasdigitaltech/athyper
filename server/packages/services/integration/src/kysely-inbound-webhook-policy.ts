import { sql,type Kysely } from "kysely";
import type { InboundWebhookPolicy,InboundWebhookPolicyResolver } from "@athyper/server-contract-integration";
export class KyselyInboundWebhookPolicyResolver implements InboundWebhookPolicyResolver{
  constructor(private readonly db:Kysely<Record<string,never>>){}
  async resolve(subscriptionId:string):Promise<InboundWebhookPolicy|undefined>{const row=(await sql<Record<string,unknown>>`SELECT tenant_id,id,signing_secret_reference,signature_header,timestamp_header,timestamp_tolerance_seconds,max_body_bytes FROM control.webhook_subscription WHERE id=${subscriptionId}::uuid AND status='active'`.execute(this.db)).rows[0];if(!row||!row["signing_secret_reference"])return undefined;return{tenantId:String(row["tenant_id"]),subscriptionId:String(row["id"]),signingSecretReference:String(row["signing_secret_reference"]),signatureHeader:String(row["signature_header"]),timestampHeader:String(row["timestamp_header"]),toleranceSeconds:Number(row["timestamp_tolerance_seconds"]),maxBodyBytes:Number(row["max_body_bytes"]),algorithm:"hmac-sha256"};}
}
