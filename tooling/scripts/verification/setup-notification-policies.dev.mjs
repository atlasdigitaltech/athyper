/** Local Phase 1 authoring fixture. All configuration writes use authenticated
 * APIs and the ordinary validate/test/submit/independent-review/publish path.
 * No SQL, grants, provider calls, or direct projection writes. */
import { request } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const checkOnly = process.argv.includes("--check");
const resume = process.argv.includes("--resume");
if (process.argv.slice(2).some((x) => !["--check", "--resume"].includes(x)))
  throw Error(
    "Usage: node tooling/scripts/verification/setup-notification-policies.dev.mjs [--check | --resume]",
  );
const contexts = [];
async function client(plane, user) {
  const origin = `https://${plane}.dev.athyper.test`;
  const context = await request.newContext({
    ignoreHTTPSErrors: true,
    storageState:
      (user === "catl.admin"
        ? process.env.NOTIFICATION_STUDIO_AUTHOR_STATE
        : process.env.NOTIFICATION_STUDIO_REVIEWER_STATE) ??
      `tests/e2e/.auth/dev/${plane}/${user}.json`,
  });
  contexts.push(context);
  const invoke = async (path, method = "GET", body, extra = {}) => {
    const cookie = (await context.storageState()).cookies.find(
      (c) =>
        c.domain === new URL(origin).hostname &&
        /^(?:__Host-)?athyper-csrf$/.test(c.name),
    );
    const response = await context.fetch(origin + path, {
      method,
      headers: {
        origin,
        ...(cookie ? { "x-csrf-token": decodeURIComponent(cookie.value) } : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { data: body }),
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = { detail: "Non-JSON response" };
    }
    if (!response.ok())
      throw Error(
        `${plane}/${user} ${method} ${path}: HTTP ${response.status()} ${result.code ?? result.error ?? ""} ${result.detail ?? ""}`,
      );
    return result;
  };
  const session = await invoke("/api/auth/session");
  assert.equal(
    session.state,
    "authenticated",
    `Refresh saved ${plane}/${user} session before running this fixture`,
  );
  return {
    session,
    call: (path, method, body, extra) =>
      invoke("/api/relay" + path, method, body, extra),
  };
}
const receiptPath = "/tmp/athyper-notification-phase1.dev.json";
const receipt = resume
  ? JSON.parse(readFileSync(receiptPath, "utf8"))
  : {
      schemaVersion: 1,
      startedAt: new Date().toISOString(),
      phase: "studio-notifications-backend",
      samples: [],
    };
if (
  receipt.phase !== "studio-notifications-backend" ||
  !Array.isArray(receipt.samples)
)
  throw Error("Invalid resume receipt");
const record = () =>
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
const base = "/meta-entity-authoring/change-sets";
const fixture = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../fixtures/notifications/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
try {
  // Complete preflight before creating any draft.
  const author = await client("studio", "catl.admin"),
    reviewer = await client("studio", "catl.owner");
  assert.notEqual(
    author.session.principalId,
    reviewer.session.principalId,
    "Independent review requires different principals",
  );
  assert.equal(author.session.tenantId, reviewer.session.tenantId);
  const existing = await author.call(base);
  assert.ok(Array.isArray(existing));
  const bp = existing.find((d) => d.entityCode === "business_partner");
  assert.ok(bp, "Business Partner must exist in the authoring catalog");
  try {
    await author.call(
      "/meta-entity-authoring/inspection/notifications/business_partner",
    );
  } catch (error) {
    if (!String(error).includes("NOTIFICATION_CONFIGURATION_NOT_PUBLISHED"))
      throw error;
  }
  if (checkOnly) {
    console.log("Authenticated local preflight passed; no changes made.");
  } else {
    const stamp = Date.now().toString(36);
    async function sample(
      name,
      graph,
      entityId,
      registration,
      override = false,
    ) {
      const entityCode = graph.entity.entityCode;
      const targetEntityCode =
        graph.capabilities[0].binding.notifications.targetEntityCode;
      const prior = receipt.samples.find((s) => s.name === name);
      if (prior) {
        if (prior.entityCode !== entityCode)
          throw Error("Resume entity mismatch");
        if (prior.status === "verified-in-neon") return;
        if (prior.status !== "published" || !prior.releaseId)
          throw Error(
            `Inspect unfinished draft ${prior.changeSetId} before resuming`,
          );
        await author.call(`${base}/${prior.changeSetId}/publish`, "POST", {
          releaseId: prior.releaseId,
          targetPlanes: ["neon"],
        });
        await verify(
          prior,
          targetEntityCode,
          override
            ? "override"
            : graph.capabilities[0].binding.notifications.mode,
        );
        return;
      }
      let draft = await author.call(base, "POST", {
        entityId,
        entityCode,
        branchCode: `notifications_${stamp}_${name}`,
        title: `Notification example: ${name}`,
        ...(registration ? { registration } : {}),
      });
      const item = { name, entityCode, changeSetId: draft.id, status: "draft" };
      receipt.samples.push(item);
      record();
      const path = `${base}/${draft.id}`;
      draft = await author.call(path + "/graph", "PUT", graph, {
        "if-match": String(draft.revision),
      });
      const configurationPath = path + "/notifications/comments";
      if (override) {
        const template = {
          key: "bp_mention",
          channel: "email",
          locale: "en",
          version: 1,
          subject: "Business Partner mention",
          bodyText: "A colleague mentioned you: {{excerpt}}",
          variables: { excerpt: "string" },
        };
        let state = await author.call(configurationPath);
        await author.call(configurationPath + "/templates/bp_mention", "PUT", {
          expectedRevision: state.revision,
          template,
        });
        state = await author.call(configurationPath);
        await author.call(configurationPath + "/policy", "PUT", {
          expectedRevision: state.revision,
          policy: {
            schemaVersion: 1,
            mode: "override",
            defaultPolicyRef: "platform.comments.notifications.v1",
            rules: [
              {
                event: "collaboration.comment.mentioned",
                enabled: true,
                recipients: "mentioned",
                channels: ["in_app", "email"],
                templates: [
                  {
                    key: "comment_mention",
                    channel: "in_app",
                    locale: "en",
                    version: 1,
                  },
                  {
                    key: "bp_mention",
                    channel: "email",
                    locale: "en",
                    version: 1,
                  },
                ],
                attachmentMode: "none",
                dedupWindowMs: 300000,
              },
            ],
          },
        });
      }
      const config = await author.call(configurationPath);
      assert.equal(
        config.configuration.mode,
        override
          ? "override"
          : graph.capabilities[0].binding.notifications.mode,
      );
      const templateRead = await author.call(configurationPath + "/templates");
      assert.ok(templateRead.shared.length);
      const preview = await author.call(
        configurationPath + "/preview",
        "POST",
        {
          reference: {
            key: override ? "bp_mention" : "comment_mention",
            channel: "email",
            locale: "en",
            version: 1,
          },
          variables: { excerpt: "Synthetic local preview only." },
        },
      );
      assert.equal(preview.sent, false);
      assert.equal(
        (await author.call(configurationPath + "/validate", "POST", {})).valid,
        true,
      );
      const validation = await author.call(path + "/validate", "POST", {});
      assert.deepEqual(validation.issues, []);
      assert.equal(
        (await author.call(path + "/test", "POST", {})).passed,
        true,
      );
      let state = await author.call(path + "/graph");
      await author.call(path + "/submit", "POST", {
        expectedRevision: state.changeSet.revision,
      });
      state = await reviewer.call(path + "/graph");
      await reviewer.call(path + "/approve", "POST", {
        expectedRevision: state.changeSet.revision,
      });
      state = await author.call(path + "/graph");
      const published = await author.call(path + "/publish", "POST", {
        expectedRevision: state.changeSet.revision,
        targetPlanes: ["neon"],
      });
      item.releaseId = published.release.id;
      item.status = "published";
      record();
      await verify(item, targetEntityCode, config.configuration.mode);
    }
    async function verify(item, targetEntityCode, mode) {
      // Worker dispatch/apply may take a few seconds. Read the verified Neon head.
      const deadline = Date.now() + 120000;
      let read;
      while (Date.now() < deadline) {
        try {
          read = await author.call(
            `/meta-entity-authoring/inspection/notifications/${targetEntityCode}`,
          );
        } catch (error) {
          if (
            !String(error).includes(
              "NOTIFICATION_CONFIGURATION_NOT_PUBLISHED",
            ) &&
            !/HTTP 50[234]/.test(String(error))
          )
            throw error;
        }
        if (read?.releaseId === item.releaseId) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      assert.equal(
        read?.releaseId,
        item.releaseId,
        "Published release did not become the active Neon notification configuration; inspect normal publication jobs before retrying",
      );
      assert.equal(read.notifications.comments.configuration.mode, mode);
      if (mode === "disabled")
        assert.deepEqual(read.notifications.comments.projection.rules, []);
      item.status = "verified-in-neon";
      item.mode = mode;
      record();
      console.log(
        `${item.name}: published and verified in Neon (${item.releaseId})`,
      );
    }
    const configuration = existing.find(
      (d) => d.entityCode === "business_partner_notifications",
    );
    const configurationId = configuration?.entityId ?? randomUUID();
    const registration = {
      schemaVersion: 1,
      moduleCode: "fnd",
      entityClass: "configuration",
      ownershipModel: "tenant",
    };
    await sample(
      "bp_inherit",
      fixture("business-partner-inherit"),
      configurationId,
      configuration ? undefined : registration,
    );
    await sample(
      "bp_override",
      fixture("business-partner-inherit"),
      configurationId,
      undefined,
      true,
    );
    const neutral = existing.find(
      (d) => d.entityCode === "notification_employee_example",
    );
    await sample(
      "employee_disabled",
      fixture("employee-disabled"),
      neutral?.entityId ?? randomUUID(),
      neutral
        ? undefined
        : {
            schemaVersion: 1,
            moduleCode: "fnd",
            entityClass: "configuration",
            ownershipModel: "tenant",
          },
    );
    receipt.completedAt = new Date().toISOString();
    record();
    console.log(`Phase 1 local receipt: ${receiptPath}`);
  }
} finally {
  await Promise.all(contexts.map((c) => c.dispose()));
}
