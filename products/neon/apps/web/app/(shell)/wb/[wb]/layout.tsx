import { notFound } from "next/navigation";

import { ShellClientLayout } from "@/components/shell/ShellClientLayout";
import { AuthProvider } from "@/lib/auth/auth-context";
import { isWorkbench, type Workbench } from "@/lib/auth/types";

interface WorkbenchLayoutProps {
    children: React.ReactNode;
    params: Promise<{ wb: string }>;
}

export default async function WorkbenchLayout({ children, params }: WorkbenchLayoutProps) {
    const { wb } = await params;

    // Validate the workbench param against the frozen enumeration
    if (!isWorkbench(wb)) {
        notFound();
    }

    const validWorkbench: Workbench = wb;

    return (
        <AuthProvider activeWorkbench={validWorkbench}>
            <ShellClientLayout workbench={validWorkbench}>
                {children}
            </ShellClientLayout>
        </AuthProvider>
    );
}
