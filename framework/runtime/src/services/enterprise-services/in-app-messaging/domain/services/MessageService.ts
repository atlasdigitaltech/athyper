/**
 * MessageService — Business logic orchestration for messages
 *
 * Handles:
 * - Sending messages with delivery fan-out
 * - Editing and deleting messages
 * - Read tracking and read receipts
 * - Applying domain policies and validation
 */

import { ConversationRepo } from "../../persistence/ConversationRepo";
import { MessageDeliveryRepo, type CreateDeliveryInput } from "../../persistence/MessageDeliveryRepo";
import {
    MessageRepo,
    type ListMessagesOptions,
    type SearchMessagesOptions,
    type MessageSearchResult,
} from "../../persistence/MessageRepo";
import { ParticipantRepo } from "../../persistence/ParticipantRepo";
import { MessagingAuditLogger } from "../audit/MessagingAuditLogger";
import {
    validateCreateMessageInput,
    validateEditMessageInput,
    applyMessageEdit,
    validateMessageDeletion,
} from "../models/Message";
import { MessagingMetrics, MetricTimer } from "../observability/MessagingMetrics";
import {
    enforceSendMessagePermission,
    enforceReadMessagePermission,
    enforceEditMessagePermission,
    enforceDeleteMessagePermission,
    getActiveParticipantIds,
} from "../policies/ConversationAccessPolicy";
import { MessagingRateLimiter, RateLimitExceededError } from "../rate-limit/MessagingRateLimiter";

import type {
    Message,
    MessageId,
    ConversationId,
    CreateMessageInput,
    EditMessageInput,
    MarkMessageReadInput,
} from "../types";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export interface MessageWithDeliveries {
    message: Message;
    deliveryCount: number;
    readCount: number;
}

export class MessageService {
    private conversationRepo: ConversationRepo;
    private participantRepo: ParticipantRepo;
    private messageRepo: MessageRepo;
    private deliveryRepo: MessageDeliveryRepo;
    private auditLogger: MessagingAuditLogger;
    private rateLimiter: MessagingRateLimiter;
    private metrics: MessagingMetrics;

    constructor(private readonly db: Kysely<DB>) {
        this.conversationRepo = new ConversationRepo(db);
        this.participantRepo = new ParticipantRepo(db);
        this.messageRepo = new MessageRepo(db);
        this.deliveryRepo = new MessageDeliveryRepo(db);
        this.auditLogger = new MessagingAuditLogger();
        this.rateLimiter = new MessagingRateLimiter();
        this.metrics = new MessagingMetrics();
    }

    /**
     * Send a message
     * Creates message + delivery records for all other participants
     */
    async sendMessage(input: CreateMessageInput): Promise<MessageWithDeliveries> {
        const timer = new MetricTimer(this.metrics);

        try {
            // Check rate limit
            await this.rateLimiter.enforceMessageSendLimit(input.tenantId, input.senderId);

            // Validate message content
            validateCreateMessageInput(input);

            // Get conversation and participants
            const conversation = await this.conversationRepo.getById(
                input.tenantId,
                input.conversationId
            );
            if (!conversation) {
                this.metrics.trackMessageSendFailure(
                    input.tenantId,
                    input.conversationId,
                    "conversation_not_found"
                );
                throw new Error("Conversation not found");
            }

            const participants = await this.participantRepo.listActiveForConversation(
                input.tenantId,
                input.conversationId
            );

            // Enforce access control
            try {
                enforceSendMessagePermission(
                    input.tenantId,
                    conversation,
                    participants,
                    input.senderId
                );
                // Log access granted
                await this.auditLogger.logAccessGranted(
                    input.tenantId,
                    input.senderId,
                    "conversation",
                    "send_message",
                    input.conversationId
                );
                this.metrics.trackAccessGranted(input.tenantId, "conversation", "send_message");
            } catch (err: any) {
                // Log access denied
                await this.auditLogger.logAccessDenied(
                    input.tenantId,
                    input.senderId,
                    "conversation",
                    "send_message",
                    err.message,
                    input.conversationId
                );
                this.metrics.trackAccessDenied(input.tenantId, "conversation", "send_message");
                throw err;
            }

            // Create message
            const message = await this.messageRepo.create(input);

        // Create delivery records for all participants except sender
        const recipientIds = getActiveParticipantIds(participants).filter(
            id => id !== input.senderId
        );

        const deliveryInputs: CreateDeliveryInput[] = recipientIds.map(recipientId => ({
            messageId: message.id,
            tenantId: input.tenantId,
            recipientId,
        }));

        await this.deliveryRepo.createBatch(deliveryInputs);

            // Log audit event
            await this.auditLogger.logMessageSent(
                input.tenantId,
                input.senderId,
                input.conversationId,
                message.id,
                {
                    bodyLength: input.body.length,
                    bodyFormat: input.bodyFormat,
                    deliveryCount: recipientIds.length,
                    isThreadReply: !!input.parentMessageId,
                }
            );

            // Track metrics
            this.metrics.trackMessageSent(input.tenantId, input.conversationId);
            timer.stop("sendMessage", input.tenantId);

        return {
            message,
            deliveryCount: recipientIds.length,
            readCount: 0,
        };
        } catch (err: any) {
            // Track error metrics
            if (err instanceof RateLimitExceededError) {
                this.metrics.trackRateLimitExceeded(input.tenantId, "message_send");
                await this.auditLogger.logRateLimitExceeded(
                    input.tenantId,
                    input.senderId,
                    "message_send",
                    { retryAfter: err.retryAfter }
                );
            } else {
                this.metrics.trackMessageSendFailure(
                    input.tenantId,
                    input.conversationId,
                    err.name || "unknown"
                );
                this.metrics.trackError(err.name || "unknown", "sendMessage", input.tenantId);
            }
            throw err;
        }
    }

