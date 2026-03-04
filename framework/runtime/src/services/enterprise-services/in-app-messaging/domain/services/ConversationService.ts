/**
 * ConversationService — Business logic orchestration for conversations
 *
 * Handles:
 * - Creating conversations with participants atomically
 * - Managing conversation membership
 * - Applying domain policies and validation
 */

import { ConversationRepo } from "../../persistence/ConversationRepo";
import {
  ParticipantRepo,
  type AddParticipantInput,
} from "../../persistence/ParticipantRepo";
import {
  validateDirectConversationInput,
  validateGroupConversationInput,
  validateTitleUpdate,
} from "../models/Conversation";
import {
  enforceParticipantAccess,
  enforceAddParticipantsPermission,
  enforceRemoveParticipantPermission,
  enforceUpdateTitlePermission,
  validateNewParticipants,
  validateAdminRemoval,
} from "../policies/ConversationAccessPolicy";

import type {
  Conversation,
  ConversationId,
  ConversationParticipant,
  CreateDirectConversationInput,
  CreateGroupConversationInput,
  AddParticipantsInput,
  RemoveParticipantInput,
} from "../types";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export interface ConversationWithParticipants {
  conversation: Conversation;
  participants: ConversationParticipant[];
}

export class ConversationService {
  private conversationRepo: ConversationRepo;
  private participantRepo: ParticipantRepo;

  constructor(private readonly db: Kysely<DB>) {
    this.conversationRepo = new ConversationRepo(db);
    this.participantRepo = new ParticipantRepo(db);
  }

  /**
   * Create a direct conversation (1-on-1)
   * Creates conversation + 2 participants atomically
   */
  async createDirect(
    input: CreateDirectConversationInput,
  ): Promise<ConversationWithParticipants> {
    // Validate domain rules
    validateDirectConversationInput(input);

    // Check if conversation already exists
    const existing = await this.conversationRepo.findDirectConversation(
      input.tenantId,
      input.participantIds[0],
      input.participantIds[1],
    );

    if (existing) {
      // Return existing conversation
      const participants = await this.participantRepo.listActiveForConversation(
        input.tenantId,
        existing.id,
      );
      return { conversation: existing, participants };
    }

    // Create conversation
    const conversation = await this.conversationRepo.createDirect(input);

    // Add participants (both as members)
    const participantInputs: AddParticipantInput[] = input.participantIds.map(
      (userId) => ({
        conversationId: conversation.id,
        tenantId: input.tenantId,
        userId,
        role: "member",
      }),
    );

    const participants = await this.participantRepo.addBatch(participantInputs);

    return { conversation, participants };
  }

  /**
   * Create a group conversation
   * Creates conversation + participants atomically
   * Creator and specified admins get admin role, others get member role
   */
  async createGroup(
    input: CreateGroupConversationInput,
  ): Promise<ConversationWithParticipants> {
    // Validate domain rules
    validateGroupConversationInput(input);

    // Create conversation
    const conversation = await this.conversationRepo.createGroup(input);

    // Determine admins (creator + optional adminIds)
    const adminIds = new Set([input.createdBy, ...(input.adminIds ?? [])]);

    // Add participants with appropriate roles
    const participantInputs: AddParticipantInput[] = input.participantIds.map(
      (userId) => ({
        conversationId: conversation.id,
        tenantId: input.tenantId,
        userId,
        role: adminIds.has(userId) ? "admin" : "member",
      }),
    );

    const participants = await this.participantRepo.addBatch(participantInputs);

    return { conversation, participants };
  }

  /**
   * Get conversation with participants
   * Enforces participant-only access
   */
  async getById(
    tenantId: string,
    conversationId: ConversationId,
    userId: string,
  ): Promise<ConversationWithParticipants | undefined> {
    const conversation = await this.conversationRepo.getById(
      tenantId,
      conversationId,
    );
    if (!conversation) return undefined;

    const participants = await this.participantRepo.listActiveForConversation(
      tenantId,
      conversationId,
    );

    // Enforce access control
    enforceParticipantAccess(tenantId, conversation, participants, userId);

    return { conversation, participants };
  }

