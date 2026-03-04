/**
 * Messaging API Client
 *
 * Type-safe fetch wrappers for messaging endpoints.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface Conversation {
    id: string;
    tenantId: string;
    type: "direct" | "group";
    title: string | null;
    createdAt: string;
    createdBy: string;
    updatedAt: string | null;
    updatedBy: string | null;
}

export interface ConversationParticipant {
    id: string;
    conversationId: string;
    tenantId: string;
    userId: string;
    role: "member" | "admin";
    joinedAt: string;
    leftAt: string | null;
    lastReadMessageId: string | null;
    lastReadAt: string | null;
}

export interface Message {
    id: string;
    tenantId: string;
    conversationId: string;
    senderId: string;
    body: string;
    bodyFormat: "plain" | "markdown";
    clientMessageId: string | null;
    parentMessageId: string | null;
    createdAt: string;
    editedAt: string | null;
    deletedAt: string | null;
}

export interface ConversationWithParticipants {
    conversation: Conversation;
    participants: ConversationParticipant[];
}

export interface MessageWithDeliveries {
    message: Message;
    deliveryCount: number;
    readCount: number;
}

export interface MessageSearchResult {
    message: Message;
    rank: number;
    headline: string;
}

// ─── API Response ────────────────────────────────────────────────────

type ApiResponse<T = unknown> = {
    success: boolean;
    data?: T;
    error?: { code: string; message: string };
};

// ─── API Client ──────────────────────────────────────────────────────

class MessagingApiError extends Error {
    constructor(
        public code: string,
        message: string,
        public status: number
    ) {
        super(message);
        this.name = "MessagingApiError";
    }
}

export async function listConversations(query?: {
    type?: "direct" | "group";
    limit?: number;
    offset?: number;
}): Promise<Conversation[]> {
    const params = new URLSearchParams();
    if (query?.type) params.append("type", query.type);
    if (query?.limit) params.append("limit", query.limit.toString());
    if (query?.offset) params.append("offset", query.offset.toString());

    const res = await fetch(`/api/conversations?${params}`, {
        credentials: "include",
    });

    const data = (await res.json()) as ApiResponse<{ conversations: Conversation[] }>;

    if (!res.ok || !data.success) {
        throw new MessagingApiError(
            data.error?.code ?? "UNKNOWN_ERROR",
            data.error?.message ?? "Failed to list conversations",
            res.status
        );
    }

    return (data.data as { conversations: Conversation[] }).conversations;
}

export async function createConversation(input: {
    type: "direct" | "group";
    participantIds: string[];
    title?: string;
    adminIds?: string[];
}): Promise<ConversationWithParticipants> {
    const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
    });

    const data = (await res.json()) as ApiResponse<ConversationWithParticipants>;

    if (!res.ok || !data.success) {
        throw new MessagingApiError(
            data.error?.code ?? "UNKNOWN_ERROR",
            data.error?.message ?? "Failed to create conversation",
            res.status
        );
    }

    return data.data as ConversationWithParticipants;
}

export async function getConversation(id: string): Promise<ConversationWithParticipants> {
    const res = await fetch(`/api/conversations/${id}`, {
        credentials: "include",
    });

    const data = (await res.json()) as ApiResponse<ConversationWithParticipants>;

    if (!res.ok || !data.success) {
        throw new MessagingApiError(
            data.error?.code ?? "UNKNOWN_ERROR",
            data.error?.message ?? "Failed to get conversation",
            res.status
        );
    }

    return data.data as ConversationWithParticipants;
}

export async function listMessages(
    conversationId: string,
    query?: { limit?: number; before?: string }
): Promise<Message[]> {
    const params = new URLSearchParams();
    if (query?.limit) params.append("limit", query.limit.toString());
    if (query?.before) params.append("before", query.before);

    const res = await fetch(`/api/conversations/${conversationId}/messages?${params}`, {
        credentials: "include",
    });

    const data = (await res.json()) as ApiResponse<{ messages: Message[] }>;

    if (!res.ok || !data.success) {
        throw new MessagingApiError(
            data.error?.code ?? "UNKNOWN_ERROR",
            data.error?.message ?? "Failed to list messages",
            res.status
        );
    }

    return (data.data as { messages: Message[] }).messages;
}

export async function sendMessage(
    conversationId: string,
    input: {
        body: string;
        bodyFormat?: "plain" | "markdown";
        clientMessageId?: string;
        parentMessageId?: string;
    }
): Promise<MessageWithDeliveries> {
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
    });

    const data = (await res.json()) as ApiResponse<MessageWithDeliveries>;

    if (!res.ok || !data.success) {
        throw new MessagingApiError(
            data.error?.code ?? "UNKNOWN_ERROR",
            data.error?.message ?? "Failed to send message",
            res.status
        );
    }

    return data.data as MessageWithDeliveries;
}

export async function editMessage(
    messageId: string,
    body: string
): Promise<Message> {
    const res = await fetch(`/api/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
    });

    const data = (await res.json()) as ApiResponse<{ message: Message }>;

    if (!res.ok || !data.success) {
        throw new MessagingApiError(
            data.error?.code ?? "UNKNOWN_ERROR",
            data.error?.message ?? "Failed to edit message",
            res.status
        );
    }

    return (data.data as { message: Message }).message;
}

export async function deleteMessage(messageId: string): Promise<void> {
    const res = await fetch(`/api/messages/${messageId}`, {
        method: "DELETE",
        credentials: "include",
    });

    const data = (await res.json()) as ApiResponse;

    if (!res.ok || !data.success) {
        throw new MessagingApiError(
            data.error?.code ?? "UNKNOWN_ERROR",
            data.error?.message ?? "Failed to delete message",
            res.status
        );
    }
}

export async function markMessageAsRead(
    messageId: string,
    conversationId: string
): Promise<void> {
    const res = await fetch(`/api/messages/${messageId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ conversationId }),
    });

    const data = (await res.json()) as ApiResponse;

    if (!res.ok || !data.success) {
        throw new MessagingApiError(
            data.error?.code ?? "UNKNOWN_ERROR",
            data.error?.message ?? "Failed to mark message as read",
            res.status
        );
    }
}

export async function listThreadReplies(
    parentMessageId: string,
    query?: { limit?: number }
): Promise<{ replies: Message[]; count: number }> {
    const params = new URLSearchParams();
    if (query?.limit) params.append("limit", query.limit.toString());

    const res = await fetch(`/api/messages/${parentMessageId}/thread?${params}`, {
        credentials: "include",
    });

    const data = (await res.json()) as ApiResponse<{ replies: Message[]; count: number }>;

    if (!res.ok || !data.success) {
        throw new MessagingApiError(
            data.error?.code ?? "UNKNOWN_ERROR",
            data.error?.message ?? "Failed to list thread replies",
            res.status
        );
    }

    return data.data as { replies: Message[]; count: number };
}

export async function searchMessages(query: {
    q: string;
    conversationId?: string;
    limit?: number;
    offset?: number;
}): Promise<{ results: MessageSearchResult[]; count: number }> {
    const params = new URLSearchParams();
    params.append("q", query.q);
    if (query.conversationId) params.append("conversationId", query.conversationId);
    if (query.limit) params.append("limit", query.limit.toString());
    if (query.offset) params.append("offset", query.offset.toString());

    const res = await fetch(`/api/messages/search?${params}`, {
        credentials: "include",
    });

    const data = (await res.json()) as ApiResponse<{ results: MessageSearchResult[]; count: number }>;

    if (!res.ok || !data.success) {
        throw new MessagingApiError(
            data.error?.code ?? "UNKNOWN_ERROR",
            data.error?.message ?? "Failed to search messages",
            res.status
        );
    }

    return data.data as { results: MessageSearchResult[]; count: number };
}
