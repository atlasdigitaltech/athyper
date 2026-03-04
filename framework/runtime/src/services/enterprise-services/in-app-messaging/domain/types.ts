/**
 * In-App Messaging — Domain Types
 *
 * Core types, branded IDs, enums, and shared interfaces for the messaging system.
 */

// ─── Branded IDs ─────────────────────────────────────────────────────
export type ConversationId = string & { readonly __brand: "ConversationId" };
export type MessageId = string & { readonly __brand: "MessageId" };
export type ParticipantId = string & { readonly __brand: "ParticipantId" };
export type DeliveryId = string & { readonly __brand: "DeliveryId" };

// ─── Conversation Type ───────────────────────────────────────────────
export const ConversationType = {
    DIRECT: "direct",
    GROUP: "group",
} as const;
export type ConversationType = (typeof ConversationType)[keyof typeof ConversationType];

// ─── Participant Role ────────────────────────────────────────────────
export const ParticipantRole = {
    MEMBER: "member",
    ADMIN: "admin",
} as const;
export type ParticipantRole = (typeof ParticipantRole)[keyof typeof ParticipantRole];

// ─── Message Format ──────────────────────────────────────────────────
export const MessageFormat = {
    PLAIN: "plain",
    MARKDOWN: "markdown",
} as const;
export type MessageFormat = (typeof MessageFormat)[keyof typeof MessageFormat];

// ─── Message Delivery Status ─────────────────────────────────────────
export const DeliveryStatus = {
    DELIVERED: "delivered",
    READ: "read",
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

// ─── Domain Interfaces ───────────────────────────────────────────────

/**
 * Conversation — Container for direct or group messaging
 */
export interface Conversation {
    id: ConversationId;
    tenantId: string;
    type: ConversationType;
    title: string | null;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
    updatedBy: string | null;
}

/**
 * ConversationParticipant — Join table with read tracking
 */
export interface ConversationParticipant {
    id: ParticipantId;
    conversationId: ConversationId;
    tenantId: string;
    userId: string;
    role: ParticipantRole;
    joinedAt: Date;
    leftAt: Date | null;
    lastReadMessageId: MessageId | null;
    lastReadAt: Date | null;
}

/**
 * Message — Individual message within a conversation
 */
export interface Message {
    id: MessageId;
    tenantId: string;
    conversationId: ConversationId;
    senderId: string;
    body: string;
    bodyFormat: MessageFormat;
    clientMessageId: string | null;
    parentMessageId: MessageId | null; // For threaded replies
    createdAt: Date;
    editedAt: Date | null;
    deletedAt: Date | null;
}

/**
 * MessageDelivery — Per-recipient delivery and read tracking
 */
export interface MessageDelivery {
    id: DeliveryId;
    messageId: MessageId;
    tenantId: string;
    recipientId: string;
    deliveredAt: Date;
    readAt: Date | null;
}

// ─── Input DTOs ──────────────────────────────────────────────────────

/**
 * Input for creating a new direct conversation
 */
export interface CreateDirectConversationInput {
    tenantId: string;
    createdBy: string;
    participantIds: [string, string]; // Exactly 2 participants for direct
}

/**
 * Input for creating a new group conversation
 */
export interface CreateGroupConversationInput {
    tenantId: string;
    createdBy: string;
    title: string;
    participantIds: string[]; // 2+ participants
    adminIds?: string[]; // Optional admin designations
}

/**
 * Input for creating a message
 */
export interface CreateMessageInput {
    tenantId: string;
    conversationId: ConversationId;
    senderId: string;
    body: string;
    bodyFormat?: MessageFormat;
    clientMessageId?: string; // Idempotency key
    parentMessageId?: MessageId; // For threaded replies
}

/**
 * Input for editing a message
 */
export interface EditMessageInput {
    tenantId: string;
    messageId: MessageId;
    userId: string;
    body: string;
}

/**
 * Input for marking a message as read
 */
export interface MarkMessageReadInput {
    tenantId: string;
    conversationId: ConversationId;
    userId: string;
    messageId: MessageId;
}

/**
 * Input for adding participants to a group conversation
 */
export interface AddParticipantsInput {
    tenantId: string;
    conversationId: ConversationId;
    requesterId: string;
    participantIds: string[];
}

/**
 * Input for removing a participant from a conversation
 */
export interface RemoveParticipantInput {
    tenantId: string;
    conversationId: ConversationId;
    requesterId: string;
    participantId: string;
}

// ─── Query DTOs ──────────────────────────────────────────────────────

/**
 * Query for listing conversations for a user
 */
export interface ListConversationsQuery {
    tenantId: string;
    userId: string;
    type?: ConversationType;
    limit?: number;
    offset?: number;
}

/**
 * Query for listing messages in a conversation
 */
export interface ListMessagesQuery {
    tenantId: string;
    conversationId: ConversationId;
    userId: string; // Requester must be a participant
    limit?: number;
    beforeMessageId?: MessageId; // For pagination
}

/**
 * Query for getting unread message count
 */
export interface UnreadCountQuery {
    tenantId: string;
    userId: string;
    conversationId?: ConversationId; // Optional: count for specific conversation
}

// ─── Domain Events ───────────────────────────────────────────────────

export const MessagingEventType = {
    CONVERSATION_CREATED: "messaging.conversation.created",
    MESSAGE_SENT: "messaging.message.sent",
    MESSAGE_EDITED: "messaging.message.edited",
    MESSAGE_DELETED: "messaging.message.deleted",
    MESSAGE_READ: "messaging.message.read",
    PARTICIPANT_ADDED: "messaging.participant.added",
    PARTICIPANT_REMOVED: "messaging.participant.removed",
} as const;
export type MessagingEventType = (typeof MessagingEventType)[keyof typeof MessagingEventType];

/**
 * Base messaging event
 */
export interface MessagingEvent {
    type: MessagingEventType;
    tenantId: string;
    conversationId: ConversationId;
    userId: string; // User who triggered the event
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

/**
 * Event emitted when a new message is sent
 */
export interface MessageSentEvent extends MessagingEvent {
    type: typeof MessagingEventType.MESSAGE_SENT;
    messageId: MessageId;
    senderId: string;
    recipientIds: string[];
}

/**
 * Event emitted when a message is read
 */
export interface MessageReadEvent extends MessagingEvent {
    type: typeof MessagingEventType.MESSAGE_READ;
    messageId: MessageId;
    readerId: string;
}

// ─── Validation Errors ───────────────────────────────────────────────

export class MessagingDomainError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly context?: Record<string, unknown>
    ) {
        super(message);
        this.name = "MessagingDomainError";
    }
}

export class ConversationValidationError extends MessagingDomainError {
    constructor(message: string, context?: Record<string, unknown>) {
        super("CONVERSATION_VALIDATION_ERROR", message, context);
        this.name = "ConversationValidationError";
    }
}

export class MessageValidationError extends MessagingDomainError {
    constructor(message: string, context?: Record<string, unknown>) {
        super("MESSAGE_VALIDATION_ERROR", message, context);
        this.name = "MessageValidationError";
    }
}

export class AccessDeniedError extends MessagingDomainError {
    constructor(message: string, context?: Record<string, unknown>) {
        super("ACCESS_DENIED", message, context);
        this.name = "AccessDeniedError";
    }
}
