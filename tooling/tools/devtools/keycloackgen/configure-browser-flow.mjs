/**
 * Configure MFA-aware browser authentication flow for athyper realm.
 *
 * PROBLEM BEING SOLVED
 * ────────────────────
 * When CONFIGURE_TOTP is stored as a user-level requiredAction, Keycloak
 * processes it in ANY active session — including the password-reset action
 * token flow. This means: reset email → set password → MFA setup (wrong).
 *
 * CORRECT FLOW
 * ────────────
 * Password reset  →  set new password  →  redirect to LOGIN page
 * Login           →  username + password  →  MFA setup (first time only)
 *
 * HOW
 * ───
 * 1. Clone the built-in "browser" flow into "athyper-browser".
 * 2. Inside the forms sub-flow, add a Conditional OTP sub-flow:
 *      Condition — User Configured  (REQUIRED)  ← skip if OTP already set
 *      OTP Form                     (REQUIRED)  ← prompt if not set
 * 3. Bind "athyper-browser" as the realm browser flow.
 * 4. Remove CONFIGURE_TOTP from ALL existing user requiredActions
 *    (MFA is now enforced by the flow, not by user-level flags).
 *
 * Usage: node tooling/tools/devtools/keycloackgen/configure-browser-flow.mjs
 *
 * Flags:
 *   SKIP_USER_CLEANUP=true  — skip removing CONFIGURE_TOTP from users
 *   DRY_RUN=true            — print plan only, make no changes
 */

import { sleep, getToken, api, apiJson } from "./shared.mjs";

const FLOW_ALIAS = "athyper-browser";
const DRY_RUN    = process.env.DRY_RUN === "true";
const SKIP_USERS = process.env.SKIP_USER_CLEANUP === "true";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ── Flow setup ─────────────────────────────────────────────────────────────────

async function getOrCreateFlow(token) {
  const flows = await apiJson(token, "/authentication/flows");
  const existing = flows.find(f => f.alias === FLOW_ALIAS);
  if (existing) {
    console.log(`  ✓ Flow "${FLOW_ALIAS}" already exists (id: ${existing.id})`);
    return existing;
  }

  // Copy the built-in browser flow
  const res = await api(token, "/authentication/flows/browser/copy", "POST", { newName: FLOW_ALIAS });
  if (!res.ok) throw new Error("Failed to copy browser flow: " + await res.text());
  console.log(`  ✓ Copied "browser" → "${FLOW_ALIAS}"`);

  const updatedFlows = await apiJson(token, "/authentication/flows");
  return updatedFlows.find(f => f.alias === FLOW_ALIAS);
}

async function getFlowExecutions(token) {
  return apiJson(token, `/authentication/flows/${FLOW_ALIAS}/executions`);
}

async function ensureConditionalOtp(token) {
  const executions = await getFlowExecutions(token);

  // Check if conditional OTP sub-flow already wired
  const hasConditionalOtp = executions.some(
    e => e.displayName?.toLowerCase().includes("conditional otp")
      || e.providerId === "auth-conditional-otp-form",
  );
  if (hasConditionalOtp) {
    console.log("  ✓ Conditional OTP sub-flow already present");
    return;
  }

  // Find the "forms" sub-flow (the one that contains username-password)
  const formsFlow = executions.find(
    e => e.displayName?.toLowerCase().includes("form") && e.authenticationFlow,
  );
  if (!formsFlow) {
    console.warn("  ⚠ Could not locate forms sub-flow — skipping OTP wiring");
    console.warn("    Check the flow manually in Keycloak Admin UI → Authentication");
    return;
  }

  // Add Conditional OTP sub-flow under forms
  const subFlowAlias = `${FLOW_ALIAS}-otp-conditional`;
  const res = await api(
    token,
    `/authentication/flows/${formsFlow.flowId}/executions/flow`,
    "POST",
    {
      alias:       subFlowAlias,
      type:        "basic-flow",
      description: "Enforce OTP only if not already configured",
      provider:    "registration-page-form",
    },
  );
  if (!res.ok && res.status !== 409) {
    console.warn("  ⚠ Could not add conditional OTP sub-flow: " + await res.text());
    console.warn("    Wire it manually: Admin → Authentication → athyper-browser → Add step");
    return;
  }
  console.log(`  ✓ Conditional OTP sub-flow "${subFlowAlias}" added`);

  // Give Keycloak a moment to register the new sub-flow
  await sleep(500);

  // Fetch updated executions and set the new sub-flow to CONDITIONAL
  const updatedExecs = await getFlowExecutions(token);
  const newSubFlow = updatedExecs.find(e => e.displayName === subFlowAlias || e.alias === subFlowAlias);
  if (newSubFlow) {
    await apiJson(token, `/authentication/flows/${FLOW_ALIAS}/executions`, "PUT", {
      id: newSubFlow.id, requirement: "CONDITIONAL",
    });
    console.log("  ✓ Sub-flow requirement set to CONDITIONAL");

    // Add condition: User Configured (skip OTP if already set up)
    const condRes = await api(
      token,
      `/authentication/flows/${subFlowAlias}/executions/execution`,
      "POST",
      { provider: "conditional-user-configured" },
    );
    if (condRes.ok || condRes.status === 409) {
      console.log("  ✓ Condition 'User Configured' added");
    }

    // Add OTP Form execution
    const otpRes = await api(
      token,
      `/authentication/flows/${subFlowAlias}/executions/execution`,
      "POST",
      { provider: "auth-otp-form" },
    );
    if (otpRes.ok || otpRes.status === 409) {
      console.log("  ✓ OTP Form execution added");
    }
  } else {
    console.warn("  ⚠ Could not locate the new sub-flow to configure it");
    console.warn("    Open Admin UI → Authentication → athyper-browser and wire OTP manually");
  }
}

