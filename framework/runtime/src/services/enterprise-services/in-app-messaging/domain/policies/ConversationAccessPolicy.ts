/**
 * ConversationAccessPolicy — Authorization and access control
 *
 * Enforces security rules for conversation and message operations.
 * All operations are tenant-scoped and participants-only.
 */

import { AccessDeniedError } from "../types";

import type {
    Conversation,
    ConversationParticipant,
    Message,
} from "../types";

/**
 * Verifies tenant isolation
 *
 * Invariant: All operations must be within the same tenant
 */
export function enforceTenantIsolation(
    tenantId: string,
    resourceTenantId: string,
    resourceType: string
): void {
    if (tenantId !== resourceTenantId) {
        throw new AccessDeniedError(
            `Cross-tenant access denied for ${resourceType}`,
            { requestTenantId: tenantId, resourceTenantId }
        );
    }
}

/**
 * Checks if a user is an active participant in a conversation
 *
 * A participant is active if they have joined and not left
 */
export function isActiveParticipant(
    participants: ConversationParticipant[],
    userId: string
): boolean {
    return participants.some(
        p => p.userId === userId && p.leftAt === null
    );
}

/**
 * Checks if a user is an admin of a conversation
 *
 * Only applies to group conversations
 */
export function isConversationAdmin(
    participants: ConversationParticipant[],
    userId: string
): boolean {
    return participants.some(
        p => p.userId === userId && p.role === "admin" && p.leftAt === null
    );
}

/**
 * Enforces participant-only access to a conversation
 *
 * Invariant: Only active participants can access a conversation
 */
export function enforceParticipantAccess(
    tenantId: string,
    conversation: Conversation,
    participants: ConversationParticipant[],
    userId: string
): void {
    // Tenant isolation
    enforceTenantIsolation(tenantId, conversation.tenantId, "conversation");

    // Participant check
    if (!isActiveParticipant(participants, userId)) {
        throw new AccessDeniedError(
            "Only conversation participants can access this conversation",
            { conversationId: conversation.id, userId }
        );
    }
}

/**
 * Enforces permission to send a message
 *
 * Invariant: Only active participants can send messages
 */
export function enforceSendMessagePermission(
    tenantId: string,
    conversation: Conversation,
    participants: ConversationParticipant[],
    userId: string
): void {
    enforceParticipantAccess(tenantId, conversation, participants, userId);
}

/**
 * Enforces permission to read messages
 *
 * Invariant: Only active participants can read messages
 */
export function enforceReadMessagePermission(
    tenantId: string,
    conversation: Conversation,
    participants: ConversationParticipant[],
    userId: string
): void {
    enforceParticipantAccess(tenantId, conversation, participants, userId);
}

/**
 * Enforces permission to edit a message
 *
 * Invariant: Only the sender can edit their own message
 */
export function enforceEditMessagePermission(
    tenantId: string,
    message: Message,
    userId: string
): void {
    // Tenant isolation
    enforceTenantIsolation(tenantId, message.tenantId, "message");

    // Sender check
    if (message.senderId !== userId) {
        throw new AccessDeniedError(
            "Only the message sender can edit this message",
            { messageId: message.id, senderId: message.senderId, userId }
        );
    }
}

/**
 * Enforces permission to delete a message
 *
 * Invariant: Only the sender can delete their own message
 */
export function enforceDeleteMessagePermission(
    tenantId: string,
    message: Message,
    userId: string
): void {
    // Tenant isolation
    enforceTenantIsolation(tenantId, message.tenantId, "message");

    // Sender check
    if (message.senderId !== userId) {
        throw new AccessDeniedError(
            "Only the message sender can delete this message",
            { messageId: message.id, senderId: message.senderId, userId }
        );
    }
}

/**
 * Enforces permission to add participants to a conversation
 *
 * Invariant: Only admins can add participants to group conversations
 * Direct conversations cannot have participants added
 */
export function enforceAddParticipantsPermission(
    tenantId: string,
    conversation: Conversation,
    participants: ConversationParticipant[],
    requesterId: string
): void {
    // Tenant isolation
    enforceTenantIsolation(tenantId, conversation.tenantId, "conversation");

    // Direct conversations cannot have participants added
    if (conversation.type === "direct") {
        throw new AccessDeniedError(
            "Cannot add participants to direct conversations",
            { conversationId: conversation.id }
        );
    }

    // Requester must be an active admin
    if (!isConversationAdmin(participants, requesterId)) {
        throw new AccessDeniedError(
            "Only conversation admins can add participants",
            { conversationId: conversation.id, requesterId }
        );
    }
}

