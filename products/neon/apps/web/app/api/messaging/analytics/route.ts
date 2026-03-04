/**
 * GET /api/messaging/analytics
 *
 * Messaging analytics endpoint.
 * Returns aggregated messaging statistics for the dashboard:
 *  - Conversation counts (total, direct, group)
 *  - Message volume per day (sent vs read)
 *  - Active users, unread count, delivery/read rates
 *  - Recent activity feed
 *
 * Uses mock data for development. In production this will query the messaging
 * repositories (ConversationRepo, MessageRepo, MessageDeliveryRepo).
 *
 * Query params:
 *  - range: "7d" | "30d" | "90d" (default: "30d")
 */

import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock data generators
// ---------------------------------------------------------------------------

/**
 * Generate daily message volume with realistic patterns.
 * Weekdays produce ~45 messages/day, weekends ~15, with random variance.
 */
function generateDailyMessages(days: number): Array<{ date: string; sent: number; read: number }> {
    const result: Array<{ date: string; sent: number; read: number }> = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const baseSent = isWeekend ? 15 : 45;
        const variance = Math.floor(Math.random() * 20) - 10;
        const sent = Math.max(5, baseSent + variance);
        // Read rate varies between 70-95% of sent
        const read = Math.floor(sent * (0.7 + Math.random() * 0.25));

        result.push({
            date: date.toISOString().split("T")[0],
            sent,
            read,
        });
    }

    return result;
}

/**
 * Generate recent activity feed with mixed event types.
 * Timestamps are relative to now so the feed always looks fresh.
 */
function generateRecentActivity(): Array<{
    id: string;
    conversationTitle: string;
    senderName: string;
    preview: string;
    timestamp: string;
    type: "message" | "conversation_created" | "participant_joined";
}> {
    const now = new Date();
    return [
        {
            id: "act-1",
            conversationTitle: "Q1 Budget Review",
            senderName: "Sarah Chen",
            preview: "Updated the forecast spreadsheet with latest numbers",
            timestamp: new Date(now.getTime() - 5 * 60_000).toISOString(),
            type: "message",
        },
        {
            id: "act-2",
            conversationTitle: "Invoice Processing",
            senderName: "Mike Rodriguez",
            preview: "PI-003 has been approved. Ready for payment.",
            timestamp: new Date(now.getTime() - 18 * 60_000).toISOString(),
            type: "message",
        },
        {
            id: "act-3",
            conversationTitle: "Vendor Onboarding",
            senderName: "System",
            preview: "New conversation created",
            timestamp: new Date(now.getTime() - 45 * 60_000).toISOString(),
            type: "conversation_created",
        },
        {
            id: "act-4",
            conversationTitle: "Account Reconciliation",
            senderName: "Lisa Park",
            preview: "Found a discrepancy in ACC-003, investigating",
            timestamp: new Date(now.getTime() - 2 * 3600_000).toISOString(),
            type: "message",
        },
        {
            id: "act-5",
            conversationTitle: "Q1 Budget Review",
            senderName: "James Wilson",
            preview: "James Wilson joined the conversation",
            timestamp: new Date(now.getTime() - 3 * 3600_000).toISOString(),
            type: "participant_joined",
        },
        {
            id: "act-6",
            conversationTitle: "Supplier Negotiations",
            senderName: "Anna Kowalski",
            preview: "NorthStar agreed to revised payment terms",
            timestamp: new Date(now.getTime() - 5 * 3600_000).toISOString(),
            type: "message",
        },
    ];
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const VALID_RANGES = new Set(["7d", "30d", "90d"]);

export async function GET(req: NextRequest) {
    try {
        const rangeParam = req.nextUrl.searchParams.get("range") ?? "30d";

        // Validate range parameter
        if (!VALID_RANGES.has(rangeParam)) {
            console.warn(`[GET /api/messaging/analytics] Invalid range: ${rangeParam}`);
            return NextResponse.json(
                { error: { message: `Invalid range: ${rangeParam}. Must be 7d, 30d, or 90d.` } },
                { status: 400 },
            );
        }

        const days = rangeParam === "7d" ? 7 : rangeParam === "90d" ? 90 : 30;

        const messagesByDay = generateDailyMessages(days);
        const totalMessages = messagesByDay.reduce((sum, d) => sum + d.sent, 0);
        const totalRead = messagesByDay.reduce((sum, d) => sum + d.read, 0);

        const analytics = {
            totalConversations: 24,
            directConversations: 16,
            groupConversations: 8,
            totalMessages,
            activeUsers: 12,
            unreadMessages: 7,
            deliveryRate: 0.98,
            readRate: totalMessages > 0 ? Math.round((totalRead / totalMessages) * 100) / 100 : 0,
            messagesByDay,
            recentActivity: generateRecentActivity(),
        };

        return NextResponse.json({ data: analytics });
    } catch (error) {
        console.error("[GET /api/messaging/analytics] Error:", error);
        return NextResponse.json(
            { error: { message: "Failed to load messaging analytics" } },
            { status: 500 },
        );
    }
}
