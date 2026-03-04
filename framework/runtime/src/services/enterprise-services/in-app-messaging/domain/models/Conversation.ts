/**
 * Conversation — Domain model with validation and business rules
 *
 * Represents a container for direct or group messaging.
 */

import { ConversationValidationError } from "../types";

import type {
  Conversation,
  ConversationType,
  CreateDirectConversationInput,
  CreateGroupConversationInput,
} from "../types";

/**
 * Validates direct conversation input
 *
 * Invariants:
 * - Must have exactly 2 participants
 * - Participants must be distinct
 * - Creator must be one of the participants
 */
export function validateDirectConversationInput(
  input: CreateDirectConversationInput,
): void {
  const { createdBy, participantIds } = input;

  // Invariant: Direct conversations must have exactly 2 participants
  if (participantIds.length !== 2) {
    throw new ConversationValidationError(
      "Direct conversation must have exactly 2 participants",
      { participantCount: participantIds.length },
    );
  }

  // Invariant: Participants must be distinct
  if (participantIds[0] === participantIds[1]) {
    throw new ConversationValidationError(
      "Direct conversation participants must be distinct",
      { participantIds },
    );
  }

  // Invariant: Creator must be one of the participants
  if (!participantIds.includes(createdBy)) {
    throw new ConversationValidationError(
      "Creator must be one of the conversation participants",
      { createdBy, participantIds },
    );
  }
}

/**
 * Validates group conversation input
 *
 * Invariants:
 * - Must have at least 2 participants
 * - Participants must be distinct
 * - Creator must be one of the participants
 * - Title must not be empty
 * - Title must not exceed 200 characters
 * - All adminIds must be in participantIds
 */
export function validateGroupConversationInput(
  input: CreateGroupConversationInput,
): void {
  const { createdBy, participantIds, title, adminIds } = input;

  // Invariant: Group conversations must have at least 2 participants
  if (participantIds.length < 2) {
    throw new ConversationValidationError(
      "Group conversation must have at least 2 participants",
      { participantCount: participantIds.length },
    );
  }

  // Invariant: Participants must be distinct
  const uniqueParticipants = new Set(participantIds);
  if (uniqueParticipants.size !== participantIds.length) {
    throw new ConversationValidationError(
      "Group conversation participants must be distinct",
      {
        participantCount: participantIds.length,
        uniqueCount: uniqueParticipants.size,
      },
    );
  }

  // Invariant: Creator must be one of the participants
  if (!participantIds.includes(createdBy)) {
    throw new ConversationValidationError(
      "Creator must be one of the conversation participants",
      { createdBy, participantIds },
    );
  }

  // Invariant: Title must not be empty
  if (!title || title.trim().length === 0) {
    throw new ConversationValidationError(
      "Group conversation title must not be empty",
    );
  }

  // Invariant: Title must not exceed 200 characters
  if (title.length > 200) {
    throw new ConversationValidationError(
      "Group conversation title must not exceed 200 characters",
      { titleLength: title.length },
    );
  }

  // Invariant: All adminIds must be in participantIds
  if (adminIds && adminIds.length > 0) {
    const invalidAdmins = adminIds.filter(
      (adminId) => !participantIds.includes(adminId),
    );
    if (invalidAdmins.length > 0) {
      throw new ConversationValidationError(
        "All admin IDs must be in the participant list",
        { invalidAdmins },
      );
    }
  }
}

/**
 * Creates a new direct conversation value object
 */
export function createDirectConversation(
  input: CreateDirectConversationInput,
): Omit<Conversation, "id" | "createdAt" | "updatedAt" | "updatedBy"> {
  validateDirectConversationInput(input);

  return {
    tenantId: input.tenantId,
    type: "direct" as ConversationType,
    title: null, // Direct conversations don't have titles
    createdBy: input.createdBy,
  };
}

/**
 * Creates a new group conversation value object
 */
export function createGroupConversation(
  input: CreateGroupConversationInput,
): Omit<Conversation, "id" | "createdAt" | "updatedAt" | "updatedBy"> {
  validateGroupConversationInput(input);

  return {
    tenantId: input.tenantId,
    type: "group" as ConversationType,
    title: input.title.trim(),
    createdBy: input.createdBy,
  };
}

/**
 * Validates conversation title update
 *
 * Invariants:
 * - Title must not be empty
 * - Title must not exceed 200 characters
 * - Only group conversations can have titles updated
 */
export function validateTitleUpdate(
  conversation: Conversation,
  newTitle: string,
): void {
  // Invariant: Only group conversations can have titles
  if (conversation.type !== "group") {
    throw new ConversationValidationError(
      "Cannot update title for direct conversations",
    );
  }

  // Invariant: Title must not be empty
  if (!newTitle || newTitle.trim().length === 0) {
    throw new ConversationValidationError(
      "Conversation title must not be empty",
    );
  }

  // Invariant: Title must not exceed 200 characters
  if (newTitle.length > 200) {
    throw new ConversationValidationError(
      "Conversation title must not exceed 200 characters",
      { titleLength: newTitle.length },
    );
  }
}

/**
 * Checks if a conversation is a direct conversation
 */
export function isDirectConversation(conversation: Conversation): boolean {
  return conversation.type === "direct";
}

/**
 * Checks if a conversation is a group conversation
 */
export function isGroupConversation(conversation: Conversation): boolean {
  return conversation.type === "group";
}

/**
 * Gets the display title for a conversation
 *
 * For direct conversations, this would typically be constructed from participant names
 * at the presentation layer. This returns the stored title or null.
 */
export function getConversationTitle(
  conversation: Conversation,
): string | null {
  return conversation.title;
}
