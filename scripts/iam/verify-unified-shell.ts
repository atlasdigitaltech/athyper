#!/usr/bin/env tsx
/**
 * Static contract check for the unified Keycloak IAM shell.
 *
 * This intentionally does not try to interpret FreeMarker. It catches shell
 * drift, missing shared includes, duplicate document roots, and regressions to
 * product-specific titles before a theme is copied into a Keycloak runtime.
 */

import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const loginRoot = path.join(repoRoot, "stack/config/iam/themes/neon/login");
const cssRoot = path.join(loginRoot, "resources/css");
const presentationProviderRoot = path.join(
  repoRoot,
  "stack/config/iam/extensions/iam-presentation-context/src/main/java/com/athyper/iam/presentation",
);

const REQUIRED_PAGES = [
  "error.ftl",
  "info.ftl",
  "login-config-totp.ftl",
  "login-magic-link.ftl",
  "login-oauth-grant.ftl",
  "login-otp.ftl",
  "login-password.ftl",
  "login-reset-password.ftl",
  "login-update-password.ftl",
  "login-username.ftl",
  "login.ftl",
  "select-organization.ftl",
  "verify-email.ftl",
  "webauthn-error.ftl",
  "webauthn-register.ftl",
] as const;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateCenteredShell(page: string, source: string, failures: string[]): void {
  type Frame = { classes: Set<string>; line: number };
  const stack: Frame[] = [];
  const counts = new Map<string, number>();
  const requiredParents = new Map<string, string>([
    ["kc-panel-right", "iam-shell"],
    ["kc-form-wrapper", "kc-panel-right"],
    ["kc-form-card", "kc-form-wrapper"],
    ["kc-footer", "kc-panel-right"],
  ]);
  const tags = /<\/?div\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tags.exec(source)) !== null) {
    const line = source.slice(0, match.index).split("\n").length;
    if (match[0].startsWith("</")) {
      if (stack.length === 0) {
        failures.push(`${page}:${line}: unexpected closing div`);
      } else {
        stack.pop();
      }
      continue;
    }

    const classMatch = match[0].match(/\bclass=(?:"([^"]*)"|'([^']*)')/i);
    const classes = new Set((classMatch?.[1] ?? classMatch?.[2] ?? "").split(/\s+/).filter(Boolean));
    for (const className of classes) counts.set(className, (counts.get(className) ?? 0) + 1);

    for (const [child, expectedParent] of requiredParents) {
      if (!classes.has(child)) continue;
      const parent = stack.at(-1);
      if (!parent?.classes.has(expectedParent)) {
        failures.push(`${page}:${line}: .${child} must be directly inside .${expectedParent}`);
      }
    }
    stack.push({ classes, line });
  }

  for (const frame of stack) failures.push(`${page}:${frame.line}: unclosed div`);
  for (const className of ["iam-shell", "kc-panel-right", "kc-form-wrapper", "kc-form-card", "kc-footer"]) {
    if (counts.get(className) !== 1) {
      failures.push(`${page}: expected exactly one .${className}, found ${counts.get(className) ?? 0}`);
    }
  }
}

