import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  journal,
  fixtures,
  base,
  coordinates,
  company,
} from "./protected-reveal-client.mjs";
const r = journal("fields-and-counts", (check) => {
  for (const actor of ["catl.admin", "catl.owner"]) {
    check(
      actor + "_scoped_bank_suffix",
      actor,
      base + "banking" + coordinates,
      "GET",
      {},
      (r) => {
        assert.equal(r.status, 200);
        const a = r.body.data.accounts.find(
          (a) => a.linkId === fixtures.ids.bankLink,
        );
        assert(a);
        assert.equal(a.lastFour, "5432");
        assert.equal(a.maskedAccount.replaceAll(" ", ""), "••••5432");
        assert.equal(a.revealable, actor === "catl.admin");
        assert(!JSON.stringify(r.body).includes("GB82WEST12345698765432"));
      },
    );
    check(
      actor + "_scoped_tax_mask",
      actor,
      base + "identifiers-tax" + coordinates,
      "GET",
      {},
      (r) => {
        assert.equal(r.status, 200);
        const t = r.body.data.items.find((t) => t.id === fixtures.ids.tax);
        assert(t);
        assert.equal(t.maskedValue, "••••");
        assert.equal(t.revealable, actor === "catl.admin");
      },
    );
    check(
      actor + "_nested_company_fields",
      actor,
      base + "customer-company" + coordinates,
      "GET",
      {},
      (r) => {
        assert.equal(r.status, 200);
        const d = r.body.data;
        assert.equal(d.profile.companyCodeId, company);
        assert(
          d.customer.id &&
            d.organizationAssignment.id &&
            d.profile.paymentTermId &&
            d.profile.defaultAccountingProfileId,
        );
        assert.equal(d.profile.status, "active");
      },
    );
  }
  check(
    "bank_suffix_matches_authorized_reveal",
    "catl.admin",
    base + "banking/reveal" + coordinates,
    "POST",
    {
      bankAccountLinkId: fixtures.ids.bankLink,
      purpose: "qualification.neon",
      revealId: randomUUID(),
      purposeExpiresAt: new Date(Date.now() + 60000).toISOString(),
    },
    (r) => {
      assert.equal(r.status, 200);
      assert.equal(r.body.value, "GB82WEST12345698765432");
      assert.equal(r.body.value.slice(-4), "5432");
    },
  );
  for (const [date, count] of [
    ["2026-09-11", 0],
    ["2026-09-12", 1],
    ["2026-09-13", 2],
  ])
    check(
      "finance_asof_" + date,
      "catl.admin",
      base + "business-activity" + coordinates + "&asOf=" + date,
      "GET",
      {},
      (r) => {
        assert.equal(r.status, 200);
        const f = r.body.data.providers.find((p) => p.provider === "finance");
        assert.equal(f.state, "ready");
        assert.equal(
          f.metrics.find((m) => m.code === "draft_journals").value,
          count,
        );
        assert.equal(
          f.metrics.find((m) => m.code === "posted_journals").value,
          0,
        );
      },
    );
});
if (!r.complete) process.exitCode = 1;
