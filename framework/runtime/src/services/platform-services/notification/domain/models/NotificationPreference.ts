/**
 * NotificationPreference — User/Org/Unit notification preferences.
 *
 * MVP uses the existing ui.notification_preference table (scope = user).
 * Phase 2 adds core.notification_preference with scope hierarchy.
 */

import type {
    ChannelCode,
    PreferenceFrequency,
    QuietHours,
} from "../types.js";

export interface NotificationPreference {
    id: string;
    tenantId: string;
    principalId: string;
    eventCode: string;
    channel: ChannelCode;
    isEnabled: boolean;
    frequency: PreferenceFrequency;
    quietHours: QuietHours | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
    updatedBy: string | null;
}

export interface UpsertPreferenceInput {
    tenantId: string;
    principalId: string;
    eventCode: string;
    channel: ChannelCode;
    isEnabled: boolean;
    frequency?: PreferenceFrequency;
    quietHours?: QuietHours;
    metadata?: Record<string, unknown>;
    createdBy: string;
}
