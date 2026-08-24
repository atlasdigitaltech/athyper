import { StudioShell } from "@athyper/product-studio-shell";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadProtectedAppBootstrap } from "@/lib/bootstrap";
import { AppProviders } from "../providers";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({ children }: { readonly children: React.ReactNode }) { const [state,cookieStore] = await Promise.all([loadProtectedAppBootstrap("/"),cookies()]); if (state.state === "redirect") redirect(state.location); const initialCollapsed=cookieStore.get("athyper_shell_collapsed")?.value==="true"; return <AppProviders session={state.session} bootstrap={state.bootstrap} dehydratedState={state.dehydratedState}><StudioShell bootstrap={state.bootstrap} principalId={state.session.principalId ?? "Account"} initialCollapsed={initialCollapsed}>{children}</StudioShell></AppProviders>; }
