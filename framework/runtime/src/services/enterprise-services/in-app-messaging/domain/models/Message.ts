/**
 * Message — Domain model with validation and business rules
 *
 * Represents an individual message within a conversation.
 */

import { MessageValidationError } from "../types";

import type {
  Message,
  MessageFormat,
  CreateMessageInput,
  EditMessageInput,
} from "../types";

/**
 * Maximum message body length (configurable, currently 10,000 characters)
 */
const MAX_MESSAGE_LENGTH = 10_000;

/**
 * Maximum client message ID length
 */
const MAX_CLIENT_MESSAGE_ID_LENGTH = 255;

/**
 * Validates message body
 *
 * Invariants:
 * - Body must not be empty
 * - Body must not exceed MAX_MESSAGE_LENGTH characters
 */
export function validateMessageBody(body: string): void {
  // Invariant: Body must not be empty
  if (!body || body.trim().length === 0) {
    throw new MessageValidationError("Message body must not be empty");
  }

  // Invariant: Body must not exceed max length
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new MessageValidationError(
      `Message body must not exceed ${MAX_MESSAGE_LENGTH} characters`,
      { bodyLength: body.length, maxLength: MAX_MESSAGE_LENGTH },
    );
  }
}

/**
 * Validates message format
 *
 * Ensures the format is one of the supported types
 */
export function validateMessageFormat(format: string): MessageFormat {
  if (format !== "plain" && format !== "markdown") {
    throw new MessageValidationError(
      "Message format must be 'plain' or 'markdown'",
      { providedFormat: format },
    );
  }
  return format as MessageFormat;
}

/**
 * Validates client message ID (idempotency key)
 *
 * Invariants:
 * - Must not exceed MAX_CLIENT_MESSAGE_ID_LENGTH characters
 * - Must be a valid identifier (alphanumeric, dashes, underscores)
 */
export function validateClientMessageId(clientMessageId: string): void {
  // Invariant: Must not exceed max length
  if (clientMessageId.length > MAX_CLIENT_MESSAGE_ID_LENGTH) {
    throw new MessageValidationError(
      `Client message ID must not exceed ${MAX_CLIENT_MESSAGE_ID_LENGTH} characters`,
      {
        length: clientMessageId.length,
        maxLength: MAX_CLIENT_MESSAGE_ID_LENGTH,
      },
    );
  }

  // Invariant: Must be a valid identifier
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(clientMessageId)) {
    throw new MessageValidationError(
      "Client message ID must contain only alphanumeric characters, dashes, and underscores",
      { clientMessageId },
    );
  }
}

/**
 * Validates message creation input
 *
 * Applies all message validation rules
 */
export function validateCreateMessageInput(input: CreateMessageInput): void {
  validateMessageBody(input.body);

  if (input.bodyFormat) {
    validateMessageFormat(input.bodyFormat);
  }

  if (input.clientMessageId) {
    validateClientMessageId(input.clientMessageId);
  }
}

/**
 * Creates a new message value object
 */
export function createMessage(
  input: CreateMessageInput,
): Omit<Message, "id" | "createdAt" | "editedAt" | "deletedAt"> {
  validateCreateMessageInput(input);

  return {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    senderId: input.senderId,
    body: input.body,
    bodyFormat: input.bodyFormat || "plain",
    clientMessageId: input.clientMessageId || null,
    parentMessageId: input.parentMessageId || null,
  };
}

/**
 * Validates message edit input
 *
 * Invariants:
 * - Message must not be soft-deleted
 * - Editor must be the original sender
 * - Body must be valid
 */
export function validateEditMessageInput(
  message: Message,
  input: EditMessageInput,
): void {
  // Invariant: Message must not be deleted
  if (message.deletedAt !== null) {
    throw new MessageValidationError("Cannot edit a deleted message", {
      messageId: message.id,
    });
  }

  // Invariant: Editor must be the original sender
  if (message.senderId !== input.userId) {
    throw new MessageValidationError(
      "Only the message sender can edit the message",
      { senderId: message.senderId, attemptedEditor: input.userId },
    );
  }

  // Invariant: New body must be valid
  validateMessageBody(input.body);

  // Invariant: Tenant must match
  if (message.tenantId !== input.tenantId) {
    throw new MessageValidationError("Tenant ID mismatch", {
      messageTenantId: message.tenantId,
      inputTenantId: input.tenantId,
    });
  }
}

/**
 * Applies an edit to a message
 *
 * Returns the updated message value object
 */
export function applyMessageEdit(
  message: Message,
  input: EditMessageInput,
): Message {
  validateEditMessageInput(message, input);

  return {
    ...message,
    body: input.body,
    editedAt: new Date(),
  };
}

/**
 * Checks if a message has been edited
 */
export function isMessageEdited(message: Message): boolean {
  return message.editedAt !== null;
}

/**
 * Checks if a message has been deleted (soft delete)
 */
export function isMessageDeleted(message: Message): boolean {
  return message.deletedAt !== null;
}

/**
 * Validates message deletion
 *
 * Invariants:
 * - Message must not already be deleted
 * - Deleter must be the original sender
 */
export function validateMessageDeletion(
  message: Message,
  tenantId: string,
  userId: string,
): void {
  // Invariant: Message must not already be deleted
  if (message.deletedAt !== null) {
    throw new MessageValidationError("Message is already deleted", {
      messageId: message.id,
    });
  }

  // Invariant: Deleter must be the original sender
  if (message.senderId !== userId) {
    throw new MessageValidationError(
      "Only the message sender can delete the message",
      { senderId: message.senderId, attemptedDeleter: userId },
    );
  }

  // Invariant: Tenant must match
  if (message.tenantId !== tenantId) {
    throw new MessageValidationError("Tenant ID mismatch", {
      messageTenantId: message.tenantId,
      inputTenantId: tenantId,
    });
  }
}

/**
 * Soft deletes a message
 *
 * Returns the updated message value object
 */
export function softDeleteMessage(
  message: Message,
  tenantId: string,
  userId: string,
): Message {
  validateMessageDeletion(message, tenantId, userId);

  return {
    ...message,
    deletedAt: new Date(),
  };
}

/**
 * Gets the display body for a message
 *
 * Returns the message body, or a placeholder if the message is deleted
 */
export function getMessageDisplayBody(message: Message): string {
  if (isMessageDeleted(message)) {
    return "[Message deleted]";
  }
  return message.body;
}

/**
 * Checks if a message uses markdown formatting
 */
export function isMarkdownMessage(message: Message): boolean {
  return message.bodyFormat === "markdown";
}
