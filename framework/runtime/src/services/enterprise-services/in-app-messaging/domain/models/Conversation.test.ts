/**
 * Conversation Domain Model — Unit Tests
 */

import { describe, it, expect } from "vitest";

import { ConversationValidationError } from "../types.js";

import {
  createDirectConversation,
  createGroupConversation,
  validateDirectConversationInput,
  validateGroupConversationInput,
  validateTitleUpdate,
  isDirectConversation,
  isGroupConversation,
} from "./Conversation.js";

import type {
  CreateDirectConversationInput,
  CreateGroupConversationInput,
  Conversation,
} from "../types.js";

describe("Conversation Domain Model", () => {
  describe("Direct Conversation Validation", () => {
    it("should accept valid direct conversation input", () => {
      const input: CreateDirectConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-1",
        participantIds: ["user-1", "user-2"],
      };

      expect(() => validateDirectConversationInput(input)).not.toThrow();
    });

    it("should reject direct conversation with less than 2 participants", () => {
      const input: CreateDirectConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-1",
        participantIds: ["user-1"] as any,
      };

      expect(() => validateDirectConversationInput(input)).toThrow(
        ConversationValidationError,
      );
    });

    it("should reject direct conversation with more than 2 participants", () => {
      const input: CreateDirectConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-1",
        participantIds: ["user-1", "user-2", "user-3"] as any,
      };

      expect(() => validateDirectConversationInput(input)).toThrow(
        ConversationValidationError,
      );
    });

    it("should reject direct conversation with duplicate participants", () => {
      const input: CreateDirectConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-1",
        participantIds: ["user-1", "user-1"],
      };

      expect(() => validateDirectConversationInput(input)).toThrow(
        ConversationValidationError,
      );
    });

    it("should reject direct conversation where creator is not a participant", () => {
      const input: CreateDirectConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-3",
        participantIds: ["user-1", "user-2"],
      };

      expect(() => validateDirectConversationInput(input)).toThrow(
        ConversationValidationError,
      );
    });

    it("should create valid direct conversation value object", () => {
      const input: CreateDirectConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-1",
        participantIds: ["user-1", "user-2"],
      };

      const conversation = createDirectConversation(input);

      expect(conversation.tenantId).toBe("tenant-1");
      expect(conversation.type).toBe("direct");
      expect(conversation.title).toBeNull();
      expect(conversation.createdBy).toBe("user-1");
    });
  });

  describe("Group Conversation Validation", () => {
    it("should accept valid group conversation input", () => {
      const input: CreateGroupConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-1",
        title: "Project Team",
        participantIds: ["user-1", "user-2", "user-3"],
      };

      expect(() => validateGroupConversationInput(input)).not.toThrow();
    });

    it("should reject group conversation with less than 2 participants", () => {
      const input: CreateGroupConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-1",
        title: "Solo Chat",
        participantIds: ["user-1"],
      };

      expect(() => validateGroupConversationInput(input)).toThrow(
        ConversationValidationError,
      );
    });

    it("should reject group conversation with duplicate participants", () => {
      const input: CreateGroupConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-1",
        title: "Team Chat",
        participantIds: ["user-1", "user-2", "user-2"],
      };

      expect(() => validateGroupConversationInput(input)).toThrow(
        ConversationValidationError,
      );
    });

    it("should reject group conversation with empty title", () => {
      const input: CreateGroupConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-1",
        title: "   ",
        participantIds: ["user-1", "user-2"],
      };

      expect(() => validateGroupConversationInput(input)).toThrow(
        ConversationValidationError,
      );
    });

    it("should reject group conversation with title exceeding 200 characters", () => {
      const input: CreateGroupConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-1",
        title: "a".repeat(201),
        participantIds: ["user-1", "user-2"],
      };

      expect(() => validateGroupConversationInput(input)).toThrow(
        ConversationValidationError,
      );
    });

    it("should reject group conversation where creator is not a participant", () => {
      const input: CreateGroupConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-3",
        title: "Team Chat",
        participantIds: ["user-1", "user-2"],
      };

      expect(() => validateGroupConversationInput(input)).toThrow(
        ConversationValidationError,
      );
    });

    it("should reject group conversation with invalid admin IDs", () => {
      const input: CreateGroupConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-1",
        title: "Team Chat",
        participantIds: ["user-1", "user-2"],
        adminIds: ["user-1", "user-99"], // user-99 not in participants
      };

      expect(() => validateGroupConversationInput(input)).toThrow(
        ConversationValidationError,
      );
    });

    it("should create valid group conversation value object", () => {
      const input: CreateGroupConversationInput = {
        tenantId: "tenant-1",
        createdBy: "user-1",
        title: "  Project Team  ",
        participantIds: ["user-1", "user-2", "user-3"],
      };

      const conversation = createGroupConversation(input);

      expect(conversation.tenantId).toBe("tenant-1");
      expect(conversation.type).toBe("group");
      expect(conversation.title).toBe("Project Team"); // Trimmed
      expect(conversation.createdBy).toBe("user-1");
    });
  });

  describe("Title Update Validation", () => {
    it("should reject title update for direct conversations", () => {
      const conversation: Conversation = {
        id: "conv-1" as any,
        tenantId: "tenant-1",
        type: "direct",
        title: null,
        createdAt: new Date(),
        createdBy: "user-1",
        updatedAt: null,
        updatedBy: null,
      };

      expect(() => validateTitleUpdate(conversation, "New Title")).toThrow(
        ConversationValidationError,
      );
    });

    it("should reject empty title for group conversations", () => {
      const conversation: Conversation = {
        id: "conv-1" as any,
        tenantId: "tenant-1",
        type: "group",
        title: "Old Title",
        createdAt: new Date(),
        createdBy: "user-1",
        updatedAt: null,
        updatedBy: null,
      };

      expect(() => validateTitleUpdate(conversation, "   ")).toThrow(
        ConversationValidationError,
      );
    });

    it("should reject title exceeding 200 characters", () => {
      const conversation: Conversation = {
        id: "conv-1" as any,
        tenantId: "tenant-1",
        type: "group",
        title: "Old Title",
        createdAt: new Date(),
        createdBy: "user-1",
        updatedAt: null,
        updatedBy: null,
      };

      expect(() => validateTitleUpdate(conversation, "a".repeat(201))).toThrow(
        ConversationValidationError,
      );
    });

    it("should accept valid title update for group conversations", () => {
      const conversation: Conversation = {
        id: "conv-1" as any,
        tenantId: "tenant-1",
        type: "group",
        title: "Old Title",
        createdAt: new Date(),
        createdBy: "user-1",
        updatedAt: null,
        updatedBy: null,
      };

      expect(() =>
        validateTitleUpdate(conversation, "New Title"),
      ).not.toThrow();
    });
  });

  describe("Conversation Type Helpers", () => {
    it("should correctly identify direct conversations", () => {
      const directConv: Conversation = {
        id: "conv-1" as any,
        tenantId: "tenant-1",
        type: "direct",
        title: null,
        createdAt: new Date(),
        createdBy: "user-1",
        updatedAt: null,
        updatedBy: null,
      };

      expect(isDirectConversation(directConv)).toBe(true);
      expect(isGroupConversation(directConv)).toBe(false);
    });

    it("should correctly identify group conversations", () => {
      const groupConv: Conversation = {
        id: "conv-1" as any,
        tenantId: "tenant-1",
        type: "group",
        title: "Team Chat",
        createdAt: new Date(),
        createdBy: "user-1",
        updatedAt: null,
        updatedBy: null,
      };

      expect(isGroupConversation(groupConv)).toBe(true);
      expect(isDirectConversation(groupConv)).toBe(false);
    });
  });
});
