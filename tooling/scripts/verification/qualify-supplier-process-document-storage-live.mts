/** Read-only qualification of real generated PDFs and scheduler receipts. No signed URLs or credentials enter the report. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const query = (s: string) =>
  JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-dev-db-1",
        "psql",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "athyper_neon",
      ],
      { input: s, encoding: "utf8" },
    ),
  );
const jobs = query(
  `SELECT coalesce(json_agg(x),'[]'::json) FROM(SELECT j.id,j.case_id,j.purpose,j.status,j.gate_status,j.attempt_count,j.result,a.storage_key,a.storage_bucket,a.size_bytes,a.metadata->'process_document' provenance,a.metadata->'malware_scan' scan FROM governance.process_document_job j JOIN document.attachment a ON a.tenant_id=j.tenant_id AND a.id=(j.result->>'attachmentVersionId')::uuid WHERE j.tenant_id='44444444-4444-4444-8444-444444444444' AND j.status='ready' ORDER BY j.created_at)x;`,
);
const verify = `import{createRequire}from'node:module';import{readFileSync,realpathSync}from'node:fs';import{createHash}from'node:crypto';const require=createRequire(realpathSync('/app/server/node_modules/@athyper/server-adapter-object-storage-s3')+'/package.json');const{S3Client,GetObjectCommand}=require('@aws-sdk/client-s3');const s3=new S3Client({endpoint:'http://objectstorage:9000',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:readFileSync('/run/secrets/objectstorage-app-access-key','utf8').trim(),secretAccessKey:readFileSync('/run/secrets/objectstorage-app-secret-key','utf8').trim()}});let input='';for await(const c of process.stdin)input+=c;const output=[];for(const j of JSON.parse(input)){const r=await s3.send(new GetObjectCommand({Bucket:j.storage_bucket,Key:j.storage_key}));const bytes=Buffer.from(await r.Body.transformToByteArray());output.push({jobId:j.id,sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,pdf:bytes.subarray(0,5).toString()==='%PDF-'});}s3.destroy();console.log(JSON.stringify(output));`;
const objects = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-source-api-1",
      "node",
      "--input-type=module",
      "-e",
      verify,
    ],
    { input: JSON.stringify(jobs), encoding: "utf8" },
  ),
);
for (const j of jobs) {
  const object = objects.find((o: any) => o.jobId === j.id);
  assert.ok(object.pdf);
  assert.equal(object.sha256, j.result.sha256);
  assert.equal(object.sizeBytes, Number(j.size_bytes));
  assert.equal(j.scan.status, "clean");
  assert.equal(j.provenance.sourceSnapshot.id, j.result.sourceSnapshot.id);
  assert.equal(j.provenance.template.id, j.result.template.id);
  assert.equal(j.gate_status, "succeeded");
  delete j.storage_key;
  delete j.storage_bucket;
}
const executions = query(
  `SELECT coalesce(json_agg(x),'[]'::json) FROM(SELECT job_code,status,result_payload,started_at,completed_at FROM ops.job_execution WHERE job_code='supplier.process-documents.poll' ORDER BY (coalesce((result_payload->>'processed')::integer,0)>0) DESC,created_at DESC LIMIT 8)x;`,
);
assert.ok(
  executions.some(
    (e: any) => e.status === "succeeded" && e.result_payload.processed > 0,
  ),
);
const fixtures = JSON.parse(
  readFileSync(
    "governance/policy/reports/supplier-process-submission-live.dev.json",
    "utf8",
  ),
).cases.filter((c: any) => c.process);
const browser = await chromium.launch({ headless: true });
const views: any[] = [];
try {
  const c = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
  });
  const p = await c.newPage();
  await p.goto(
    `https://neon.dev.athyper.test/mdg/business-partner/requests/${fixtures[0].id}`,
  );
  await p.locator("#main-content").waitFor();
  for (const fixture of fixtures) {
    const view = await p.evaluate(async (id: string) => {
      const r = await fetch(
        `/api/relay/governance/process-documents/cases/${id}/view`,
      );
      return { status: r.status, body: await r.json() };
    }, fixture.id);
    assert.equal(view.status, 200);
    assert.ok(
      view.body.some(
        (j: any) => j.status === "ready" && j.gate_status === "succeeded",
      ),
    );
    const purposes = view.body
      .filter((j: any) => j.status === "ready" && j.gate_status === "succeeded")
      .map((j: any) => j.purpose)
      .sort();
    assert.deepEqual(purposes, [
      "activation_confirmation",
      "decision_document",
      "submitted_review_pack",
    ]);
    views.push({
      profile: fixture.level,
      caseId: fixture.id,
      status: view.status,
      ready: true,
      purposes,
    });
  }
  await c.storageState({ path: "tests/e2e/.auth/dev/neon/catl.admin.json" });
} finally {
  await browser.close();
}
const report = {
  at: new Date().toISOString(),
  mode: "Live Gotenberg/ClamAV/S3 storage and scheduler; admin browser verifies owning API views. All three purpose views verified; authenticated reviewer decisions/downloads and controlled upstream activation fixtures have separate receipts.",
  jobs,
  objects,
  executions,
  views,
  passed: true,
};
writeFileSync(
  "governance/policy/reports/supplier-process-document-storage-live.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    passed: true,
    jobs: jobs.length,
    profiles: views.length,
    storedPdfHashesVerified: objects.length,
  }),
);
