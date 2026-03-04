/**
 * Collaboration Timeline Service
 *
 * Thin wrapper around ActivityTimelineService to expose it via REST API.
 * Reuses the existing unified activity timeline that merges events from:
 * - Workflow audit events
 * - Permission decision logs
 * - Field access logs
 * - Security events
 * - Generic CRUD audit logs
 */

import type { TimelineQuery, ActivityTimelineEntry } from "../types.js";

export interface IActivityTimelineService {
  query(params: {
    tenantId: string;
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<ActivityTimelineEntry[]>;
}

export class CollabTimelineService {
  constructor(private readonly activityTimelineService: IActivityTimelineService) {}

  async getTimeline(params: TimelineQuery): Promise<ActivityTimelineEntry[]> {
    return this.activityTimelineService.query({
      tenantId: params.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      actorUserId: params.actorUserId,
      startDate: params.startDate,
      endDate: params.endDate,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
    });
  }
}
