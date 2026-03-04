/**
 * In-App Messaging — Module Composition Root
 *
 * Registers conversation + message services, repos, and HTTP handlers.
 * Follows the RuntimeModule pattern (register + contribute).
 */

import { TOKENS } from "../../../kernel/tokens.js";

// Domain services
import { ConversationService } from "./domain/services/ConversationService.js";
import { MessageService } from "./domain/services/MessageService.js";

import type { Container } from "../../../kernel/container.js";
import type { Logger } from "../../../kernel/logger.js";
import type { RouteRegistry } from "../../platform/foundation/registries/routes.registry.js";
import type { RuntimeModule } from "../../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Internal Tokens
// ============================================================================

const MSG_TOKENS = {
    conversationService: "messaging.service.conversation",
    messageService: "messaging.service.message",
    // Handlers
    listConversationsHandler: "messaging.handler.listConversations",
    getConversationHandler: "messaging.handler.getConversation",
    createDirectHandler: "messaging.handler.createDirect",
    createGroupHandler: "messaging.handler.createGroup",
    sendMessageHandler: "messaging.handler.sendMessage",
    listMessagesHandler: "messaging.handler.listMessages",
    markReadHandler: "messaging.handler.markRead",
    markAllReadHandler: "messaging.handler.markAllRead",
    searchHandler: "messaging.handler.search",
    unreadCountHandler: "messaging.handler.unreadCount",
    threadRepliesHandler: "messaging.handler.threadReplies",
} as const;

// ============================================================================
// Simple Handler Classes
// ============================================================================

class ListConversationsHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(MSG_TOKENS.conversationService) as ConversationService;
        const { tenantId, userId, type, limit, offset } = req.query ?? {};
        const conversations = await service.listForUser(
            ctx.tenant?.id ?? tenantId,
            ctx.auth?.principalId ?? userId,
            { type, limit: Number(limit) || 50, offset: Number(offset) || 0 },
        );
        return res.json({ success: true, conversations });
    }
}

class GetConversationHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(MSG_TOKENS.conversationService) as ConversationService;
        const result = await service.getById(
            ctx.tenant?.id,
            req.params.id,
            ctx.auth?.principalId,
        );
        if (!result) return res.status(404).json({ success: false, error: "Not found" });
        return res.json({ success: true, ...result });
    }
}

class CreateDirectHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(MSG_TOKENS.conversationService) as ConversationService;
        const { participantId } = req.body;
        const result = await service.createDirect({
            tenantId: ctx.tenant?.id,
            createdBy: ctx.auth?.principalId,
            participantIds: [ctx.auth?.principalId, participantId],
        });
        return res.status(201).json({ success: true, ...result });
    }
}

class CreateGroupHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(MSG_TOKENS.conversationService) as ConversationService;
        const { title, participantIds } = req.body;
        const result = await service.createGroup({
            tenantId: ctx.tenant?.id,
            createdBy: ctx.auth?.principalId,
            title,
            participantIds: [ctx.auth?.principalId, ...participantIds],
        });
        return res.status(201).json({ success: true, ...result });
    }
}

class SendMessageHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(MSG_TOKENS.messageService) as MessageService;
        const { conversationId, body, bodyFormat, parentMessageId, clientMessageId } = req.body;
        const result = await service.sendMessage({
            tenantId: ctx.tenant?.id,
            conversationId,
            senderId: ctx.auth?.principalId,
            body,
            bodyFormat,
            parentMessageId,
            clientMessageId,
        });
        return res.status(201).json({ success: true, ...result });
    }
}

class ListMessagesHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(MSG_TOKENS.messageService) as MessageService;
        const conversationId = req.params.conversationId;
        const { limit, beforeMessageId } = req.query ?? {};
        const messages = await service.listForConversation(
            ctx.tenant?.id,
            conversationId,
            ctx.auth?.principalId,
            { limit: Number(limit) || 50, beforeMessageId },
        );
        return res.json({ success: true, messages });
    }
}

class MarkReadHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(MSG_TOKENS.messageService) as MessageService;
        const { conversationId, messageId } = req.body;
        await service.markAsRead({
            tenantId: ctx.tenant?.id,
            conversationId,
            userId: ctx.auth?.principalId,
            messageId,
        });
        return res.json({ success: true });
    }
}

class MarkAllReadHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(MSG_TOKENS.messageService) as MessageService;
        const conversationId = req.params.conversationId;
        await service.markAllAsRead(ctx.tenant?.id, conversationId, ctx.auth?.principalId);
        return res.json({ success: true });
    }
}

class SearchHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(MSG_TOKENS.messageService) as MessageService;
        const { q, conversationId, limit, offset } = req.query ?? {};
        const results = await service.searchMessages(
            ctx.tenant?.id,
            ctx.auth?.principalId,
            q,
            { conversationId, limit: Number(limit) || 20, offset: Number(offset) || 0 },
        );
        return res.json({ success: true, results });
    }
}

class UnreadCountHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(MSG_TOKENS.messageService) as MessageService;
        const conversationId = req.params.conversationId;
        const count = await service.getUnreadCount(
            ctx.tenant?.id,
            conversationId,
            ctx.auth?.principalId,
        );
        return res.json({ success: true, count });
    }
}

