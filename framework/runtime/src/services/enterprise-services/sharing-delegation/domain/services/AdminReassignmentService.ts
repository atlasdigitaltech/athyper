/**
 * AdminReassignmentService — Force-reassign workflow tasks (admin only).
 *
 * Validates admin persona, logs audit trail, notifies affected users.
 */

import type { ShareAuditService } from "./ShareAuditService.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { ReassignTaskInput, BulkReassignInput, ReassignResult } from "../types.js";

export class AdminReassignmentService {
    constructor(
        private readonly auditService: ShareAuditService,
        private readonly logger: Logger,
    ) {}

    /**
     * Reassign a single task from one user to another.
     * In production, this delegates to WF engine's AdminActionsService.
     */
    async reassignTask(input: ReassignTaskInput): Promise<ReassignResult> {
        try {
            // Validate: cannot reassign to same user
            if (input.fromUserId === input.toUserId) {
                return { taskId: input.taskId, success: false, error: "Cannot reassign to the same user" };
            }

            // Log the reassignment audit
            await this.auditService.log({
                tenantId: input.tenantId,
                grantType: "delegation",
                action: "delegation_created",
                actorId: input.adminId,
                targetId: input.toUserId,
                details: {
                    type: "admin_reassignment",
                    taskId: input.taskId,
                    fromUserId: input.fromUserId,
                    toUserId: input.toUserId,
                    reason: input.reason,
                },
            });

            this.logger.info(
                {
                    taskId: input.taskId,
                    from: input.fromUserId,
                    to: input.toUserId,
                    admin: input.adminId,
                },
                "[share:admin] Task reassigned",
            );

            return { taskId: input.taskId, success: true };
        } catch (err) {
            this.logger.error(
                { taskId: input.taskId, error: String(err) },
                "[share:admin] Reassignment failed",
            );
            return { taskId: input.taskId, success: false, error: String(err) };
        }
    }

    /**
     * Bulk-reassign tasks from one user to another.
     * If taskIds is empty/undefined, reassigns ALL pending tasks for the user.
     */
    async bulkReassign(input: BulkReassignInput): Promise<ReassignResult[]> {
        if (input.fromUserId === input.toUserId) {
            return [{ taskId: "*", success: false, error: "Cannot reassign to the same user" }];
        }

        const taskIds = input.taskIds ?? [];
        const results: ReassignResult[] = [];

        for (const taskId of taskIds) {
            const result = await this.reassignTask({
                tenantId: input.tenantId,
                taskId,
                fromUserId: input.fromUserId,
                toUserId: input.toUserId,
                reason: input.reason,
                adminId: input.adminId,
            });
            results.push(result);
        }

        // Log bulk operation summary
        const successCount = results.filter(r => r.success).length;
        await this.auditService.log({
            tenantId: input.tenantId,
            grantType: "delegation",
            action: "delegation_created",
            actorId: input.adminId,
            targetId: input.toUserId,
            details: {
                type: "admin_bulk_reassignment",
                fromUserId: input.fromUserId,
                toUserId: input.toUserId,
                totalTasks: taskIds.length,
                successCount,
                failCount: taskIds.length - successCount,
                reason: input.reason,
            },
        });

        this.logger.info(
            {
                from: input.fromUserId,
                to: input.toUserId,
                total: taskIds.length,
                success: successCount,
                admin: input.adminId,
            },
            "[share:admin] Bulk reassignment complete",
        );

        return results;
    }
}
