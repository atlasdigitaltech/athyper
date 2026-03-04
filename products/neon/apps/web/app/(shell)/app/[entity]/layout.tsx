import { notFound } from "next/navigation";

import { ShellClientLayout } from "@/components/shell/ShellClientLayout";
import { AuthProvider } from "@/lib/auth/auth-context";
import { isReservedSlug } from "@/lib/nav/reserved-keywords";

interface EntityLayoutProps {
    children: React.ReactNode;
    params: Promise<{ entity: string }>;
}

/**
 * Entity runtime layout for /app/[entity]/* routes.
 * Validates entity slug against reserved keywords and renders the shell.
 * Uses the same ShellClientLayout as workbench routes for a consistent header.
 */
export default async function EntityLayout({ children, params }: EntityLayoutProps) {
    const { entity } = await params;

    // Validate that the entity slug is not a reserved keyword
    if (isReservedSlug(entity)) {
        notFound();
    }

    // Default to "user" workbench for entity runtime routes
    // The actual workbench context is determined from the session
    const workbench = "user" as const;

    return (
        <AuthProvider activeWorkbench={workbench}>
            <ShellClientLayout workbench={workbench}>
                {children}
            </ShellClientLayout>
        </AuthProvider>
    );
}
