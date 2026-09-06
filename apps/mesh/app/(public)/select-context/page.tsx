import { sanitizeReturnTo } from "@athyper/platform-shell-app-foundation/request-destination";
import { ContextGatePage, type IdentityContextOption } from "@athyper/platform-iam-identity-gate";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose context" };

export default async function SelectContextPage({ searchParams }: { readonly searchParams: Promise<{ readonly returnTo?: string }> }) { const returnTo=sanitizeReturnTo((await searchParams).returnTo); return <ContextGatePage plane="mesh" returnTo={returnTo} contexts={await loadContexts(returnTo)} />; }
async function loadContexts(returnTo:string): Promise<readonly IdentityContextOption[]> { const incoming=new Headers(await headers()); const origin=process.env.APP_ORIGIN??process.env.NEXT_PUBLIC_APP_ORIGIN??"http://localhost:3100"; const response=await auth.contexts(new Request(`${origin}/api/auth/contexts`,{headers:incoming})); if(response.status===401)redirect(`/sign-in?reason=expired&returnTo=${encodeURIComponent(returnTo)}`); if(!response.ok)redirect(`/sign-in?reason=service&returnTo=${encodeURIComponent(returnTo)}`); const value=await response.json() as {contexts?:unknown}; return Array.isArray(value.contexts)?value.contexts as IdentityContextOption[]:[]; }
