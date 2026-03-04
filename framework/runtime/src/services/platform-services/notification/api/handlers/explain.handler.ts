/**
 * Explain Handler — "Why did I receive this?" notification explainability endpoint.
 */

import type { ExplainabilityService } from "../../domain/services/ExplainabilityService.js";

interface HandlerContext {
    container: { resolve<T>(token: string): Promise<T> };
    tenant: { tenantId: string };
    auth: { userId?: string; roles?: string[] };
}

interface Request {
    params: Record<string, string | undefined>;
}

interface Response {
    status(code: number): Response;
    json(data: unknown): void;
}

const EXPLAIN_TOKEN = "notify.explainability";

export class ExplainNotificationHandler {
    async handle(req: Request, res: Response, ctx: HandlerContext): Promise<void> {
        const explainService = await ctx.container.resolve<ExplainabilityService>(EXPLAIN_TOKEN);
        const tenantId = ctx.tenant.tenantId;
        const messageId = req.params.messageId;

        if (!messageId) {
            res.status(400).json({ success: false, error: "Missing messageId" });
            return;
        }

        const result = await explainService.explain(tenantId, messageId);
        if (!result) {
            res.status(404).json({ success: false, error: "Message not found" });
            return;
        }

        res.status(200).json({ success: true, data: result });
    }
}
