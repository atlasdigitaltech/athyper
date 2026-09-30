import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  journal,
  fixtures,
  bp,
  base,
  coordinates,
  ai,
  organization,
} from "./protected-reveal-client.mjs";

const status = (expected) => (r) => assert.equal(r.status, expected);
const rows = (data) => data?.items ?? [];
const report = journal("providers", (check, report) => {
  for (const actor of ["catl.admin", "catl.owner"]) {
    const name = actor.split(".")[1];
    check(
      name + "_parent",
      actor,
      "/api/records/business_partner/" + bp,
      "GET",
      {},
      status(200),
    );
    for (const section of ["comments", "attachments"])
      check(name + "_" + section, actor, base + section, "GET", {}, (r) => {
        assert.equal(r.status, 200);
        const expected =
          actor === "catl.owner" ? [fixtures.ids[section][0]] : [];
        assert.deepEqual(
          rows(r.body.data).map((x) => x.id),
          expected,
        );
        assert(!JSON.stringify(r.body).includes(fixtures.ids[section][1]));
      });
    check(name + "_bank_masked", actor, base + "banking", "GET", {}, (r) => {
      assert.equal(r.status, 200);
      const text = JSON.stringify(r.body);
      assert(
        text.includes(fixtures.ids.bankLink),
        "Populated bank link required",
      );
      assert(!text.includes("GB82WEST12345698765432"), "Raw bank value leaked");
    });
    check(
      name + "_tax_masked",
      actor,
      base + "identifiers-tax",
      "GET",
      {},
      (r) => {
        assert.equal(r.status, 200);
        const text = JSON.stringify(r.body);
        assert(
          text.includes(fixtures.ids.tax),
          "Populated tax registration required",
        );
        assert(!text.includes("SYNTHETICGB123456789"), "Raw tax value leaked");
      },
    );
    for (const kind of ["bank", "tax"]) {
      const body = {
        ...(kind === "bank"
          ? { bankAccountLinkId: fixtures.ids.bankLink }
          : { taxRegistrationId: fixtures.ids.tax }),
        purpose: "qualification.neon",
        revealId: randomUUID(),
        purposeExpiresAt: new Date(Date.now() + 60000).toISOString(),
      };
      check(
        name + "_" + kind + "_reveal",
        actor,
        base +
          (kind === "bank" ? "banking" : "identifiers-tax") +
          "/reveal" +
          coordinates,
        "POST",
        body,
        (r) => {
          if (actor === "catl.owner") return status(403)(r);
          assert.equal(r.status, 200);
          assert.equal(
            r.body.value,
            kind === "bank" ? "GB82WEST12345698765432" : "SYNTHETICGB123456789",
          );
        },
      );
    }
    check(
      name + "_customer_company",
      actor,
      base + "customer-company" + coordinates,
      "GET",
      {},
      (r) => {
        assert.equal(r.status, 200);
        assert.equal(r.body.state, "ready");
        assert(
          JSON.stringify(r.body.data).includes("customer"),
          "Populated customer profile required",
        );
      },
    );
    check(
      name + "_requests",
      actor,
      base + "requests" + coordinates,
      "GET",
      {},
      (r) => {
        assert.equal(r.status, 200);
        assert(
          rows(r.body.data).length > 0,
          "Populated authorized cases required",
        );
      },
    );
    check(
      name + "_activity",
      actor,
      base + "activity" + coordinates,
      "GET",
      {},
      (r) => {
        assert.equal(r.status, 200);
        assert(
          rows(r.body.data).length > 0,
          "Populated authorized activity required",
        );
      },
    );
    check(
      name + "_missing_transaction_context",
      actor,
      "/api/entity-runtime/business_partner_request/list",
      "GET",
      {},
      status(409),
    );
    check(
      name + "_valid_transaction_context",
      actor,
      "/api/entity-runtime/business_partner_request/list?operatingOrganizationId=" +
        organization,
      "GET",
      {},
      (r) => {
        assert.equal(r.status, 200);
        assert(r.body.rows.length > 0);
      },
    );
  }
  check(
    "atlas_admitted",
    "catl.admin",
    "/api/isolated/ai-record-retrieval",
    "POST",
    ai,
    (r) => {
      assert.equal(r.status, 200);
      assert.equal(r.body.toolCode, "entity_read_record");
      assert.equal(r.body.data.items.length, 1);
      assert(
        Object.keys(r.body.data.items[0]).every((k) =>
          ["code", "display_name", "status", "partner_category"].includes(k),
        ),
      );
      assert.equal(r.body.sources[0].coordinate.recordId, bp);
    },
  );
  check(
    "atlas_without_admission",
    "catl.owner",
    "/api/isolated/ai-record-retrieval",
    "POST",
    ai,
    status(403),
  );
  check(
    "atlas_wrong_descriptor",
    "catl.admin",
    "/api/isolated/ai-record-retrieval",
    "POST",
    { ...ai, descriptorHash: "wrong" },
    status(409),
  );
  check(
    "atlas_arbitrary_field",
    "catl.admin",
    "/api/isolated/ai-record-retrieval",
    "POST",
    { ...ai, fields: ["tax_number"] },
    status(403),
  );
  for (const actor of ["catl.admin", "catl.owner"])
    check(
      actor.split(".")[1] + "_finance_activity",
      actor,
      base + "business-activity" + coordinates,
      "GET",
      {},
      (r) => {
        assert.equal(r.status, 200);
        const provider = r.body.data.providers.find(
          (p) => p.provider === "finance",
        );
        assert(provider);
        if (actor === "catl.owner") {
          assert.equal(provider.state, "unavailable");
          assert.equal(provider.metrics?.length ?? 0, 0);
          assert.equal(provider.reasonCode, "FINANCE_ACTIVITY_FORBIDDEN");
        } else {
          assert.equal(provider.state, "ready");
          assert.deepEqual(
            provider.metrics.map((m) => [m.code, m.value]),
            [
              ["draft_journals", 1],
              ["posted_journals", 0],
            ],
          );
        }
      },
    );
  report.positiveBusinessActivityQualified = report.checks
    .filter((c) => c.label.endsWith("_finance_activity"))
    .every((c) => c.passed);
  report.sqlFilteredJournalCountsQualified =
    report.positiveBusinessActivityQualified;
  report.positiveOrdinaryCaseOpenWorkCountsQualified = false;
});
if (!report.complete) process.exitCode = 1;
