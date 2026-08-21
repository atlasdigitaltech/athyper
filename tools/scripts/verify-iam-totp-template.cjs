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
const errors = [];

const leftPanelStart = source.indexOf('class="kc-panel-left"');
const rightPanelStart = source.indexOf('class="kc-panel-right"');
if (leftPanelStart < 0 || rightPanelStart < 0 || leftPanelStart > rightPanelStart) {
  errors.push("left and right IAM panels are missing or out of order");
}
if (/<\/div>\s*<\/div>\s*<\/div>\s*<!-- -- Right form panel -- -->/i.test(source)) {
  errors.push("unexpected extra closing divs before the right IAM panel");
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
