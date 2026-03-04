"use client";

// components/debug/DiagnosticCopy.tsx
//
// Builds a redacted plaintext diagnostic summary for clipboard copy.

export function buildDiagnosticText(data: Record<string, unknown>): string {
    const lines: string[] = [];
    lines.push("=== Diagnostics Report ===");
    lines.push(`Timestamp: ${new Date().toISOString()}`);
    lines.push("");

    const session = data.session as Record<string, unknown> | undefined;
    if (session) {
        lines.push("--- Session ---");
        lines.push(`User ID: ${session.userId ?? "—"}`);
        lines.push(`Username: ${session.username ?? "—"}`);
        lines.push(`Display Name: ${session.displayName ?? "—"}`);
        lines.push(`Persona: ${session.persona ?? "—"}`);
        lines.push(`Workbench: ${session.workbench ?? "—"}`);
        lines.push(`Tenant ID: ${session.tenantId ?? "—"}`);
        lines.push(`Realm: ${session.realmKey ?? "—"}`);
        lines.push(`Roles: ${Array.isArray(session.roles) ? session.roles.join(", ") : "—"}`);
        lines.push(`Scope: ${session.scope ?? "—"}`);
        lines.push(`Session State: ${session.sessionState ?? "—"}`);
        lines.push(`Token State: ${session.tokenState ?? "—"}`);
        lines.push(`Verdict: ${session.verdict ?? "—"}`);
        lines.push(`Refresh Valid: ${session.refreshValid ?? "—"}`);
        lines.push(`Token Remaining: ${session.tokenRemaining ?? "—"}s`);
        lines.push(`Idle Remaining: ${session.idleRemaining ?? "—"}s`);
        lines.push(`Issued At: ${session.issuedAt ?? "—"}`);
        lines.push(`Expires At: ${session.expiresAt ?? "—"}`);
        lines.push(`Last Seen: ${session.lastSeenAt ?? "—"}`);
        lines.push("");
    }

    const keycloak = data.keycloak as Record<string, unknown> | undefined;
    if (keycloak) {
        lines.push("--- Identity Provider ---");
        lines.push(`Base URL: ${keycloak.baseUrl ?? "—"}`);
        lines.push(`Realm: ${keycloak.realm ?? "—"}`);
        lines.push(`Client ID: ${keycloak.clientId ?? "—"}`);
        lines.push("");
    }

    const tenantCheck = data.tenantCheck as Record<string, unknown> | undefined;
    if (tenantCheck) {
        lines.push("--- Tenant Isolation ---");
        lines.push(`Request Tenant: ${tenantCheck.requestTenantId ?? "—"}`);
        lines.push(`Session Tenant: ${tenantCheck.sessionTenantId ?? "—"}`);
        lines.push(`Validated: ${tenantCheck.validated ?? "—"}`);
        lines.push("");
    }

    const jwt = data.jwt as Record<string, unknown> | undefined;
    if (jwt) {
        lines.push("--- JWT ---");
        const header = jwt.header as Record<string, unknown> | undefined;
        lines.push(`Algorithm: ${header?.alg ?? "—"}`);
        lines.push(`Key ID: ${header?.kid ?? "—"}`);
        lines.push(`Signature Present: ${jwt.signaturePresent ?? "—"}`);
        lines.push(`Access Token: [REDACTED]`);
        lines.push("");
    }

    lines.push("--- Refresh Token ---");
    lines.push("Refresh Token: [REDACTED]");
    lines.push("");

    const redis = data.redis as Record<string, unknown> | undefined;
    if (redis) {
        lines.push("--- Cache & Session Store ---");
        lines.push(`Status: ${redis.status ?? "—"}`);
        lines.push(`URL: ${redis.url ?? "—"}`);
        lines.push("");
    }

    lines.push(`Server Time: ${data.serverTime ?? "—"}`);
    lines.push("=== End Report ===");

    return lines.join("\n");
}

export async function copyDiagnosticToClipboard(data: Record<string, unknown>): Promise<boolean> {
    try {
        const text = buildDiagnosticText(data);
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
