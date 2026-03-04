/**
 * GET /api/stream/messages
 *
 * Server-Sent Events (SSE) endpoint for real-time messaging updates.
 * Pushes message events to connected clients.
 */

import { getApiContext } from "@/lib/api-context";
import { messagingEvents } from "@/lib/realtime/messaging-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const { context, redis } = await getApiContext();

    // Require authentication
    if (!context) {
        await redis.quit();
        return new Response("Unauthorized", { status: 401 });
    }

    const { tenantId, userId } = context;

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection confirmation
            const send = (data: string) => {
                try {
                    controller.enqueue(encoder.encode(data));
                } catch (err) {
                    console.error("[SSE] Failed to send data:", err);
                }
            };

            send(`: connected\n\n`);

            // Subscribe to messaging events for this user
            const unsubscribe = messagingEvents.subscribeUser(tenantId, userId, (event) => {
                send(`event: ${event.type}\n`);
                send(`data: ${JSON.stringify(event)}\n\n`);
            });

            // Send periodic heartbeat (every 30 seconds)
            const heartbeatInterval = setInterval(() => {
                send(`event: heartbeat\n`);
                send(`data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
            }, 30000);

            // Cleanup on connection close
            req.signal.addEventListener("abort", async () => {
                clearInterval(heartbeatInterval);
                unsubscribe();
                await redis.quit();
                try {
                    controller.close();
                } catch (err) {
                    // Controller already closed
                }
            });
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no", // Disable nginx buffering
        },
    });
}
