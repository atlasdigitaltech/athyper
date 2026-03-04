/**
 * Integration Flow — orchestration flow definition with typed steps.
 */

import type { RetryPolicy } from "./IntegrationEndpoint.js";

export const StepType = {
    HTTP_CALL: "HTTP_CALL",
    TRANSFORM: "TRANSFORM",
    CONDITION: "CONDITION",
    DELAY: "DELAY",
    PARALLEL: "PARALLEL",
} as const;
export type StepType = (typeof StepType)[keyof typeof StepType];

export const TriggerType = {
    MANUAL: "MANUAL",
    EVENT: "EVENT",
    SCHEDULE: "SCHEDULE",
    WEBHOOK: "WEBHOOK",
} as const;
export type TriggerType = (typeof TriggerType)[keyof typeof TriggerType];

export interface FlowStep {
    name: string;
    type: StepType;
    config: Record<string, unknown>;
    onError?: "stop" | "skip" | "retry";
    retryPolicy?: RetryPolicy;
}

export interface IntegrationFlow {
    id: string;
    tenantId: string;
    code: string;
    name: string;
    description: string | null;
    steps: FlowStep[];
    triggerType: TriggerType;
    triggerConfig: Record<string, unknown>;
    isActive: boolean;
    version: number;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
    updatedBy: string | null;
}

export interface CreateFlowInput {
    tenantId: string;
    code: string;
    name: string;
    description?: string;
    steps: FlowStep[];
    triggerType?: TriggerType;
    triggerConfig?: Record<string, unknown>;
    createdBy: string;
}

export interface UpdateFlowInput {
    name?: string;
    description?: string | null;
    steps?: FlowStep[];
    triggerType?: TriggerType;
    triggerConfig?: Record<string, unknown>;
    isActive?: boolean;
    updatedBy: string;
}