async function bindBrowserFlow(token) {
  const realm = await apiJson(token, "");
  await apiJson(token, "", "PUT", { ...realm, browserFlow: FLOW_ALIAS });
  console.log(`  ✓ Browser flow bound to "${FLOW_ALIAS}"`);
}

// ── User cleanup ───────────────────────────────────────────────────────────────

async function removeConfigureTotpFromUsers(token) {
  const users = await apiJson(token, "/users?max=500");
  const human = users.filter(u => !u.username?.startsWith("service-account-"));
  console.log(`  Scanning ${human.length} users for CONFIGURE_TOTP required action…`);

  let cleaned = 0;
  for (const user of human) {
    const actions = user.requiredActions ?? [];
    if (!actions.includes("CONFIGURE_TOTP")) continue;

    const updated = actions.filter(a => a !== "CONFIGURE_TOTP");
    await apiJson(token, `/users/${user.id}`, "PUT", { ...user, requiredActions: updated });
    console.log(`  ✓ Removed CONFIGURE_TOTP from ${user.username}`);
    cleaned++;
  }
  console.log(`  Cleaned ${cleaned} user(s)`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Configure Browser Flow + Conditional MFA ===\n");
  console.log(`  DRY_RUN    : ${DRY_RUN}`);
  console.log(`  SKIP_USERS : ${SKIP_USERS}\n`);

  if (DRY_RUN) {
    console.log("DRY RUN — no changes will be made.");
    console.log("Steps that would run:");
    console.log("  1. Copy 'browser' flow to 'athyper-browser'");
    console.log("  2. Add Conditional OTP sub-flow (skip if already configured)");
    console.log("  3. Bind 'athyper-browser' as realm browser flow");
    console.log("  4. Remove CONFIGURE_TOTP from all user requiredActions");
    return;
  }

  const token = await getToken();

  // 1. Create / verify flow
  console.log("Step 1 — Create browser flow copy…");
  await getOrCreateFlow(token);

  // 2. Wire conditional OTP
  console.log("\nStep 2 — Wire conditional OTP…");
  await ensureConditionalOtp(token);

  // 3. Bind as browser flow
  console.log("\nStep 3 — Bind as realm browser flow…");
  await bindBrowserFlow(token);

  // 4. Clean user required actions
  if (!SKIP_USERS) {
    console.log("\nStep 4 — Remove CONFIGURE_TOTP from user requiredActions…");
    await removeConfigureTotpFromUsers(token);
  } else {
    console.log("\nStep 4 — Skipped (SKIP_USER_CLEANUP=true)");
  }

  console.log("\n=== Done ===");
  console.log("Password reset flow : set password only → redirect to login");
  console.log("Login flow          : username + password → OTP (setup on first login)");
  console.log("\nVerify in Admin UI: Authentication → Flows → athyper-browser");
}

main().catch(err => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
