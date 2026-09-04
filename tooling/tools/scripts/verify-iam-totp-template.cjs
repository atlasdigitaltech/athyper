#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const templatePath = path.resolve(
  __dirname,
  "..",
  "..",
  "stack",
  "config",
  "iam",
  "themes",
  "neon",
  "login",
  "login-config-totp.ftl",
);
const source = fs.readFileSync(templatePath, "utf8");
const cssPath = path.resolve(
  __dirname,
  "..",
  "..",
  "stack",
  "config",
  "iam",
  "themes",
  "neon",
  "login",
  "resources",
  "css",
  "login.css",
);
const css = fs.readFileSync(cssPath, "utf8");
const errors = [];

const sharedHeaderStart = source.indexOf('<#include "_iam-header.ftl">');
const rightPanelStart = source.indexOf('class="kc-panel-right"');
if (sharedHeaderStart < 0 || rightPanelStart < 0 || sharedHeaderStart > rightPanelStart) {
  errors.push("shared IAM header and right panel are missing or out of order");
}
if (/<\/div>\s*<\/div>\s*<\/div>\s*<!-- -- Right form panel -- -->/i.test(source)) {
  errors.push("unexpected extra closing divs before the right IAM panel");
}

if (!source.includes('<body class="kc-page-totp">')) {
  errors.push("TOTP page must opt into the long-form split-panel layout");
}
if (!/\.kc-page-totp \.kc-story-panel\s*\{[^}]*position:\s*sticky;[^}]*height:\s*100dvh;/s.test(css)) {
  errors.push("TOTP story panel must remain viewport-aligned while the form scrolls");
}

if (!source.includes('onclick="toggleSecret(this)"')) {
  errors.push("manual authenticator-secret toggle must pass its button explicitly");
}
if (!source.includes("function toggleSecret(btn)")) {
  errors.push("manual authenticator-secret toggle must not depend on global event");
}

if (errors.length > 0) {
  console.error("IAM TOTP template verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("IAM TOTP template verification passed.");
