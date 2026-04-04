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
 * Usage: node tools/devtools/keycloackgen/configure-browser-flow.mjs
 *
 * Flags:
 *   SKIP_USER_CLEANUP=true  — skip removing CONFIGURE_TOTP from users
 *   DRY_RUN=true            — print plan only, make no changes
 */

const KC_URL     = "https://iam.mesh.athyper.local";
const REALM      = "athyper";
const ADMIN_USER = "athyperadmin";
const ADMIN_PASS = "athyperadmin";

const FLOW_ALIAS = "athyper-browser";
const DRY_RUN    = process.env.DRY_RUN === "true";
const SKIP_USERS = process.env.SKIP_USER_CLEANUP === "true";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getToken(retries = 15, delayMs = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `${KC_URL}/realms/master/protocol/openid-connect/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: "admin-cli", username: ADMIN_USER,
            password: ADMIN_PASS,  grant_type: "password",
          }),
        },
      );
      const data = JSON.parse(await res.text());
      if (!data.access_token) throw new Error(JSON.stringify(data));
      return data.access_token;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  Keycloak not ready (${attempt}/${retries}): ${err.message}`);
      await sleep(delayMs);
    }
  }
}

function h(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function GET(token, path) {
  const res = await fetch(`${KC_URL}/admin/realms/${REALM}${path}`, { headers: h(token) });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function POST(token, path, body) {
  const res = await fetch(`${KC_URL}/admin/realms/${REALM}${path}`, {
    method: "POST", headers: h(token), body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok && res.status !== 409) throw new Error(`POST ${path} → ${res.status}: ${text}`);
  // Return Location header ID for created resources
  const loc = res.headers.get("location");
  return loc ? loc.split("/").pop() : (text ? JSON.parse(text) : null);
}

async function PUT(token, path, body) {
  const res = await fetch(`${KC_URL}/admin/realms/${REALM}${path}`, {
    method: "PUT", headers: h(token), body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── Flow setup ─────────────────────────────────────────────────────────────────

async function getOrCreateFlow(token) {
  const flows = await GET(token, "/authentication/flows");
  const existing = flows.find(f => f.alias === FLOW_ALIAS);
  if (existing) {
    console.log(`  ✓ Flow "${FLOW_ALIAS}" already exists (id: ${existing.id})`);
    return existing;
  }

  // Copy the built-in browser flow
  const res = await fetch(
    `${KC_URL}/admin/realms/${REALM}/authentication/flows/browser/copy`,
    {
      method: "POST", headers: h(token),
      body: JSON.stringify({ newName: FLOW_ALIAS }),
    },
  );
  if (!res.ok) throw new Error("Failed to copy browser flow: " + await res.text());
  console.log(`  ✓ Copied "browser" → "${FLOW_ALIAS}"`);

  const updatedFlows = await GET(token, "/authentication/flows");
  return updatedFlows.find(f => f.alias === FLOW_ALIAS);
}

async function getFlowExecutions(token) {
  return GET(token, `/authentication/flows/${FLOW_ALIAS}/executions`);
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
  const res = await fetch(
    `${KC_URL}/admin/realms/${REALM}/authentication/flows/${formsFlow.flowId}/executions/flow`,
    {
      method: "POST", headers: h(token),
      body: JSON.stringify({
        alias:       subFlowAlias,
        type:        "basic-flow",
        description: "Enforce OTP only if not already configured",
        provider:    "registration-page-form",
      }),
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
    await PUT(token, `/authentication/flows/${FLOW_ALIAS}/executions`, {
      id: newSubFlow.id, requirement: "CONDITIONAL",
    });
    console.log("  ✓ Sub-flow requirement set to CONDITIONAL");

    // Add condition: User Configured (skip OTP if already set up)
    const condRes = await fetch(
      `${KC_URL}/admin/realms/${REALM}/authentication/flows/${subFlowAlias}/executions/execution`,
      { method: "POST", headers: h(token), body: JSON.stringify({ provider: "conditional-user-configured" }) },
    );
    if (condRes.ok || condRes.status === 409) {
      console.log("  ✓ Condition 'User Configured' added");
    }

    // Add OTP Form execution
    const otpRes = await fetch(
      `${KC_URL}/admin/realms/${REALM}/authentication/flows/${subFlowAlias}/executions/execution`,
      { method: "POST", headers: h(token), body: JSON.stringify({ provider: "auth-otp-form" }) },
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
  const realm = await GET(token, "");
  await PUT(token, "", { ...realm, browserFlow: FLOW_ALIAS });
  console.log(`  ✓ Browser flow bound to "${FLOW_ALIAS}"`);
}

// ── User cleanup ───────────────────────────────────────────────────────────────

async function removeConfigureTotpFromUsers(token) {
  const users = await GET(token, "/users?max=500");
  const human = users.filter(u => !u.username?.startsWith("service-account-"));
  console.log(`  Scanning ${human.length} users for CONFIGURE_TOTP required action…`);

  let cleaned = 0;
  for (const user of human) {
    const actions = user.requiredActions ?? [];
    if (!actions.includes("CONFIGURE_TOTP")) continue;

    const updated = actions.filter(a => a !== "CONFIGURE_TOTP");
    await PUT(token, `/users/${user.id}`, { ...user, requiredActions: updated });
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