    /**
     * Edit a message
     * Only sender can edit their own messages
     */
    async editMessage(input: EditMessageInput): Promise<Message> {
        const message = await this.messageRepo.getById(input.tenantId, input.messageId);
        if (!message) {
            throw new Error("Message not found");
        }

        // Validate edit permission and content
        validateEditMessageInput(message, input);
        enforceEditMessagePermission(input.tenantId, message, input.userId);

        // Apply edit
        const updatedMessage = applyMessageEdit(message, input);

        // Persist
        await this.messageRepo.update(input.tenantId, input.messageId, input.body);

        return updatedMessage;
    }

    /**
     * Delete a message (soft delete)
     * Only sender can delete their own messages
     */
    async deleteMessage(
        tenantId: string,
        messageId: MessageId,
        userId: string
    ): Promise<void> {
        const message = await this.messageRepo.getById(tenantId, messageId);
        if (!message) {
            throw new Error("Message not found");
        }

        // Validate deletion permission
        validateMessageDeletion(message, tenantId, userId);
        enforceDeleteMessagePermission(tenantId, message, userId);

        // Soft delete
        await this.messageRepo.softDelete(tenantId, messageId);
    }

    /**
     * Mark a message as read
     * Updates both delivery record and participant's last_read tracker
     */
    async markAsRead(input: MarkMessageReadInput): Promise<void> {
        // Get conversation and participants
        const conversation = await this.conversationRepo.getById(
            input.tenantId,
            input.conversationId
        );
        if (!conversation) {
            throw new Error("Conversation not found");
        }

        const participants = await this.participantRepo.listActiveForConversation(
            input.tenantId,
            input.conversationId
        );

        // Enforce access control
        enforceReadMessagePermission(
            input.tenantId,
            conversation,
            participants,
            input.userId
        );

        // Mark delivery as read
        await this.deliveryRepo.markAsRead(
            input.tenantId,
            input.messageId,
            input.userId
        );

        // Update participant's last read message
        await this.participantRepo.updateLastRead(
            input.tenantId,
            input.conversationId,
            input.userId,
            input.messageId
        );
    }

    /**
     * Mark all messages in a conversation as read
     * Updates last_read tracker to latest message
     */
    async markAllAsRead(
        tenantId: string,
        conversationId: ConversationId,
        userId: string
    ): Promise<void> {
        // Get conversation and participants
        const conversation = await this.conversationRepo.getById(tenantId, conversationId);
        if (!conversation) {
            throw new Error("Conversation not found");
        }

        const participants = await this.participantRepo.listActiveForConversation(
            tenantId,
            conversationId
        );

        // Enforce access control
        enforceReadMessagePermission(tenantId, conversation, participants, userId);

        // Get latest message
        const latestMessage = await this.messageRepo.getLatest(tenantId, conversationId);
        if (!latestMessage) {
            return; // No messages to mark as read
        }

        // Get all unread messages for this user
        const participant = participants.find(p => p.userId === userId);
        const unreadMessages = await this.messageRepo.getUnreadForUser(
            tenantId,
            conversationId,
            userId,
            participant?.lastReadAt ?? null
        );

        // Mark all unread deliveries as read
        const unreadMessageIds = unreadMessages.map(m => m.id);
        if (unreadMessageIds.length > 0) {
            await this.deliveryRepo.markBatchAsRead(tenantId, unreadMessageIds, userId);
        }

        // Update participant's last read message
        await this.participantRepo.updateLastRead(
            tenantId,
            conversationId,
            userId,
            latestMessage.id
        );
    }