async function main(): Promise<void> {
  const failures: string[] = [];

  for (const page of REQUIRED_PAGES) {
    const source = await readFile(path.join(loginRoot, page), "utf8");
    const checks: Array<[string, boolean]> = [
      ["shared IAM context include", source.includes('<#include "_iam-context.ftl">')],
      ["shared resolver include", source.includes('<#include "_theme-resolver.ftl">')],
      ["unified shell class", source.includes('class="iam-shell kc-page"')],
      ["client-derived plane binding", source.includes('data-plane="${iamPlane}"')],
      ["dynamic page title", source.includes("${iamTitle(")],
      ["single document root", (source.match(/<!DOCTYPE html>/g) ?? []).length === 1],
      ["single body root", (source.match(/<body(?:\s|>)/g) ?? []).length === 1],
      ["single title element", (source.match(/<title>/g) ?? []).length === 1],
    ];

    for (const [label, passed] of checks) {
      if (!passed) failures.push(`${page}: missing ${label}`);
    }
    validateCenteredShell(page, source, failures);
  }

  const resolver = await readFile(path.join(loginRoot, "_theme-resolver.ftl"), "utf8");
  const context = await readFile(path.join(loginRoot, "_iam-context.ftl"), "utf8");
  const identityField = await readFile(path.join(loginRoot, "_identity-field.ftl"), "utf8");
  const greeting = await readFile(path.join(loginRoot, "_greeting.ftl"), "utf8");
  const changeUserScript = await readFile(path.join(loginRoot, "_change-user-script.ftl"), "utf8");
  const loginTemplate = await readFile(path.join(loginRoot, "login.ftl"), "utf8");
  const loginCss = await readFile(path.join(cssRoot, "login.css"), "utf8");
  const tokenCss = await readFile(path.join(cssRoot, "iam.tokens.css"), "utf8");
  const generatedCss = await readFile(path.join(cssRoot, "iam.generated.css"), "utf8");
  const realm = await readFile(path.join(repoRoot, "stack/config/iam/realm-athyper.json"), "utf8");
  const presentationForm = await readFile(
    path.join(presentationProviderRoot, "IamPresentationUsernamePasswordForm.java"),
    "utf8",
  );
  const presentationStore = await readFile(
    path.join(presentationProviderRoot, "RedisPresentationContextStore.java"),
    "utf8",
  );
  const iamDockerfile = await readFile(path.join(repoRoot, "stack/config/iam/Dockerfile"), "utf8");
  const redisAclTemplate = await readFile(
    path.join(repoRoot, "stack/config/memorycache/redis-acl.conf.tpl"),
    "utf8",
  );

  try {
    assert(context.includes("client.clientId"), "plane context does not inspect client.clientId");
    assert(context.includes("iamLegacyPlane"), "plane context has no constrained legacy fallback");
    assert(resolver.includes("data-plane"), "resolver does not bind the resolved plane");
    assert(resolver.includes("DOMContentLoaded"), "resolver does not remove legacy carousel markup");
    assert(identityField.includes('id="kc-identity-label"'), "locked identity field has no visible username label");
    assert(identityField.includes("iamLockedIdentity"), "shared locked identity macro is missing");
    assert(loginTemplate.includes("<@iamLockedIdentity"), "login page does not use the shared locked identity row");
    assert(changeUserScript.includes("applicationLoginHint"), "login_hint is not explicitly distinguished from editable usernames");
    assert(greeting.includes("new Date().getHours()"), "IAM greeting does not use browser-local time");
    assert(greeting.includes("Good morning") && greeting.includes("Good afternoon") && greeting.includes("Good evening"), "IAM greeting day periods are incomplete");
    assert(!greeting.includes("URLSearchParams"), "IAM greeting must not read a display name from request parameters");
    assert(!greeting.includes("?html"), "IAM greeting must rely on FreeMarker HTML auto-escaping");
    assert(loginTemplate.includes("<@iamGreeting"), "login page does not use the shared IAM greeting");
    assert(loginTemplate.includes("iamPresentationDisplayName"), "login page does not consume trusted presentation context");
    assert(presentationForm.includes("OIDCLoginProtocol.STATE_PARAM"), "presentation context is not bound to OIDC state");
    assert(presentationForm.includes("OIDCLoginProtocol.LOGIN_HINT_PARAM"), "presentation context is not bound to login_hint");
    assert(presentationForm.includes("protected Response challenge"), "initial username/password challenge does not receive the trusted presentation context");
    assert(presentationStore.includes('command(output, "GETDEL"'), "presentation context is not consumed atomically");
    assert(redisAclTemplate.includes("~iam:presentation:v1:*"), "Redis app ACL does not scope the IAM presentation namespace");
    assert(redisAclTemplate.includes("+getdel"), "Redis app ACL does not allow atomic presentation-context consumption");
    assert((realm.match(/athyper-iam-username-password-form/g) ?? []).length === 2, "user and Admin browser flows must use the Athyper presentation authenticator");
    assert(iamDockerfile.includes("iam-presentation-context-0.1.0.jar"), "Keycloak image does not package the presentation provider");
    assert(loginCss.includes(".iam-shell"), "unified shell CSS is missing");
    assert(loginCss.includes(".kc-panel-left"), "legacy panel removal contract is missing");
    assert(!loginCss.includes("fonts.bunny.net"), "IAM CSS still depends on an external font CDN");
    assert(tokenCss.includes('@font-face'), "IAM CSS does not bundle its application font");
    assert(tokenCss.includes('Geist-Variable.woff2'), "IAM CSS is not bound to the Geist application font");
    await access(path.join(loginRoot, "resources/fonts/Geist-Variable.woff2"));
    assert(generatedCss.includes(".iam-provider-button"), "generated IAM component contract is missing");
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  if (failures.length > 0) {
    console.error("Unified IAM shell verification FAILED:\n");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log(`Unified IAM shell verified (${REQUIRED_PAGES.length} pages).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
