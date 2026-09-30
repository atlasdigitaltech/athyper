import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { sql, type RawBuilder, type Kysely } from "kysely";
import { createAttachmentRetrievalAdmission } from "@athyper/server-service-attachments/retrieval-admission";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
export async function qualifyAttachmentAdmission(
  db: Kysely<Record<string, never>>,
  context: VerifiedRequestContext,
  transactions: any,
) {
  const change = (query: RawBuilder<unknown>) =>
    db.transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true),set_config('app.database_plane',${context.planeKey},true)`.execute(
        tx,
      );
      return query.execute(tx);
    });
  const attachmentId = randomUUID(),
    seriesId = randomUUID(),
    parentId = randomUUID(),
    linkId = randomUUID();
  const text = "Authorized 😀 Business Partner document",
    sha = "a".repeat(64);
  await change(
    sql`INSERT INTO document.attachment_series(id,tenant_id,created_by) VALUES(${seriesId}::uuid,${context.tenantId}::uuid,${context.principalId}::uuid)`,
  );
  await change(
    sql`INSERT INTO document.attachment(id,tenant_id,series_id,file_name,storage_bucket,storage_key,sha256,is_virus_scanned,text_extraction_status,extracted_text,created_by) VALUES(${attachmentId}::uuid,${context.tenantId}::uuid,${seriesId}::uuid,'fixture.txt','test','fixture',${sha},true,'extracted',${text},${context.principalId}::uuid)`,
  );
  await change(
    sql`UPDATE document.attachment_series SET current_attachment_id=${attachmentId}::uuid WHERE id=${seriesId}::uuid`,
  );
  await change(
    sql`INSERT INTO document.attachment_link(id,tenant_id,attachment_series_id,entity_type,entity_id,link_kind,created_by) VALUES(${linkId}::uuid,${context.tenantId}::uuid,${seriesId}::uuid,'business_partner',${parentId},'context',${context.principalId}::uuid)`,
  );
  let parentAllowed = true,
    attachmentAllowed = true;
  const admission = createAttachmentRetrievalAdmission({
    transactions,
    authorizer: {
      authorize: async () => ({ allowed: attachmentAllowed }),
    } as never,
    authorizeParent: async (input) =>
      parentAllowed &&
      input.entityCode === "business_partner" &&
      input.recordId === parentId,
  });
  const request = {
    context,
    source: {
      tenantId: context.tenantId,
      sourceKind: "attachment",
      sourceId: attachmentId,
      entityCode: "business_partner",
      permissionCode: "documents.read",
    },
    citation: {
      sourceId: attachmentId,
      sourceVersionId: `${attachmentId}:${sha}`,
      contentHash: createHash("sha256").update(text).digest("hex"),
      characterStart: 0,
      characterEnd: text.length,
    },
  };
  assert.equal(await admission.authorize(request), true);
  parentAllowed = false;
  assert.equal(await admission.authorize(request), false);
  parentAllowed = true;
  attachmentAllowed = false;
  assert.equal(await admission.authorize(request), false);
  attachmentAllowed = true;
  assert.equal(
    await admission.authorize({
      ...request,
      citation: { ...request.citation, sourceVersionId: "old" },
    }),
    false,
  );
  await change(
    sql`UPDATE document.attachment SET is_virus_scanned=false WHERE id=${attachmentId}::uuid`,
  );
  assert.equal(await admission.authorize(request), false);
  await change(
    sql`UPDATE document.attachment SET is_virus_scanned=true,extracted_text='changed' WHERE id=${attachmentId}::uuid`,
  );
  assert.equal(await admission.authorize(request), false);
  await change(
    sql`UPDATE document.attachment SET extracted_text=${text} WHERE id=${attachmentId}::uuid`,
  );
  await change(
    sql`DELETE FROM document.attachment_link WHERE id=${linkId}::uuid`,
  );
  assert.equal(await admission.authorize(request), false);
  console.log(
    `PASS ${context.planeKey}: attachment owner admission, parent/attachment revocation, scan eligibility, version/text freshness and link removal`,
  );
}
