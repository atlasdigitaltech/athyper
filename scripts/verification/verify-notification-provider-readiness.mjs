#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadStagingProviderEnvironment } from "../../deploy/stackctl/src/provider-config.mjs";

const PUSH_MODES = new Set(["web", "native", "both", "none"]);

function setting(environment, name, { secret = false } = {}) {
  const fileName = `${name}_FILE`;
  const path = environment[fileName]?.trim();
  if (path) {
    const stat = statSync(path);
    if (!stat.isFile()) throw new Error(`${fileName} must reference a regular file`);
    if ((stat.mode & 0o077) !== 0) throw new Error(`${fileName} must be owner-only`);
    const value = readFileSync(path, "utf8").trim();
    if (!value) throw new Error(`${fileName} references an empty file`);
    return { value, source: "file" };
  }
  const value = environment[name]?.trim();
  if (!value) return { value: undefined, source: "absent" };
  if (secret) throw new Error(`${name} must be supplied through ${fileName}`);
  return { value, source: "environment" };
}

function requireSetting(environment, name, options) {
  const resolved = setting(environment, name, options);
  if (!resolved.value) throw new Error(`${name} is required`);
  return resolved;
}

function check(name, work) {
  try {
    const sources = work();
    return { name, status: "pass", ...(sources ? { sources } : {}) };
  } catch (error) {
    return { name, status: "fail", problem: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyNotificationProviderReadiness(environment = process.env, options = {}) {
  const target = options.target ?? "";
  const push = options.push ?? "web";
  if (!new Set(["staging", "production"]).has(target)) {
    throw new Error("Target must be staging or production");
  }
  if (!PUSH_MODES.has(push)) throw new Error("Push mode must be web, native, both, or none");

  const emailProvider = environment.EMAIL_PROVIDER?.trim() || "smtp";
  if (!new Set(["smtp", "ses"]).has(emailProvider)) {
    throw new Error("EMAIL_PROVIDER must be smtp or ses for provider readiness");
  }

  const checks = [emailProvider === "ses"
    ? check("email.ses-v2", () => {
      const region = requireSetting(environment, "SES_REGION");
      const configurationSet = requireSetting(environment, "SES_CONFIGURATION_SET");
      const from = requireSetting(environment, "SES_FROM");
      const eventQueue = requireSetting(environment, "SES_EVENT_QUEUE_URL");
      const configuredEventRegion = setting(environment, "SES_EVENT_REGION");
      const eventRegion = configuredEventRegion.value ? configuredEventRegion : region;
      if (!/^[a-z]{2}(?:-[a-z]+)+-[0-9]+$/u.test(region.value)) {
        throw new Error("SES_REGION must be a valid AWS region name");
      }
      if (!/^[A-Za-z0-9_-]{1,64}$/u.test(configurationSet.value)) {
        throw new Error("SES_CONFIGURATION_SET has an invalid format");
      }
      if (!/^\S+@\S+\.\S+$/u.test(from.value)) throw new Error("SES_FROM must be an email address");
      try {
        const queueUrl = new URL(eventQueue.value);
        if (queueUrl.protocol !== "https:") throw new Error();
      } catch {
        throw new Error("SES_EVENT_QUEUE_URL must be a valid HTTPS URL");
      }
      if (eventRegion.value !== region.value) throw new Error("SES event and sending regions must match");
      return {
        authentication: "workload-identity",
        region: region.source,
        configurationSet: configurationSet.source,
        from: from.source,
        eventQueue: eventQueue.source,
        eventRegion: eventRegion.source,
      };
    })
    : check("smtp.configuration", () => {
      const host = requireSetting(environment, "SMTP_HOST");
      const port = requireSetting(environment, "SMTP_PORT");
      const secure = requireSetting(environment, "SMTP_SECURE");
      const from = requireSetting(environment, "SMTP_FROM");
      const user = requireSetting(environment, "SMTP_USER", { secret: true });
      const password = requireSetting(environment, "SMTP_PASS", { secret: true });
      if (host.value === "mailtrap" || host.value === "localhost") {
        throw new Error("SMTP_HOST must reference the approved external relay");
      }
      const numericPort = Number(port.value);
      if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65_535) {
        throw new Error("SMTP_PORT must be an integer from 1 to 65535");
      }
      if (!new Set(["true", "false"]).has(secure.value)) {
        throw new Error("SMTP_SECURE must be true or false");
      }
      if (!/^\S+@\S+\.\S+$/u.test(from.value)) throw new Error("SMTP_FROM must be an email address");
      return { host: host.source, port: port.source, secure: secure.source, from: from.source, user: user.source, password: password.source };
    }),
  ];

  if (push === "web" || push === "both") {
    checks.push(check("push.web.vapid", () => {
      const subject = requireSetting(environment, "VAPID_SUBJECT");
      const publicKey = requireSetting(environment, "VAPID_PUBLIC_KEY");
      const privateKey = requireSetting(environment, "VAPID_PRIVATE_KEY", { secret: true });
      if (!/^(mailto:|https:\/\/)/u.test(subject.value)) {
        throw new Error("VAPID_SUBJECT must be a mailto: or https:// URI");
      }
      if (!/^[A-Za-z0-9_-]{80,100}$/u.test(publicKey.value)) {
        throw new Error("VAPID_PUBLIC_KEY is not a valid URL-safe P-256 public key");
      }
      if (!/^[A-Za-z0-9_-]{40,60}$/u.test(privateKey.value)) {
        throw new Error("VAPID_PRIVATE_KEY is not a valid URL-safe P-256 private key");
      }
      return { subject: subject.source, publicKey: publicKey.source, privateKey: privateKey.source };
    }));
  }

  if (push === "native" || push === "both") {
    checks.push(check("push.native.fcm", () => {
      const projectId = requireSetting(environment, "PUSH_FCM_PROJECT_ID");
      const clientEmail = requireSetting(environment, "PUSH_FCM_CLIENT_EMAIL");
      const privateKey = requireSetting(environment, "PUSH_FCM_PRIVATE_KEY", { secret: true });
      if (!/^[a-z][a-z0-9-]{4,29}$/u.test(projectId.value)) throw new Error("PUSH_FCM_PROJECT_ID has an invalid format");
      if (!/^\S+@\S+\.iam\.gserviceaccount\.com$/u.test(clientEmail.value)) throw new Error("PUSH_FCM_CLIENT_EMAIL must be a Google service-account address");
      if (!privateKey.value.includes("BEGIN PRIVATE KEY") || !privateKey.value.includes("END PRIVATE KEY")) {
        throw new Error("PUSH_FCM_PRIVATE_KEY must contain a PEM private key");
      }
      return { projectId: projectId.source, clientEmail: clientEmail.source, privateKey: privateKey.source };
    }));
  }

  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "NotificationProviderReadiness",
    target,
    emailProvider,
    push,
    ready: checks.every(({ status }) => status === "pass"),
    checks,
  };
}

function parseArguments(arguments_) {
  const read = (flag, fallback) => {
    const index = arguments_.indexOf(flag);
    return index === -1 ? fallback : arguments_[index + 1];
  };
  return {
    target: read("--target", ""),
    push: read("--push", "web"),
    runtimeRoot: read("--runtime-root", ""),
    json: arguments_.includes("--json"),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const runtimeRoot = resolve(options.runtimeRoot || process.env.ATHYPER_RUNTIME_ROOT || join(homedir(), ".athyper"));
    const provider = options.target === "staging"
      ? loadStagingProviderEnvironment(runtimeRoot, process.env).environment
      : {};
    const secretRoot = join(runtimeRoot, "instances", "stg", "secrets");
    const environment = options.target === "staging" ? {
      ...process.env,
      ...provider,
      EMAIL_PROVIDER: provider.EMAIL_PROVIDER || process.env.EMAIL_PROVIDER || "ses",
      VAPID_SUBJECT_FILE: process.env.VAPID_SUBJECT_FILE || join(secretRoot, "vapid-subject"),
      VAPID_PUBLIC_KEY_FILE: process.env.VAPID_PUBLIC_KEY_FILE || join(secretRoot, "vapid-public-key"),
      VAPID_PRIVATE_KEY_FILE: process.env.VAPID_PRIVATE_KEY_FILE || join(secretRoot, "vapid-private-key"),
    } : process.env;
    const result = verifyNotificationProviderReadiness(environment, options);
    if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      for (const item of result.checks) process.stdout.write(`${item.status.toUpperCase()} ${item.name}${item.problem ? `: ${item.problem}` : ""}\n`);
      process.stdout.write(result.ready ? "Notification providers are ready for an authenticated staging verification.\n" : "Notification providers are not ready.\n");
    }
    process.exitCode = result.ready ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
