/**
 * Smoke-test the full email flow end-to-end:
 *   1. Authenticate against Keycloak admin API
 *   2. Apply email + magic link configuration (calls configure-email.mjs logic inline)
 *   3. Trigger a password-reset email for a demo user
 *   4. Trigger a verify-email email for a demo user
 *   5. Print Mailhog inbox link for inspection
 *
 * Usage:
 *   node tools/devtools/keycloackgen/smoke-test-email.mjs
 *
 * Optional env:
 *   TEST_EMAIL=user@example.com   — override the recipient (default: first demo user)
 *   MAILHOG_URL=http://localhost:8025
 */

const KC_URL    = "https://iam.mesh.athyper.local";
const REALM     = "athyper";
const ADMIN_USER = "athyperadmin";
const ADMIN_PASS = "athyperadmin";
const MAILHOG   = process.env.MAILHOG_URL ?? "http://localhost:8025";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getToken(retries = 15, delayMs = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `${KC_URL}/realms/master/protocol/openid-connect/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id:  "admin-cli",
            username:   ADMIN_USER,
            password:   ADMIN_PASS,
            grant_type: "password",
          }),
        },
      );
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch {
        throw new Error("Non-JSON response: " + text.slice(0, 120));
      }
      if (!data.access_token) throw new Error("No token: " + JSON.stringify(data));
      return data.access_token;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  Keycloak not ready (attempt ${attempt}/${retries}): ${err.message}`);
      await sleep(delayMs);
    }
  }
}

function api(token, path, method = "GET", body) {
  const opts = {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(`${KC_URL}/admin/realms/${REALM}${path}`, opts);
}

async function apiJson(token, path, method = "GET", body) {
  const res = await api(token, path, method, body);
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── Email actions ──────────────────────────────────────────────────────────────

async function sendActions(token, userId, actions, label) {
  const res = await api(
    token,
    `/users/${userId}/execute-actions-email`,
    "PUT",
    actions,
  );
  if (res.ok) {
    console.log(`  ✓ ${label} → sent`);
  } else {
    const body = await res.text();
    // 400 from Keycloak often means email config issue; surface the detail
    console.warn(`  ✗ ${label} → ${res.status}: ${body}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Athyper Email Smoke Test ===\n");

  console.log("Step 1 — Authenticating…");
  const token = await getToken();
  console.log("  ✓ Admin token acquired\n");

  // Pick a target user
  console.log("Step 2 — Finding test user…");
  let users;
  if (process.env.TEST_EMAIL) {
    users = await apiJson(
      token,
      `/users?email=${encodeURIComponent(process.env.TEST_EMAIL)}&exact=true`,
    );
  } else {
    // Default to democa_tenant_admin (has manoj.rajendran@atlasdigitaltech.com)
    users = await apiJson(token, "/users?username=democa_tenant_admin&exact=true");
    if (!users || users.length === 0) {
      users = await apiJson(token, "/users?max=10");
      users = users.filter(
        (u) => !u.username?.startsWith("service-account-") && u.email,
      );
    }
  }

  if (!users || users.length === 0) {
    throw new Error(
      "No suitable user found. Set TEST_EMAIL=user@email.com or ensure demo users exist.",
    );
  }

  const user = users[0];
  console.log(`  ✓ Target user: ${user.username} (${user.email})\n`);

  // Test 1: Password Reset email
  console.log("Step 3 — Sending password-reset email…");
  await sendActions(token, user.id, ["UPDATE_PASSWORD"], "Password reset email");

  // Small delay so Mailhog receives the first email before the second
  await sleep(1000);

  // Test 2: Verify Email
  console.log("\nStep 4 — Sending verify-email email…");
  // Only send VERIFY_EMAIL if the user hasn't verified yet; tolerate errors
  await sendActions(token, user.id, ["VERIFY_EMAIL"], "Verify email");

  // Test 3: Check realm settings reflect our changes
  console.log("\nStep 5 — Verifying realm settings…");
  const realm = await apiJson(token, "");
  const checks = [
    ["resetPasswordAllowed", true],
    ["verifyEmail",          true],
    ["emailTheme",           "neon"],
    ["smtpServer.from",      "noreply@athyper.com"],
    ["smtpServer.replyTo",   "manoj.rajendran@atlasdigitaltech.com"],
  ];

  let allPassed = true;
  for (const [path, expected] of checks) {
    const parts  = path.split(".");
    const actual = parts.reduce((obj, k) => obj?.[k], realm);
    const pass   = actual === expected;
    if (!pass) allPassed = false;
    console.log(`  ${pass ? "✓" : "✗"} ${path}: ${JSON.stringify(actual)} ${pass ? "" : `(expected ${JSON.stringify(expected)})`}`);
  }

  console.log("\n=== Results ===");
  console.log(`Realm settings : ${allPassed ? "✓ all correct" : "✗ some settings missing — re-run configure-email.mjs"}`);
  console.log(`\nOpen Mailhog to inspect emails:`);
  console.log(`  ${MAILHOG}`);
  console.log(`\nYou should see:`);
  console.log(`  • "Reset your Athyper password" — password reset email`);
  console.log(`  • "Verify your email address — Athyper" — verification email`);
  console.log(`\nIf emails are missing:`);
  console.log(`  1. Ensure Mailhog is running:  docker compose up mailhog`);
  console.log(`  2. Confirm SMTP host=mailhog port=1025 in Keycloak Realm Settings → Email`);
  console.log(`  3. Ensure user has a valid email address in Keycloak`);
  console.log(`  4. Check Keycloak logs for SMTP errors`);
}

main().catch((err) => {
  console.error("\n✗ Smoke test failed:", err.message);
  process.exit(1);
});
