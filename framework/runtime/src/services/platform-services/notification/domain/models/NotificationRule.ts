/**
 * NotificationRule — Event-to-recipient routing rules.
 *
 * Rules define how domain events map to notification plans:
 * which recipients, which channels, which template, what priority.
 */

import type {
    RuleId,
    ChannelCode,
    NotificationPriority,
    RecipientRule,
} from "../types.js";

export interface NotificationRule {
    id: RuleId;
    tenantId: string | null;
    code: string;
    name: string;
    description: string | null;
    eventType: string;
    entityType: string | null;
    lifecycleState: string | null;
    conditionExpr: Record<string, unknown> | null;
    templateKey: string;
    channels: ChannelCode[];
    priority: NotificationPriority;
    recipientRules: RecipientRule[];
    slaMinutes: number | null;
    dedupWindowMs: number;
    isEnabled: boolean;
    sortOrder: number;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
    updatedBy: string | null;
}

export interface CreateRuleInput {
    tenantId?: string;
    code: string;
    name: string;
    description?: string;
    eventType: string;
    entityType?: string;
    lifecycleState?: string;
    conditionExpr?: Record<string, unknown>;
    templateKey: string;
    channels: ChannelCode[];
    priority?: NotificationPriority;
    recipientRules: RecipientRule[];
    slaMinutes?: number;
    dedupWindowMs?: number;
    sortOrder?: number;
    createdBy: string;
}

export interface UpdateRuleInput {
    name?: string;
    description?: string;
    eventType?: string;
    entityType?: string;
    lifecycleState?: string;
    conditionExpr?: Record<string, unknown>;
    templateKey?: string;
    channels?: ChannelCode[];
    priority?: NotificationPriority;
    recipientRules?: RecipientRule[];
    slaMinutes?: number;
    dedupWindowMs?: number;
    isEnabled?: boolean;
    sortOrder?: number;
    updatedBy: string;
}
