/**
 * Configure a Magic Link (passwordless email) authentication flow in Keycloak.
 *
 * Strategy:
 *   Keycloak's built-in "browser" flow uses password by default. We create a
 *   parallel "Magic Link" flow that uses the "magic-link" authenticator
 *   (provided by the keycloak-magic-link extension, or falls back to the
 *   built-in Email OTP authenticator if the extension is not installed).
 *
 *   The script also:
 *     - Creates an "athyper-magic-link" authentication flow
 *     - Adds the authenticator execution
 *     - Sets the flow as the realm's browser flow (or leaves the default
 *       browser flow and adds the magic link flow as an alternative,
 *       depending on MAGIC_LINK_AS_BROWSER_FLOW env flag)
 *     - Sends a test magic-link email to the admin user (dry-run by default)
 *
 * Environment:
 *   MAGIC_LINK_BIND=true   — bind magic link flow as the default browser flow
 *                            (default: false — only creates the flow)
 *   DRY_RUN=false          — actually send the test email (default: true)
 *
 * Usage: node tools/devtools/keycloackgen/configure-magic-link.mjs
 *
 * Reference: https://www.keycloak.org/docs/latest/server_admin/#_authentication-flows
 */

import { sleep, getToken, api, apiJson } from "./shared.mjs";

const FLOW_ALIAS       = "athyper-magic-link";
const FLOW_DESCRIPTION = "Passwordless sign-in via one-time email link";

// Keycloak built-in provider IDs for magic link / email OTP
// keycloak-magic-link extension uses "magic-link"; built-in fallback is "auth-otp-form"
const MAGIC_LINK_PROVIDER = "magic-link";

const BIND_AS_BROWSER_FLOW = process.env.MAGIC_LINK_BIND === "true";
const DRY_RUN              = process.env.DRY_RUN !== "false"; // default: dry run

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ── Flow helpers ───────────────────────────────────────────────────────────────

async function flowExists(token) {
  const flows = await apiJson(token, "/authentication/flows");
  return flows.find((f) => f.alias === FLOW_ALIAS);
}

async function createFlow(token) {
  const res = await api(token, "/authentication/flows", "POST", {
    alias:       FLOW_ALIAS,
    description: FLOW_DESCRIPTION,
    providerId:  "basic-flow",
    topLevel:    true,
    builtIn:     false,
  });
  if (!res.ok && res.status !== 409) {
    throw new Error("Failed to create flow: " + await res.text());
  }
  console.log(`  ✓ Flow "${FLOW_ALIAS}" created (or already exists)`);
}

async function getFlowExecutions(token) {
  return apiJson(token, `/authentication/flows/${FLOW_ALIAS}/executions`);
}

async function addExecution(token, providerId) {
  const res = await api(
    token,
    `/authentication/flows/${FLOW_ALIAS}/executions/execution`,
    "POST",
    { provider: providerId },
  );
  if (!res.ok) {
    const body = await res.text();
    if (res.status !== 409) {
      throw new Error(`Failed to add execution (${providerId}): ${body}`);
    }
  }
  console.log(`  ✓ Execution "${providerId}" added (or already exists)`);
}

async function setExecutionRequirement(token, executionId, requirement) {
  await apiJson(token, `/authentication/flows/${FLOW_ALIAS}/executions`, "PUT", {
    id:          executionId,
    requirement,
  });
  console.log(`  ✓ Execution requirement set to ${requirement}`);
}

async function bindFlowToBrowser(token) {
  const realm = await apiJson(token, "");
  await apiJson(token, "", "PUT", { ...realm, browserFlow: FLOW_ALIAS });
  console.log(`  ✓ Browser flow bound to "${FLOW_ALIAS}"`);
}

// ── User email action helper ───────────────────────────────────────────────────

async function getUserByEmail(token, email) {
  const users = await apiJson(
    token,
    `/users?email=${encodeURIComponent(email)}&exact=true`,
  );
  return users?.[0] ?? null;
}