  /**
   * List conversations for a user
   */
  async listForUser(
    tenantId: string,
    userId: string,
    options?: { type?: "direct" | "group"; limit?: number; offset?: number },
  ): Promise<Conversation[]> {
    return this.conversationRepo.listForUser(tenantId, userId, options);
  }

  /**
   * Update conversation title (group only)
   * Enforces admin-only permission
   */
  async updateTitle(
    tenantId: string,
    conversationId: ConversationId,
    newTitle: string,
    requesterId: string,
  ): Promise<void> {
    const conversation = await this.conversationRepo.getById(
      tenantId,
      conversationId,
    );
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const participants = await this.participantRepo.listActiveForConversation(
      tenantId,
      conversationId,
    );

    // Enforce access control
    enforceUpdateTitlePermission(
      tenantId,
      conversation,
      participants,
      requesterId,
    );

    // Validate new title
    validateTitleUpdate(conversation, newTitle);

    // Update
    await this.conversationRepo.updateTitle(
      tenantId,
      conversationId,
      newTitle,
      requesterId,
    );
  }

  /**
   * Add participants to a group conversation
   * Enforces admin-only permission
   */
  async addParticipants(
    input: AddParticipantsInput,
  ): Promise<ConversationParticipant[]> {
    const conversation = await this.conversationRepo.getById(
      input.tenantId,
      input.conversationId,
    );
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const participants = await this.participantRepo.listActiveForConversation(
      input.tenantId,
      input.conversationId,
    );

    // Enforce access control
    enforceAddParticipantsPermission(
      input.tenantId,
      conversation,
      participants,
      input.requesterId,
    );

    // Validate that new participants are not already in the conversation
    validateNewParticipants(participants, input.participantIds);

    // Add participants as members
    const participantInputs: AddParticipantInput[] = input.participantIds.map(
      (userId) => ({
        conversationId: input.conversationId,
        tenantId: input.tenantId,
        userId,
        role: "member",
      }),
    );

    return this.participantRepo.addBatch(participantInputs);
  }

  /**
   * Remove a participant from a group conversation
   * Enforces permission: admins can remove anyone, users can remove themselves
   */
  async removeParticipant(input: RemoveParticipantInput): Promise<void> {
    const conversation = await this.conversationRepo.getById(
      input.tenantId,
      input.conversationId,
    );
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const participants = await this.participantRepo.listActiveForConversation(
      input.tenantId,
      input.conversationId,
    );

    // Enforce access control
    enforceRemoveParticipantPermission(
      input.tenantId,
      conversation,
      participants,
      input.requesterId,
      input.participantId,
    );

    // Validate admin removal (cannot remove last admin)
    validateAdminRemoval(participants, input.participantId);

    // Remove participant (soft delete)
    await this.participantRepo.remove(
      input.tenantId,
      input.conversationId,
      input.participantId,
    );
  }

  /**
   * Get participants for a conversation
   * Enforces participant-only access
   */
  async getParticipants(
    tenantId: string,
    conversationId: ConversationId,
    requesterId: string,
  ): Promise<ConversationParticipant[]> {
    const conversation = await this.conversationRepo.getById(
      tenantId,
      conversationId,
    );
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const participants = await this.participantRepo.listActiveForConversation(
      tenantId,
      conversationId,
    );

    // Enforce access control
    enforceParticipantAccess(tenantId, conversation, participants, requesterId);

    return participants;
  }

  /**
   * Count conversations for a user
   */
  async countForUser(
    tenantId: string,
    userId: string,
    type?: "direct" | "group",
  ): Promise<number> {
    return this.conversationRepo.countForUser(tenantId, userId, type);
  }
}