    /**
     * Get a message by ID
     * Enforces participant-only access
     */
    async getById(
        tenantId: string,
        messageId: MessageId,
        userId: string
    ): Promise<Message | undefined> {
        const message = await this.messageRepo.getById(tenantId, messageId);
        if (!message) return undefined;

        // Get conversation and participants
        const conversation = await this.conversationRepo.getById(
            tenantId,
            message.conversationId
        );
        if (!conversation) return undefined;

        const participants = await this.participantRepo.listActiveForConversation(
            tenantId,
            message.conversationId
        );

        // Enforce access control
        enforceReadMessagePermission(tenantId, conversation, participants, userId);

        return message;
    }

    /**
     * List messages in a conversation
     * Enforces participant-only access
     */
    async listForConversation(
        tenantId: string,
        conversationId: ConversationId,
        userId: string,
        options?: ListMessagesOptions
    ): Promise<Message[]> {
        // Get conversation and participants
        const conversation = await this.conversationRepo.getById(tenantId, conversationId);
        if (!conversation) {
            throw new Error("Conversation not found");
        }

        const participants = await this.participantRepo.listActiveForConversation(
            tenantId,
            conversationId
        );

        // Enforce access control
        enforceReadMessagePermission(tenantId, conversation, participants, userId);

        // List messages
        return this.messageRepo.listForConversation(tenantId, conversationId, options);
    }

    /**
     * Get unread message count for a user in a conversation
     */
    async getUnreadCount(
        tenantId: string,
        conversationId: ConversationId,
        userId: string
    ): Promise<number> {
        // Get participant's last read timestamp
        const participant = await this.participantRepo.findByUserAndConversation(
            tenantId,
            userId,
            conversationId
        );
        if (!participant) return 0;

        // Get unread messages
        const unreadMessages = await this.messageRepo.getUnreadForUser(
            tenantId,
            conversationId,
            userId,
            participant.lastReadAt
        );

        return unreadMessages.length;
    }

    /**
     * Get read receipts for a message
     * Returns who read the message and when
     */
    async getReadReceipts(
        tenantId: string,
        messageId: MessageId,
        userId: string
    ): Promise<Array<{ recipientId: string; readAt: Date }>> {
        const message = await this.messageRepo.getById(tenantId, messageId);
        if (!message) {
            throw new Error("Message not found");
        }

        // Get conversation and participants
        const conversation = await this.conversationRepo.getById(
            tenantId,
            message.conversationId
        );
        if (!conversation) {
            throw new Error("Conversation not found");
        }

        const participants = await this.participantRepo.listActiveForConversation(
            tenantId,
            message.conversationId
        );

        // Enforce access control
        enforceReadMessagePermission(tenantId, conversation, participants, userId);

        // Get read receipts
        return this.deliveryRepo.getReadReceipts(tenantId, messageId);
    }

    /**
     * Count messages in a conversation
     */
    async countForConversation(
        tenantId: string,
        conversationId: ConversationId,
        userId: string
    ): Promise<number> {
        // Get conversation and participants
        const conversation = await this.conversationRepo.getById(tenantId, conversationId);
        if (!conversation) {
            throw new Error("Conversation not found");
        }

        const participants = await this.participantRepo.listActiveForConversation(
            tenantId,
            conversationId
        );

        // Enforce access control
        enforceReadMessagePermission(tenantId, conversation, participants, userId);

        return this.messageRepo.countForConversation(tenantId, conversationId);
    }

    /**
     * List thread replies for a message
     * Enforces participant-only access
     */
    async listThreadReplies(
        tenantId: string,
        parentMessageId: MessageId,
        userId: string,
        options?: { limit?: number }
    ): Promise<Message[]> {
        // Get parent message
        const parentMessage = await this.messageRepo.getById(tenantId, parentMessageId);
        if (!parentMessage) {
            throw new Error("Parent message not found");
        }

        // Get conversation and participants
        const conversation = await this.conversationRepo.getById(
            tenantId,
            parentMessage.conversationId
        );
        if (!conversation) {
            throw new Error("Conversation not found");
        }

        const participants = await this.participantRepo.listActiveForConversation(
            tenantId,
            parentMessage.conversationId
        );

        // Enforce access control
        enforceReadMessagePermission(tenantId, conversation, participants, userId);

        // List thread replies
        return this.messageRepo.listThreadReplies(tenantId, parentMessageId, options);
    }

