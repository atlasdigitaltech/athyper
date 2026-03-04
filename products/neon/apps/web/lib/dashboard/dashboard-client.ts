"use client";

/**
 * Dashboard API client — stub implementations.
 * These will be replaced with real API calls when EPIC 4 (Dashboards Hub) is implemented.
 */

export async function duplicateDashboard(dashboardId: string): Promise<{ id: string }> {
    // TODO: EPIC 4 — POST /api/dashboards/:id/duplicate
    throw new Error(`duplicateDashboard not yet implemented (dashboardId: ${dashboardId})`);
}

export async function updateDashboard(
    dashboardId: string,
    data: Record<string, unknown>,
): Promise<void> {
    // TODO: EPIC 4 — PATCH /api/dashboards/:id
    throw new Error(`updateDashboard not yet implemented (dashboardId: ${dashboardId}, keys: ${Object.keys(data).join(",")})`);
}
