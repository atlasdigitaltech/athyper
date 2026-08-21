import { StudioShell } from "@athyper/product-studio-shell";
import { redirect } from "next/navigation";
import { loadProtectedAppBootstrap } from "@/lib/bootstrap";
import { AppProviders } from "../providers";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({ children }: { readonly children: React.ReactNode }) { const state = await loadProtectedAppBootstrap("/"); if (state.state === "redirect") redirect(state.location); return <AppProviders session={state.session} bootstrap={state.bootstrap} dehydratedState={state.dehydratedState}><StudioShell bootstrap={state.bootstrap} principalId={state.session.principalId ?? "Account"}>{children}</StudioShell></AppProviders>; }