/**
 * Enforces permission to remove a participant from a conversation
 *
 * Invariant: Admins can remove any participant; users can remove themselves
 * Direct conversations cannot have participants removed
 */
export function enforceRemoveParticipantPermission(
    tenantId: string,
    conversation: Conversation,
    participants: ConversationParticipant[],
    requesterId: string,
    targetUserId: string
): void {
    // Tenant isolation
    enforceTenantIsolation(tenantId, conversation.tenantId, "conversation");

    // Direct conversations cannot have participants removed
    if (conversation.type === "direct") {
        throw new AccessDeniedError(
            "Cannot remove participants from direct conversations",
            { conversationId: conversation.id }
        );
    }

    // Users can always remove themselves
    if (requesterId === targetUserId) {
        return;
    }

    // Otherwise, requester must be an admin
    if (!isConversationAdmin(participants, requesterId)) {
        throw new AccessDeniedError(
            "Only conversation admins can remove other participants",
            { conversationId: conversation.id, requesterId, targetUserId }
        );
    }
}

/**
 * Enforces permission to update conversation title
 *
 * Invariant: Only admins can update group conversation titles
 * Direct conversations cannot have titles updated
 */
export function enforceUpdateTitlePermission(
    tenantId: string,
    conversation: Conversation,
    participants: ConversationParticipant[],
    requesterId: string
): void {
    // Tenant isolation
    enforceTenantIsolation(tenantId, conversation.tenantId, "conversation");

    // Direct conversations cannot have titles
    if (conversation.type === "direct") {
        throw new AccessDeniedError(
            "Cannot update title for direct conversations",
            { conversationId: conversation.id }
        );
    }

    // Requester must be an admin
    if (!isConversationAdmin(participants, requesterId)) {
        throw new AccessDeniedError(
            "Only conversation admins can update the title",
            { conversationId: conversation.id, requesterId }
        );
    }
}

/**
 * Validates that new participants can be added to a conversation
 *
 * Invariant: Cannot add existing active participants
 */
export function validateNewParticipants(
    participants: ConversationParticipant[],
    newParticipantIds: string[]
): void {
    const activeParticipantIds = new Set(
        participants
            .filter(p => p.leftAt === null)
            .map(p => p.userId)
    );

    const alreadyParticipants = newParticipantIds.filter(id =>
        activeParticipantIds.has(id)
    );

    if (alreadyParticipants.length > 0) {
        throw new AccessDeniedError(
            "Cannot add users who are already active participants",
            { alreadyParticipants }
        );
    }
}

/**
 * Gets all active participant IDs for a conversation
 */
export function getActiveParticipantIds(
    participants: ConversationParticipant[]
): string[] {
    return participants
        .filter(p => p.leftAt === null)
        .map(p => p.userId);
}

/**
 * Gets all admin IDs for a conversation
 */
export function getAdminIds(
    participants: ConversationParticipant[]
): string[] {
    return participants
        .filter(p => p.role === "admin" && p.leftAt === null)
        .map(p => p.userId);
}

/**
 * Checks if a conversation has at least one admin
 *
 * Used to ensure group conversations always have at least one admin
 */
export function hasAtLeastOneAdmin(
    participants: ConversationParticipant[]
): boolean {
    return participants.some(p => p.role === "admin" && p.leftAt === null);
}

/**
 * Validates admin removal
 *
 * Invariant: Cannot remove the last admin from a group conversation
 */
export function validateAdminRemoval(
    participants: ConversationParticipant[],
    targetUserId: string
): void {
    const targetParticipant = participants.find(
        p => p.userId === targetUserId && p.leftAt === null
    );

    // If target is not an admin, no validation needed
    if (!targetParticipant || targetParticipant.role !== "admin") {
        return;
    }

    // Count remaining admins (excluding the one being removed)
    const remainingAdminCount = participants.filter(
        p => p.role === "admin" && p.leftAt === null && p.userId !== targetUserId
    ).length;

    if (remainingAdminCount === 0) {
        throw new AccessDeniedError(
            "Cannot remove the last admin from a group conversation",
            { targetUserId }
        );
    }
}
