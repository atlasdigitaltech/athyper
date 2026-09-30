/**
 * Configure Keycloak realm SMTP settings and enable email-dependent features.
 *
 * Sets:
 *  - SMTP server (mailhog for dev, override via env vars for production)
 *  - Admin reply-to: manoj.rajendran@atlasdigitaltech.com
 *  - resetPasswordAllowed: true
 *  - verifyEmail: true
 *  - actionTokenGeneratedByUserLifespan: 900s (15 min, used for magic link / verify email)
 *
 * Environment overrides (production):
 *   SMTP_HOST, SMTP_PORT, SMTP_SSL, SMTP_STARTTLS,
 *   SMTP_AUTH, SMTP_USER, SMTP_PASSWORD
 *
 * Usage: node tooling/tools/devtools/keycloackgen/configure-email.mjs
 */

import { getToken, apiJson } from "./shared.mjs";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ── SMTP config (override via env for production) ──────────────────────────
const SMTP = {
  from:                "noreply@athyper.com",
  fromDisplayName:     "Athyper Platform",
  replyTo:             "manoj.rajendran@atlasdigitaltech.com",
  replyToDisplayName:  "Athyper Admin",
  envelopeFrom:        "noreply@athyper.com",
  host:                process.env.SMTP_HOST      ?? "mailhog",
  port:                process.env.SMTP_PORT      ?? "1025",
  ssl:                 process.env.SMTP_SSL       ?? "false",
  starttls:            process.env.SMTP_STARTTLS  ?? "false",
  auth:                process.env.SMTP_AUTH      ?? "false",
  ...(process.env.SMTP_USER     ? { user:     process.env.SMTP_USER }     : {}),
  ...(process.env.SMTP_PASSWORD ? { password: process.env.SMTP_PASSWORD } : {}),
};

async function main() {
  console.log("=== Keycloak Email Configuration ===\n");

  console.log("Fetching admin token…");
  const token = await getToken();

  console.log("Fetching current realm settings…");
  const realm = await apiJson(token, "");

  const patch = {
    ...realm,
    // Enable email-dependent features
    resetPasswordAllowed:              true,
    verifyEmail:                       true,
    // Magic link / verify email tokens expire in 15 min
    actionTokenGeneratedByUserLifespan: 900,
    // SMTP
    smtpServer: SMTP,
  };

  console.log("Applying realm update:");
  console.log(`  SMTP host        : ${SMTP.host}:${SMTP.port}`);
  console.log(`  From             : ${SMTP.from} (${SMTP.fromDisplayName})`);
  console.log(`  Reply-To         : ${SMTP.replyTo} (${SMTP.replyToDisplayName})`);
  console.log(`  SSL / StartTLS   : ${SMTP.ssl} / ${SMTP.starttls}`);
  console.log(`  resetPassword    : true`);
  console.log(`  verifyEmail      : true`);
  console.log(`  Action token TTL : 900s (15 min)`);

  await apiJson(token, "", "PUT", patch);

  console.log("\n✓ Realm email settings updated successfully.");
  console.log("\nNext steps:");
  console.log("  • Open Mailhog at http://localhost:8025 to inspect outbound emails.");
  console.log("  • Run configure-magic-link.mjs to set up the passwordless flow.");
  console.log("  • For production, re-run with SMTP_HOST / SMTP_PORT / SMTP_AUTH env vars.");
}

main().catch((err) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
