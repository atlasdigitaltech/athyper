/** User-authorized DEV pilot self-service opt-in through each principal's session. */
import { request } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
const origin = "https://neon.dev.athyper.test";
const report: any = {
  at: new Date().toISOString(),
  scope:
    "User-authorized DEV pilot; local Mailpit capture; self-service API resolves current email",
  receipts: [],
};
try {
  for (const principal of ["catl.admin", "catl.owner"]) {
    const client = await request.newContext({
      baseURL: origin,
      storageState: `tests/e2e/.auth/dev/neon/${principal}.json`,
      ignoreHTTPSErrors: true,
    });
    try {
      const csrf = (await client.storageState()).cookies.find((c) =>
        /^(__Host-)?athyper-csrf$/.test(c.name),
      );
      if (!csrf) throw Error("CSRF missing");
      const response = await client.post(
        "/api/relay/notifications/preferences/email-consent",
        {
          headers: {
            origin,
            "x-csrf-token": decodeURIComponent(csrf.value),
            "Idempotency-Key": randomUUID(),
          },
          data: { consented: true },
        },
      );
      const body = await response.json();
      report.receipts.push({ principal, status: response.status(), body });
      if (!response.ok())
        throw Error(JSON.stringify({ status: response.status(), body }));
    } finally {
      await client.dispose();
    }
  }
  report.passed = true;
} finally {
  writeFileSync(
    "governance/policy/reports/supplier-communications-dev-consent.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