class ThreadRepliesHandler {
    async handle(req: any, res: any, ctx: any) {
        const service = await ctx.container.resolve(MSG_TOKENS.messageService) as MessageService;
        const parentMessageId = req.params.messageId;
        const { limit } = req.query ?? {};
        const replies = await service.listThreadReplies(
            ctx.tenant?.id,
            parentMessageId,
            ctx.auth?.principalId,
            { limit: Number(limit) || 50 },
        );
        return res.json({ success: true, replies });
    }
}

// ============================================================================
// Module Definition
// ============================================================================

export const module: RuntimeModule = {
    name: "enterprise-services.in-app-messaging",

    async register(c: Container) {
        const db = await c.resolve<Kysely<DB>>(TOKENS.db);
        const logger = await c.resolve<Logger>(TOKENS.logger);

        logger.info("Registering in-app messaging module");

        // Services
        c.register(MSG_TOKENS.conversationService, async () => new ConversationService(db), "singleton");
        c.register(MSG_TOKENS.messageService, async () => new MessageService(db), "singleton");

        // Handlers
        c.register(MSG_TOKENS.listConversationsHandler, async () => new ListConversationsHandler(), "singleton");
        c.register(MSG_TOKENS.getConversationHandler, async () => new GetConversationHandler(), "singleton");
        c.register(MSG_TOKENS.createDirectHandler, async () => new CreateDirectHandler(), "singleton");
        c.register(MSG_TOKENS.createGroupHandler, async () => new CreateGroupHandler(), "singleton");
        c.register(MSG_TOKENS.sendMessageHandler, async () => new SendMessageHandler(), "singleton");
        c.register(MSG_TOKENS.listMessagesHandler, async () => new ListMessagesHandler(), "singleton");
        c.register(MSG_TOKENS.markReadHandler, async () => new MarkReadHandler(), "singleton");
        c.register(MSG_TOKENS.markAllReadHandler, async () => new MarkAllReadHandler(), "singleton");
        c.register(MSG_TOKENS.searchHandler, async () => new SearchHandler(), "singleton");
        c.register(MSG_TOKENS.unreadCountHandler, async () => new UnreadCountHandler(), "singleton");
        c.register(MSG_TOKENS.threadRepliesHandler, async () => new ThreadRepliesHandler(), "singleton");
    },

    async contribute(c: Container) {
        const logger = await c.resolve<Logger>(TOKENS.logger);
        const routes = await c.resolve<RouteRegistry>(TOKENS.routeRegistry);

        // ── Conversations ───────────────────────────────────────────────
        routes.add({
            method: "GET",
            path: "/api/messages/conversations",
            handlerToken: MSG_TOKENS.listConversationsHandler,
            authRequired: true,
            tags: ["messaging"],
        });
        routes.add({
            method: "GET",
            path: "/api/messages/conversations/:id",
            handlerToken: MSG_TOKENS.getConversationHandler,
            authRequired: true,
            tags: ["messaging"],
        });
        routes.add({
            method: "POST",
            path: "/api/messages/conversations/direct",
            handlerToken: MSG_TOKENS.createDirectHandler,
            authRequired: true,
            tags: ["messaging"],
        });
        routes.add({
            method: "POST",
            path: "/api/messages/conversations/group",
            handlerToken: MSG_TOKENS.createGroupHandler,
            authRequired: true,
            tags: ["messaging"],
        });

        // ── Messages ────────────────────────────────────────────────────
        routes.add({
            method: "POST",
            path: "/api/messages/send",
            handlerToken: MSG_TOKENS.sendMessageHandler,
            authRequired: true,
            tags: ["messaging"],
        });
        routes.add({
            method: "GET",
            path: "/api/messages/conversations/:conversationId/messages",
            handlerToken: MSG_TOKENS.listMessagesHandler,
            authRequired: true,
            tags: ["messaging"],
        });
        routes.add({
            method: "POST",
            path: "/api/messages/read",
            handlerToken: MSG_TOKENS.markReadHandler,
            authRequired: true,
            tags: ["messaging"],
        });
        routes.add({
            method: "POST",
            path: "/api/messages/conversations/:conversationId/read-all",
            handlerToken: MSG_TOKENS.markAllReadHandler,
            authRequired: true,
            tags: ["messaging"],
        });
        routes.add({
            method: "GET",
            path: "/api/messages/search",
            handlerToken: MSG_TOKENS.searchHandler,
            authRequired: true,
            tags: ["messaging"],
        });
        routes.add({
            method: "GET",
            path: "/api/messages/conversations/:conversationId/unread-count",
            handlerToken: MSG_TOKENS.unreadCountHandler,
            authRequired: true,
            tags: ["messaging"],
        });

        // ── Thread Replies ──────────────────────────────────────────────
        routes.add({
            method: "GET",
            path: "/api/messages/:messageId/thread",
            handlerToken: MSG_TOKENS.threadRepliesHandler,
            authRequired: true,
            tags: ["messaging"],
        });

        logger.info("In-app messaging module contributed — routes registered");
    },
};

export const moduleCode = "MESSAGING";
export const moduleName = "In-App Messaging";