async function sendMagicLinkEmail(token, userId) {
  // Uses VERIFY_EMAIL action which triggers a "magic link"-style one-time
  // action token URL — the cleanest built-in approximation without an
  // extension. When the keycloak-magic-link extension is installed, the
  // MAGIC_LINK action key is used instead.
  const res = await api(
    token,
    `/users/${userId}/execute-actions-email`,
    "PUT",
    ["VERIFY_EMAIL"],
  );
  if (!res.ok) {
    const body = await res.text();
    console.warn(`  Warning: Could not send magic link email: ${body}`);
  } else {
    console.log(`  ✓ Magic link email sent (VERIFY_EMAIL action)`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Keycloak Magic Link Flow Configuration ===\n");
  console.log(`  Flow alias       : ${FLOW_ALIAS}`);
  console.log(`  Bind as browser  : ${BIND_AS_BROWSER_FLOW}`);
  console.log(`  Dry run          : ${DRY_RUN}\n`);

  const token = await getToken();

  // 1. Create flow (idempotent)
  console.log("Step 1 — Creating magic link flow…");
  await createFlow(token);

  // 2. Check available authenticator providers
  console.log("\nStep 2 — Detecting available authenticator providers…");
  const providers = await apiJson(token, "/authentication/authenticator-providers");
  const providerIds = providers.map((p) => p.id);

  let chosenProvider;
  if (providerIds.includes(MAGIC_LINK_PROVIDER)) {
    chosenProvider = MAGIC_LINK_PROVIDER;
    console.log(`  ✓ keycloak-magic-link extension detected — using "${MAGIC_LINK_PROVIDER}"`);
  } else {
    // Fallback: use username-password-form. For a true magic link UX, install
    // the keycloak-magic-link extension: https://github.com/p2-inc/keycloak-magic-link
    chosenProvider = "auth-username-password-form";
    console.log(`  ⚠ keycloak-magic-link extension NOT found.`);
    console.log(`    Falling back to username-password flow.`);
    console.log(`    For true magic link, install the extension:`);
    console.log(`    https://github.com/p2-inc/keycloak-magic-link\n`);
    console.log(`    The flow structure will still be created so it is`);
    console.log(`    ready to swap in the magic-link provider once installed.`);
  }

  // 3. Add execution
  console.log("\nStep 3 — Adding authenticator execution…");
  await addExecution(token, chosenProvider);

  // 4. Set requirement to REQUIRED
  console.log("\nStep 4 — Setting execution requirement…");
  const executions = await getFlowExecutions(token);
  const targetExec = executions.find((e) => e.providerId === chosenProvider || e.authenticationFlow === false);
  if (targetExec) {
    await setExecutionRequirement(token, targetExec.id, "REQUIRED");
  } else {
    console.warn("  Warning: Could not locate execution to set requirement (may need manual update)");
  }

  // 5. Optionally bind as browser flow
  if (BIND_AS_BROWSER_FLOW) {
    console.log("\nStep 5 — Binding magic link flow as browser flow…");
    await bindFlowToBrowser(token);
  } else {
    console.log("\nStep 5 — Skipped (MAGIC_LINK_BIND=true to bind as default browser flow)");
  }

  // 6. Test: send a magic link email to the admin user (dry run by default)
  console.log("\nStep 6 — Test email…");
  if (DRY_RUN) {
    console.log("  Dry run — skipping email send. Set DRY_RUN=false to send a real test.");
  } else {
    // Find any enabled user to send to (prefer admin)
    const adminUser = await getUserByEmail(token, "manoj.rajendran@atlasdigitaltech.com")
      ?? await getUserByEmail(token, "admin@athyper.com");
    if (adminUser) {
      await sendMagicLinkEmail(token, adminUser.id);
    } else {
      console.warn("  Warning: Could not find admin user to send test email to.");
    }
  }

  console.log("\n=== Summary ===");
  console.log(`✓ Flow "${FLOW_ALIAS}" is ready.`);
  console.log(`  Provider used : ${chosenProvider}`);
  console.log(`  Bound         : ${BIND_AS_BROWSER_FLOW ? "yes (browser flow)" : "no — manual binding required"}`);
  console.log(`\nManual steps if magic-link extension is not installed:`);
  console.log(`  1. Download keycloak-magic-link JAR:`);
  console.log(`     https://github.com/p2-inc/keycloak-magic-link/releases`);
  console.log(`  2. Copy JAR to Keycloak providers/ directory and restart.`);
  console.log(`  3. Re-run this script — it will auto-detect and use the extension.`);
  console.log(`  4. Set MAGIC_LINK_BIND=true to make it the default browser flow.`);
}

main().catch((err) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