    /**
     * Count thread replies for a message
     */
    async countThreadReplies(
        tenantId: string,
        parentMessageId: MessageId,
        userId: string
    ): Promise<number> {
        // Get parent message
        const parentMessage = await this.messageRepo.getById(tenantId, parentMessageId);
        if (!parentMessage) {
            throw new Error("Parent message not found");
        }

        // Get conversation and participants
        const conversation = await this.conversationRepo.getById(
            tenantId,
            parentMessage.conversationId
        );
        if (!conversation) {
            throw new Error("Conversation not found");
        }

        const participants = await this.participantRepo.listActiveForConversation(
            tenantId,
            parentMessage.conversationId
        );

        // Enforce access control
        enforceReadMessagePermission(tenantId, conversation, participants, userId);

        return this.messageRepo.countThreadReplies(tenantId, parentMessageId);
    }

    /**
     * Search messages across all conversations the user has access to
     * Enforces participant-only access
     */
    async searchMessages(
        tenantId: string,
        userId: string,
        searchQuery: string,
        options?: SearchMessagesOptions
    ): Promise<MessageSearchResult[]> {
        const timer = new MetricTimer(this.metrics);

        try {
            // Check rate limit
            await this.rateLimiter.enforceSearchLimit(tenantId, userId);

            if (!searchQuery || searchQuery.trim().length === 0) {
                return [];
            }

        // If searching within a specific conversation, verify access
        if (options?.conversationId) {
            const conversation = await this.conversationRepo.getById(
                tenantId,
                options.conversationId
            );
            if (!conversation) {
                throw new Error("Conversation not found");
            }

            const participants = await this.participantRepo.listActiveForConversation(
                tenantId,
                options.conversationId
            );

            // Enforce access control
            enforceReadMessagePermission(tenantId, conversation, participants, userId);

            // Search within this conversation
            return this.messageRepo.searchMessages(tenantId, searchQuery, options);
        }

        // Search across all conversations
        // First, get all conversations where user is a participant
        const userParticipations = await this.participantRepo.listForUser(tenantId, userId);
        const conversationIds = userParticipations.map(p => p.conversationId);

        if (conversationIds.length === 0) {
            return []; // User has no conversations
        }

        // Perform search across all user's conversations
        const allResults = await this.messageRepo.searchMessages(
            tenantId,
            searchQuery,
            options
        );

        // Filter results to only conversations where user is a participant
        const allowedConversationIds = new Set(conversationIds);
        const filteredResults = allResults.filter(result =>
            allowedConversationIds.has(result.message.conversationId)
        );

            // Log audit event
            await this.auditLogger.logSearch(
                tenantId,
                userId,
                searchQuery,
                filteredResults.length,
                options?.conversationId,
                {
                    limit: options?.limit,
                    offset: options?.offset,
                }
            );

            // Track metrics
            const latencyMs = timer.stop("searchMessages", tenantId);
            this.metrics.trackSearch(
                tenantId,
                filteredResults.length,
                latencyMs,
                options?.conversationId
            );

            return filteredResults;
        } catch (err: any) {
            // Track error metrics
            if (err instanceof RateLimitExceededError) {
                this.metrics.trackRateLimitExceeded(tenantId, "search");
                await this.auditLogger.logRateLimitExceeded(
                    tenantId,
                    userId,
                    "search",
                    { retryAfter: err.retryAfter }
                );
            } else {
                this.metrics.trackSearchFailure(
                    tenantId,
                    err.name || "unknown",
                    options?.conversationId
                );
                this.metrics.trackError(err.name || "unknown", "searchMessages", tenantId);
            }
            throw err;
        }
    }

    /**
     * Count search results
     */
    async countSearchResults(
        tenantId: string,
        userId: string,
        searchQuery: string,
        options?: { conversationId?: ConversationId }
    ): Promise<number> {
        if (!searchQuery || searchQuery.trim().length === 0) {
            return 0;
        }

        // If searching within a specific conversation, verify access and count
        if (options?.conversationId) {
            const conversation = await this.conversationRepo.getById(
                tenantId,
                options.conversationId
            );
            if (!conversation) {
                throw new Error("Conversation not found");
            }

            const participants = await this.participantRepo.listActiveForConversation(
                tenantId,
                options.conversationId
            );

            enforceReadMessagePermission(tenantId, conversation, participants, userId);

            return this.messageRepo.countSearchResults(tenantId, searchQuery, options);
        }

        // Count across all user's conversations
        const userParticipations = await this.participantRepo.listForUser(tenantId, userId);
        const conversationIds = userParticipations.map(p => p.conversationId);

        if (conversationIds.length === 0) {
            return 0;
        }

        // Get total count across all conversations
        // Note: This is approximate since we filter after, but good enough for pagination
        const allResults = await this.messageRepo.searchMessages(
            tenantId,
            searchQuery,
            { limit: 1000 } // Reasonable upper limit
        );

        const allowedConversationIds = new Set(conversationIds);
        return allResults.filter(result =>
            allowedConversationIds.has(result.message.conversationId)
        ).length;
    }
}
