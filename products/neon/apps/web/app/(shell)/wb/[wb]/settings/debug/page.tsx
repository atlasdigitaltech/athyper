"use client";

import { DiagnosticsConsole } from "@/components/diagnostics/DiagnosticsConsole";
import { useMessages } from "@/lib/i18n/messages-context";

export default function DiagnosticsPage() {
    const { t } = useMessages();
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-bold">{t("diag.page.title")}</h1>
                <p className="text-sm text-muted-foreground">
                    {t("diag.page.description")}
                </p>
            </div>
            <DiagnosticsConsole />
        </div>
    );
}
