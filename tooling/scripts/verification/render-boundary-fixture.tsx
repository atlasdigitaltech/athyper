import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorSurface, classifyAppError } from "@athyper/platform-shell-app-foundation";

const kind = process.argv[2] ?? "unexpected";
const fixtures: Record<string, unknown> = {
  authentication: { status: 401 },
  "required-action": { status: 403, code: "MFA_REQUIRED" },
  "permission-denied": { status: 403 },
  "context-mismatch": { status: 409, code: "AUTH_CONTEXT_MISMATCH" },
  conflict: { status: 409 }, validation: { status: 422 }, "rate-limit": { status: 429 },
  "service-unavailable": { status: 503, requestId: "req-browser-503" }, network: { kind: "network" }, offline: {}, unexpected: {},
};
const model = classifyAppError({ error: fixtures[kind], online: kind !== "offline", requiredActions: kind === "required-action" ? ["verify_email"] : undefined });
process.stdout.write(renderToStaticMarkup(<ErrorSurface applicationName="Athyper test" model={model} reset={() => undefined} onCompare={() => undefined} />));
