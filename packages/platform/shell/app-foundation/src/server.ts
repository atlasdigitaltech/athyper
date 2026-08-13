import { parseSanitizedSession, principalQueryScope, type SanitizedSession } from "@athyper/contract-platform-auth-session";
import { experienceQueryKeys, parseExperienceBootstrap, type ExperienceBootstrap } from "@athyper/platform-api-client/bootstrap";
import { createServerQueryClient, dehydratePrincipalQueries, type DehydratedState, type QueryClient } from "@athyper/platform-query/server";

export type ProtectedBootstrapResult =
  | Readonly<{ state: "redirect"; location: string; reason: "unauthenticated" | "context_required" | "required_action" }>
  | Readonly<{ state: "ready"; session: SanitizedSession; bootstrap: ExperienceBootstrap; queryClient: QueryClient; dehydratedState: DehydratedState }>;

export interface ProtectedBootstrapDependencies {
  readonly request: Request;
  readSession(request: Request): Promise<Response>;
  readExperience(request: Request, session: SanitizedSession): Promise<Response>;
  readonly queryClient?: QueryClient;
  readonly returnTo?: string;
}

export async function readProtectedBootstrap(input: ProtectedBootstrapDependencies): Promise<ProtectedBootstrapResult> {
  const sessionResponse = await input.readSession(input.request.clone());
  if (sessionResponse.status === 401) return Object.freeze({ state: "redirect", location: loginLocation(input.returnTo), reason: "unauthenticated" });
  if (!sessionResponse.ok) throw new Error(`Session bootstrap failed (${sessionResponse.status})`);
  const session = parseSanitizedSession(await sessionResponse.json());
  if (session.state === "anonymous") return Object.freeze({ state: "redirect", location: loginLocation(input.returnTo), reason: "unauthenticated" });
  if (session.state === "required_action") return Object.freeze({ state: "redirect", location: "/auth/required-action", reason: "required_action" });
  const scope = principalQueryScope(session);
  if (!scope) return Object.freeze({ state: "redirect", location: "/select-context", reason: "context_required" });
  const experienceResponse = await input.readExperience(input.request.clone(), session);
  if (!experienceResponse.ok) throw new Error(`Experience bootstrap failed (${experienceResponse.status})`);
  const bootstrap = parseExperienceBootstrap(await experienceResponse.json());
  if (bootstrap.planeKey !== scope.plane || bootstrap.tenantId !== scope.tenantId || bootstrap.principalId !== scope.principalId) throw new Error("Experience bootstrap does not match the sanitized session context");
  const queryClient = input.queryClient ?? createServerQueryClient();
  const bootstrapKey = experienceQueryKeys.bootstrap(scope);
  queryClient.setQueryDefaults(bootstrapKey, { meta: { safeToDehydrate: true, principalScoped: true, operation: "read" } });
  queryClient.setQueryData(bootstrapKey, bootstrap);
  return Object.freeze({ state: "ready", session, bootstrap, queryClient, dehydratedState: dehydratePrincipalQueries(queryClient, scope) });
}

function loginLocation(returnTo = "/"): string { const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\") ? returnTo : "/"; return `/api/auth/login?returnTo=${encodeURIComponent(safe)}`; }

export type BootstrapRevalidationReason = "expiry" | "auth_epoch" | "context" | "experience_revision";
export function bootstrapRevalidationReason(previous: Readonly<{ session: SanitizedSession; bootstrap: ExperienceBootstrap }>, next: Readonly<{ session: SanitizedSession; bootstrap: ExperienceBootstrap }>, now = Date.now(), expirySkewMs = 60_000): BootstrapRevalidationReason | undefined {
  if (previous.session.plane !== next.session.plane || previous.session.tenantId !== next.session.tenantId || previous.session.principalId !== next.session.principalId) return "context";
  if (previous.session.authEpoch !== next.session.authEpoch) return "auth_epoch";
  const expiry = next.session.expiresAt ? Date.parse(next.session.expiresAt) : Number.NaN;
  if (Number.isFinite(expiry) && expiry - now <= expirySkewMs) return "expiry";
  if (previous.bootstrap.revision !== next.bootstrap.revision) return "experience_revision";
  return undefined;
}
