/**
 * Message Domain Model — Unit Tests
 */

import { describe, it, expect } from "vitest";

import { MessageValidationError } from "../types.js";

import {
    validateMessageBody,
    validateMessageFormat,
    validateClientMessageId,
    createMessage,
    applyMessageEdit,
    softDeleteMessage,
    isMessageEdited,
    isMessageDeleted,
    getMessageDisplayBody,
    isMarkdownMessage,
} from "./Message.js";

import type {
    CreateMessageInput,
    EditMessageInput,
    Message,
} from "../types.js";

describe("Message Domain Model", () => {
    describe("Message Body Validation", () => {
        it("should accept valid message body", () => {
            expect(() => validateMessageBody("Hello, world!")).not.toThrow();
        });

        it("should reject empty message body", () => {
            expect(() => validateMessageBody(""))
                .toThrow(MessageValidationError);
        });

        it("should reject whitespace-only message body", () => {
            expect(() => validateMessageBody("   \n\t   "))
                .toThrow(MessageValidationError);
        });

        it("should reject message body exceeding max length", () => {
            const longMessage = "a".repeat(10001);
            expect(() => validateMessageBody(longMessage))
                .toThrow(MessageValidationError);
        });

        it("should accept message body at max length", () => {
            const maxMessage = "a".repeat(10000);
            expect(() => validateMessageBody(maxMessage)).not.toThrow();
        });
    });

    describe("Message Format Validation", () => {
        it("should accept 'plain' format", () => {
            expect(validateMessageFormat("plain")).toBe("plain");
        });

        it("should accept 'markdown' format", () => {
            expect(validateMessageFormat("markdown")).toBe("markdown");
        });

        it("should reject invalid format", () => {
            expect(() => validateMessageFormat("html"))
                .toThrow(MessageValidationError);
        });
    });

    describe("Client Message ID Validation", () => {
        it("should accept valid client message ID", () => {
            expect(() => validateClientMessageId("msg-123-abc")).not.toThrow();
        });

        it("should accept alphanumeric with dashes and underscores", () => {
            expect(() => validateClientMessageId("client_msg_123-456")).not.toThrow();
        });

        it("should reject client message ID with invalid characters", () => {
            expect(() => validateClientMessageId("msg@123"))
                .toThrow(MessageValidationError);
        });

        it("should reject client message ID exceeding max length", () => {
            const longId = "a".repeat(256);
            expect(() => validateClientMessageId(longId))
                .toThrow(MessageValidationError);
        });
    });

    describe("Message Creation", () => {
        it("should create valid message with all fields", () => {
            const input: CreateMessageInput = {
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "Hello, world!",
                bodyFormat: "plain",
                clientMessageId: "msg-123",
            };

            const message = createMessage(input);

            expect(message.tenantId).toBe("tenant-1");
            expect(message.conversationId).toBe("conv-1");
            expect(message.senderId).toBe("user-1");
            expect(message.body).toBe("Hello, world!");
            expect(message.bodyFormat).toBe("plain");
            expect(message.clientMessageId).toBe("msg-123");
        });

        it("should create message with default format", () => {
            const input: CreateMessageInput = {
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "Hello, world!",
            };

            const message = createMessage(input);

            expect(message.bodyFormat).toBe("plain");
            expect(message.clientMessageId).toBeNull();
        });

        it("should reject message with invalid body", () => {
            const input: CreateMessageInput = {
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "",
            };

            expect(() => createMessage(input))
                .toThrow(MessageValidationError);
        });
    });

    describe("Message Editing", () => {
        it("should allow sender to edit their own message", () => {
            const message: Message = {
                id: "msg-1" as any,
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "Original message",
                bodyFormat: "plain",
                clientMessageId: null,
                createdAt: new Date(),
                editedAt: null,
                deletedAt: null,
            };

            const input: EditMessageInput = {
                tenantId: "tenant-1",
                messageId: "msg-1" as any,
                userId: "user-1",
                body: "Edited message",
            };

            const edited = applyMessageEdit(message, input);

            expect(edited.body).toBe("Edited message");
            expect(edited.editedAt).toBeInstanceOf(Date);
            expect(isMessageEdited(edited)).toBe(true);
        });

        it("should reject edit by non-sender", () => {
            const message: Message = {
                id: "msg-1" as any,
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "Original message",
                bodyFormat: "plain",
                clientMessageId: null,
                createdAt: new Date(),
                editedAt: null,
                deletedAt: null,
            };

            const input: EditMessageInput = {
                tenantId: "tenant-1",
                messageId: "msg-1" as any,
                userId: "user-2", // Different user
                body: "Edited message",
            };

            expect(() => applyMessageEdit(message, input))
                .toThrow(MessageValidationError);
        });

        it("should reject edit of deleted message", () => {
            const message: Message = {
                id: "msg-1" as any,
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "Original message",
                bodyFormat: "plain",
                clientMessageId: null,
                createdAt: new Date(),
                editedAt: null,
                deletedAt: new Date(), // Deleted
            };

            const input: EditMessageInput = {
                tenantId: "tenant-1",
                messageId: "msg-1" as any,
                userId: "user-1",
                body: "Edited message",
            };

            expect(() => applyMessageEdit(message, input))
                .toThrow(MessageValidationError);
        });

        it("should reject cross-tenant edit", () => {
            const message: Message = {
                id: "msg-1" as any,
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "Original message",
                bodyFormat: "plain",
                clientMessageId: null,
                createdAt: new Date(),
                editedAt: null,
                deletedAt: null,
            };

            const input: EditMessageInput = {
                tenantId: "tenant-2", // Different tenant
                messageId: "msg-1" as any,
                userId: "user-1",
                body: "Edited message",
            };

            expect(() => applyMessageEdit(message, input))
                .toThrow(MessageValidationError);
        });
    });

    describe("Message Deletion", () => {
        it("should allow sender to delete their own message", () => {
            const message: Message = {
                id: "msg-1" as any,
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "Message to delete",
                bodyFormat: "plain",
                clientMessageId: null,
                createdAt: new Date(),
                editedAt: null,
                deletedAt: null,
            };

            const deleted = softDeleteMessage(message, "tenant-1", "user-1");

            expect(deleted.deletedAt).toBeInstanceOf(Date);
            expect(isMessageDeleted(deleted)).toBe(true);
        });

        it("should reject deletion by non-sender", () => {
            const message: Message = {
                id: "msg-1" as any,
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "Message to delete",
                bodyFormat: "plain",
                clientMessageId: null,
                createdAt: new Date(),
                editedAt: null,
                deletedAt: null,
            };

            expect(() => softDeleteMessage(message, "tenant-1", "user-2"))
                .toThrow(MessageValidationError);
        });

        it("should reject deletion of already deleted message", () => {
            const message: Message = {
                id: "msg-1" as any,
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "Message to delete",
                bodyFormat: "plain",
                clientMessageId: null,
                createdAt: new Date(),
                editedAt: null,
                deletedAt: new Date(), // Already deleted
            };

            expect(() => softDeleteMessage(message, "tenant-1", "user-1"))
                .toThrow(MessageValidationError);
        });
    });

    describe("Message Display Helpers", () => {
        it("should return message body for non-deleted message", () => {
            const message: Message = {
                id: "msg-1" as any,
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "Hello, world!",
                bodyFormat: "plain",
                clientMessageId: null,
                createdAt: new Date(),
                editedAt: null,
                deletedAt: null,
            };

            expect(getMessageDisplayBody(message)).toBe("Hello, world!");
        });

        it("should return placeholder for deleted message", () => {
            const message: Message = {
                id: "msg-1" as any,
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "Hello, world!",
                bodyFormat: "plain",
                clientMessageId: null,
                createdAt: new Date(),
                editedAt: null,
                deletedAt: new Date(),
            };

            expect(getMessageDisplayBody(message)).toBe("[Message deleted]");
        });

        it("should correctly identify markdown messages", () => {
            const plainMessage: Message = {
                id: "msg-1" as any,
                tenantId: "tenant-1",
                conversationId: "conv-1" as any,
                senderId: "user-1",
                body: "Plain text",
                bodyFormat: "plain",
                clientMessageId: null,
                createdAt: new Date(),
                editedAt: null,
                deletedAt: null,
            };

            const markdownMessage: Message = {
                ...plainMessage,
                id: "msg-2" as any,
                bodyFormat: "markdown",
            };

            expect(isMarkdownMessage(plainMessage)).toBe(false);
            expect(isMarkdownMessage(markdownMessage)).toBe(true);
        });
    });
});
