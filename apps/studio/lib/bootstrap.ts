import { readRequestDestination } from "@athyper/platform-shell-app-foundation/request-destination";
import { headers } from "next/headers";
import { readProtectedBootstrap } from "@athyper/platform-shell-app-foundation/server";
import { auth } from "@/lib/auth";
import { platformRelay } from "@/lib/relay";

export async function loadProtectedAppBootstrap() { const incoming = new Headers(await headers()); const returnTo = readRequestDestination(incoming); const origin = process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3200"; const request = new Request(new URL(returnTo, origin), { headers: incoming }); return readProtectedBootstrap({ request, returnTo, readSession: (input) => auth.session(input), readExperience: (input) => platformRelay(new Request(new URL("/api/relay/platform/experience/bootstrap", origin), { headers: input.headers, signal: input.signal }), { params: Promise.resolve({ path: ["platform", "experience", "bootstrap"] }) }) }); }
