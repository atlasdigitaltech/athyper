import { readAppEnvironment } from "@/lib/environment";
import { StudioShell } from "@athyper/product-studio-shell";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadProtectedAppBootstrap } from "@/lib/bootstrap";
import { AppProviders } from "../providers";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [state, cookieStore, contexts] = await Promise.all([
    loadProtectedAppBootstrap(),
    cookies(),
    loadShellContexts(),
  ]);
  if (state.state === "redirect") redirect(state.location);
  const initialCollapsed =
    cookieStore.get("athyper_shell_collapsed")?.value === "true";
  return (
    <AppProviders
      session={state.session}
      bootstrap={state.bootstrap}
      dehydratedState={state.dehydratedState}
    >
      <StudioShell
        bootstrap={state.bootstrap}
        principalId={state.session.principalId ?? "Account"}
        contexts={contexts}
        initialCollapsed={initialCollapsed}
      >
        {children}
      </StudioShell>
    </AppProviders>
  );
}
type ShellContext = Readonly<{
  tenantId: string;
  label: string;
  code?: string;
}>;
async function loadShellContexts(): Promise<
  readonly ShellContext[] | undefined
> {
  try {
    const incoming = new Headers(await headers()),
      origin = readAppEnvironment().appOrigin,
      response = await auth.contexts(
        new Request(`${origin}/api/auth/contexts`, { headers: incoming }),
      );
    if (!response.ok) return undefined;
    const value = (await response.json()) as { contexts?: unknown };
    if (!Array.isArray(value.contexts)) return undefined;
    return value.contexts.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      return typeof row.tenantId === "string" &&
        typeof row.tenantName === "string"
        ? [
            {
              tenantId: row.tenantId,
              label: row.tenantName,
              ...(typeof row.tenantCode === "string"
                ? { code: row.tenantCode }
                : {}),
            },
          ]
        : [];
    });
  } catch {
    return undefined;
  }
}
