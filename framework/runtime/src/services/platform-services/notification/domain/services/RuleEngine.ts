/**
 * RuleEngine — Match domain events to notification rules, produce delivery plans.
 *
 * Given a domain event, the RuleEngine:
 * 1. Queries meta.notification_rule for matching rules (event_type, entity_type, lifecycle_state)
 * 2. Evaluates optional condition expressions
 * 3. Returns a list of matched rules with their delivery configuration
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { NotificationRuleRepo } from "../../persistence/NotificationRuleRepo.js";
import type { NotificationRule } from "../models/NotificationRule.js";

export interface EventContext {
    tenantId: string;
    eventId: string;
    eventType: string;
    entityType?: string;
    entityId?: string;
    lifecycleState?: string;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface DeliveryPlanItem {
    rule: NotificationRule;
    /** Resolved from the event context + rule's recipient_rules */
    recipientSpecs: Array<{
        type: string;
        value: string;
    }>;
    channels: string[];
    priority: string;
    templateKey: string;
    dedupWindowMs: number;
}

export class RuleEngine {
    constructor(
        private readonly ruleRepo: NotificationRuleRepo,
        private readonly logger: Logger,
    ) {}

    /**
     * Find all rules matching a domain event and produce delivery plan items.
     */
    async evaluate(event: EventContext): Promise<DeliveryPlanItem[]> {
        // 1. Fetch all enabled rules for this event type (system + tenant-specific)
        const rules = await this.ruleRepo.findByEventType(event.tenantId, event.eventType);

        if (rules.length === 0) {
            this.logger.debug(
                { eventType: event.eventType, tenantId: event.tenantId },
                "[notify:rule] No rules match event",
            );
            return [];
        }

        const plans: DeliveryPlanItem[] = [];

        for (const rule of rules) {
            // 2. Filter by entity_type if rule specifies one
            if (rule.entityType && event.entityType && rule.entityType !== event.entityType) {
                continue;
            }

            // 3. Filter by lifecycle_state if rule specifies one
            if (rule.lifecycleState && event.lifecycleState && rule.lifecycleState !== event.lifecycleState) {
                continue;
            }

            // 4. Evaluate condition expression if present
            if (rule.conditionExpr && !this.evaluateCondition(rule.conditionExpr, event)) {
                this.logger.debug(
                    { ruleCode: rule.code, eventId: event.eventId },
                    "[notify:rule] Condition expression not met",
                );
                continue;
            }

            plans.push({
                rule,
                recipientSpecs: rule.recipientRules.map((r) => ({
                    type: r.type,
                    value: r.value,
                })),
                channels: rule.channels,
                priority: rule.priority,
                templateKey: rule.templateKey,
                dedupWindowMs: rule.dedupWindowMs,
            });
        }

        this.logger.info(
            {
                eventType: event.eventType,
                tenantId: event.tenantId,
                eventId: event.eventId,
                rulesEvaluated: rules.length,
                plansCreated: plans.length,
            },
            "[notify:rule] Event evaluated",
        );

        return plans;
    }

    /**
     * Evaluate a condition expression against an event context.
     *
     * Supports simple conditions:
     * - { "field": "payload.amount", "op": "gt", "value": 1000 }
     * - { "field": "payload.status", "op": "eq", "value": "approved" }
     * - { "field": "payload.priority", "op": "in", "value": ["high", "critical"] }
     * - { "all": [...conditions] } — all must match
     * - { "any": [...conditions] } — at least one must match
     */
    private evaluateCondition(
        condition: Record<string, unknown>,
        event: EventContext,
    ): boolean {
        // Composite: all
        if (Array.isArray(condition.all)) {
            return (condition.all as Record<string, unknown>[]).every((c) =>
                this.evaluateCondition(c, event),
            );
        }

        // Composite: any
        if (Array.isArray(condition.any)) {
            return (condition.any as Record<string, unknown>[]).some((c) =>
                this.evaluateCondition(c, event),
            );
        }

        // Simple field comparison
        const field = condition.field as string | undefined;
        const op = condition.op as string | undefined;
        const expected = condition.value;

        if (!field || !op) return true; // Malformed condition — pass through

        const actual = this.resolveField(field, event);

        switch (op) {
            case "eq":
                return actual === expected;
            case "neq":
                return actual !== expected;
            case "gt":
                return typeof actual === "number" && typeof expected === "number" && actual > expected;
            case "gte":
                return typeof actual === "number" && typeof expected === "number" && actual >= expected;
            case "lt":
                return typeof actual === "number" && typeof expected === "number" && actual < expected;
            case "lte":
                return typeof actual === "number" && typeof expected === "number" && actual <= expected;
            case "in":
                return Array.isArray(expected) && expected.includes(actual);
            case "not_in":
                return Array.isArray(expected) && !expected.includes(actual);
            case "exists":
                return actual !== undefined && actual !== null;
            case "not_exists":
                return actual === undefined || actual === null;
            default:
                return true; // Unknown operator — pass through
        }
    }

    /**
     * Resolve a dotted field path from the event context.
     * "payload.amount" → event.payload.amount
     * "metadata.source" → event.metadata.source
     * "entityType" → event.entityType
     */
    private resolveField(field: string, event: EventContext): unknown {
        const parts = field.split(".");

        // Top-level event fields
        const root = parts[0];
        let current: unknown;

        switch (root) {
            case "payload":
                current = event.payload;
                break;
            case "metadata":
                current = event.metadata;
                break;
            case "tenantId":
                return event.tenantId;
            case "eventType":
                return event.eventType;
            case "entityType":
                return event.entityType;
            case "entityId":
                return event.entityId;
            case "lifecycleState":
                return event.lifecycleState;
            default:
                // Try payload as default root
                current = event.payload;
                parts.unshift("payload");
        }

        // Navigate nested path (skip the root we already resolved)
        for (let i = 1; i < parts.length; i++) {
            if (current === null || current === undefined) return undefined;
            if (typeof current !== "object") return undefined;
            current = (current as Record<string, unknown>)[parts[i]];
        }

        return current;
    }
}
