// {GET|POST|PUT|PATCH|DELETE} /api/me/[...path] — BFF relay to runtime /api/me/*. Identity, preferences, MFA self-service, delegations.
// BUG FIX (Phase 1 review): previously inlined buildRelayHandler; normalized to makeModuleRelay("me") for parity with the other module catchalls.
import { makeModuleRelay } from "@/lib/server/make-module-relay";

export const { GET, POST, PUT, PATCH, DELETE } = makeModuleRelay("me");
