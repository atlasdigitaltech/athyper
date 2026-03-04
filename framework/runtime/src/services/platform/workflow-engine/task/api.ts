/**
 * Approval Task API
 *
 * REST API endpoints for task management, inbox operations, and notifications.
 */

import type {
  ApprovalTask,
  ApprovalTaskStatus,
  IApprovalTaskService,
  InboxFilterOptions,
  InboxSummary,
  INotificationService,
  NotificationPreferences,
  NotificationRecord,
  TaskPriority,
  TaskType,
  WorkQueueConfig,
  WorkQueueItem,
} from "./types.js";
import type { ApprovalActionType } from "../types.js";

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Get inbox request
 */
export interface GetInboxRequest {
  tenantId: string;
  userId: string;
  status?: ApprovalTaskStatus | ApprovalTaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  type?: TaskType | TaskType[];
  entityType?: string;
  templateCode?: string;
  requesterId?: string;
  overdueOnly?: boolean;
  slaStatus?: "on_track" | "warning" | "breached";
  unreadOnly?: boolean;
  createdAfter?: string; // ISO date string
  createdBefore?: string;
  dueAfter?: string;
  dueBefore?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "createdAt" | "dueAt" | "priority" | "status" | "title";
  sortDirection?: "asc" | "desc";
}

/**
 * Get inbox response
 */
export interface GetInboxResponse {
  success: boolean;
  data: {
    tasks: ApprovalTask[];
    total: number;
    limit: number;
    offset: number;
  };
}

/**
 * Get inbox summary response
 */
export interface GetInboxSummaryResponse {
  success: boolean;
  data: InboxSummary;
}

/**
 * Get work queue request
 */
export interface GetWorkQueueRequest {
  tenantId: string;
  userId: string;
  maxItems?: number;
  includeDelegated?: boolean;
  includeEscalated?: boolean;
}

/**
 * Get work queue response
 */
export interface GetWorkQueueResponse {
  success: boolean;
  data: {
    items: WorkQueueItem[];
    config: WorkQueueConfig;
  };
}

/**
 * Get task response
 */
export interface GetTaskResponse {
  success: boolean;
  data: ApprovalTask;
}

/**
 * Mark task read response
 */
export interface MarkTaskReadResponse {
  success: boolean;
  data: ApprovalTask;
}

/**
 * Complete task request
 */
export interface CompleteTaskRequest {
  tenantId: string;
  taskId: string;
  action: ApprovalActionType;
  userId: string;
  comment?: string;
}

/**
 * Complete task response
 */
export interface CompleteTaskResponse {
  success: boolean;
  data: ApprovalTask;
}

/**
 * Delegate task request
 */
export interface DelegateTaskRequest {
  tenantId: string;
  taskId: string;
  delegateTo: string;
  delegatedBy: string;
  reason?: string;
}

/**
 * Delegate task response
 */
export interface DelegateTaskResponse {
  success: boolean;
  data: ApprovalTask;
}

/**
 * Reassign task request
 */
export interface ReassignTaskRequest {
  tenantId: string;
  taskId: string;
  newAssigneeId: string;
  reassignedBy: string;
}

/**
 * Reassign task response
 */
export interface ReassignTaskResponse {
  success: boolean;
  data: ApprovalTask;
}

/**
 * Get notifications request
 */
export interface GetNotificationsRequest {
  tenantId: string;
  userId: string;
  unreadOnly?: boolean;
  type?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get notifications response
 */
export interface GetNotificationsResponse {
  success: boolean;
  data: {
    notifications: NotificationRecord[];
    total: number;
  };
}

/**
 * Get notification preferences response
 */
export interface GetPreferencesResponse {
  success: boolean;
  data: NotificationPreferences;
}

/**
 * Update notification preferences request
 */
export interface UpdatePreferencesRequest {
  tenantId: string;
  userId: string;
  preferences: Partial<NotificationPreferences>;
}

/**
 * Update notification preferences response
 */
export interface UpdatePreferencesResponse {
  success: boolean;
  data: NotificationPreferences;
}

/**
 * Route definition
 */
export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  handler: string;
  description: string;
  auth?: boolean;
}

// ============================================================================
// API Controller
// ============================================================================

/**
 * Approval Task API Controller
 */
export class ApprovalTaskApiController {
  constructor(
    private readonly taskService: IApprovalTaskService,
    private readonly notificationService: INotificationService
  ) {}

  /**
   * Get user's inbox
   */
  async getInbox(request: GetInboxRequest): Promise<GetInboxResponse> {
    const filterOptions: InboxFilterOptions = {
      status: request.status,
      priority: request.priority,
      type: request.type,
      entityType: request.entityType,
      templateCode: request.templateCode,
      requesterId: request.requesterId,
      overdueOnly: request.overdueOnly,
      slaStatus: request.slaStatus,
      unreadOnly: request.unreadOnly,
      createdAfter: request.createdAfter ? new Date(request.createdAfter) : undefined,
      createdBefore: request.createdBefore ? new Date(request.createdBefore) : undefined,
      dueAfter: request.dueAfter ? new Date(request.dueAfter) : undefined,
      dueBefore: request.dueBefore ? new Date(request.dueBefore) : undefined,
      search: request.search,
      limit: request.limit || 50,
      offset: request.offset || 0,
      sortBy: request.sortBy,
      sortDirection: request.sortDirection,
    };

    const tasks = await this.taskService.getInbox(
      request.tenantId,
      request.userId,
      filterOptions
    );

    return {
      success: true,
      data: {
        tasks,
        total: tasks.length, // In production, use separate count query
        limit: filterOptions.limit!,
        offset: filterOptions.offset!,
      },
    };
  }

  /**
   * Get inbox summary
   */
  async getInboxSummary(
    tenantId: string,
    userId: string
  ): Promise<GetInboxSummaryResponse> {
    const summary = await this.taskService.getInboxSummary(tenantId, userId);

    return {
      success: true,
      data: summary,
    };
  }

  /**
   * Get work queue (prioritized task list)
   */
  async getWorkQueue(request: GetWorkQueueRequest): Promise<GetWorkQueueResponse> {
    const config: Partial<WorkQueueConfig> = {
      maxItems: request.maxItems,
      includeDelegated: request.includeDelegated,
      includeEscalated: request.includeEscalated,
    };

    const items = await this.taskService.getWorkQueue(
      request.tenantId,
      request.userId,
      config
    );

    return {
      success: true,
      data: {
        items,
        config: {
          maxItems: request.maxItems || 50,
          includeDelegated: request.includeDelegated ?? true,
          includeEscalated: request.includeEscalated ?? true,
          urgencyWeights: {
            overdue: 100,
            warning: 50,
            highPriority: 30,
            urgent: 60,
            delegated: 20,
            escalated: 40,
          },
        },
      },
    };
  }

  /**
   * Get single task
   */
  async getTask(tenantId: string, taskId: string): Promise<GetTaskResponse> {
    const task = await this.taskService.getTask(tenantId, taskId);

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return {
      success: true,
      data: task,
    };
  }

  /**
   * Mark task as read
   */
  async markTaskAsRead(tenantId: string, taskId: string): Promise<MarkTaskReadResponse> {
    const task = await this.taskService.markAsRead(tenantId, taskId);

    return {
      success: true,
      data: task,
    };
  }

  /**
   * Mark all tasks as read
   */
  async markAllTasksAsRead(
    tenantId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    await this.taskService.markAllAsRead(tenantId, userId);

    return { success: true };
  }

  /**
   * Complete task (take action)
   */
  async completeTask(request: CompleteTaskRequest): Promise<CompleteTaskResponse> {
    const task = await this.taskService.completeTask(
      request.tenantId,
      request.taskId,
      request.action,
      request.userId
    );

    return {
      success: true,
      data: task,
    };
  }

  /**
   * Delegate task
   */
  async delegateTask(request: DelegateTaskRequest): Promise<DelegateTaskResponse> {
    const task = await this.taskService.delegateTask(
      request.tenantId,
      request.taskId,
      request.delegateTo,
      request.delegatedBy,
      request.reason
    );

    return {
      success: true,
      data: task,
    };
  }

  /**
   * Reassign task (admin)
   */
  async reassignTask(request: ReassignTaskRequest): Promise<ReassignTaskResponse> {
    const task = await this.taskService.reassignTask(
      request.tenantId,
      request.taskId,
      request.newAssigneeId,
      request.reassignedBy
    );

    return {
      success: true,
      data: task,
    };
  }

  /**
   * Get tasks for instance (admin)
   */
  async getTasksForInstance(
    tenantId: string,
    instanceId: string
  ): Promise<{ success: boolean; data: ApprovalTask[] }> {
    const tasks = await this.taskService.getTasksForInstance(tenantId, instanceId);

    return {
      success: true,
      data: tasks,
    };
  }

  /**
   * Get user notifications
   */
  async getNotifications(
    request: GetNotificationsRequest
  ): Promise<GetNotificationsResponse> {
    const notifications = await this.notificationService.getNotifications(
      request.tenantId,
      request.userId,
      {
        unreadOnly: request.unreadOnly,
        type: request.type as any,
        limit: request.limit,
        offset: request.offset,
      }
    );

    return {
      success: true,
      data: {
        notifications,
        total: notifications.length,
      },
    };
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(
    tenantId: string,
    notificationId: string
  ): Promise<{ success: boolean }> {
    await this.notificationService.markAsRead(tenantId, notificationId);

    return { success: true };
  }

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsAsRead(
    tenantId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    await this.notificationService.markAllAsRead(tenantId, userId);

    return { success: true };
  }

  /**
   * Get notification preferences
   */
  async getNotificationPreferences(
    tenantId: string,
    userId: string
  ): Promise<GetPreferencesResponse> {
    const prefs = await this.notificationService.getPreferences(tenantId, userId);

    if (!prefs) {
      throw new Error("Preferences not found");
    }

    return {
      success: true,
      data: prefs,
    };
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    request: UpdatePreferencesRequest
  ): Promise<UpdatePreferencesResponse> {
    const prefs = await this.notificationService.updatePreferences(
      request.tenantId,
      request.userId,
      request.preferences
    );

    return {
      success: true,
      data: prefs,
    };
  }
}

// ============================================================================
// Route Definitions
// ============================================================================

/**
 * Get approval task routes
 */
export function getApprovalTaskRoutes(): RouteDefinition[] {
  return [
    // Inbox routes
    {
      method: "GET",
      path: "/api/approval/inbox",
      handler: "getInbox",
      description: "Get user's approval inbox with filtering",
      auth: true,
    },
    {
      method: "GET",
      path: "/api/approval/inbox/summary",
      handler: "getInboxSummary",
      description: "Get inbox summary (counts by status, priority, etc.)",
      auth: true,
    },
    {
      method: "GET",
      path: "/api/approval/inbox/work-queue",
      handler: "getWorkQueue",
      description: "Get prioritized work queue",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/inbox/mark-all-read",
      handler: "markAllTasksAsRead",
      description: "Mark all inbox tasks as read",
      auth: true,
    },

    // Task routes
    {
      method: "GET",
      path: "/api/approval/tasks/:taskId",
      handler: "getTask",
      description: "Get single task by ID",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/tasks/:taskId/read",
      handler: "markTaskAsRead",
      description: "Mark task as read",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/tasks/:taskId/complete",
      handler: "completeTask",
      description: "Complete task (take action)",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/tasks/:taskId/delegate",
      handler: "delegateTask",
      description: "Delegate task to another user",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/tasks/:taskId/reassign",
      handler: "reassignTask",
      description: "Reassign task (admin)",
      auth: true,
    },

    // Instance task routes (admin)
    {
      method: "GET",
      path: "/api/approval/instances/:instanceId/tasks",
      handler: "getTasksForInstance",
      description: "Get all tasks for an instance",
      auth: true,
    },

    // Notification routes
    {
      method: "GET",
      path: "/api/approval/notifications",
      handler: "getNotifications",
      description: "Get user's notifications",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/notifications/:notificationId/read",
      handler: "markNotificationAsRead",
      description: "Mark notification as read",
      auth: true,
    },
    {
      method: "POST",
      path: "/api/approval/notifications/mark-all-read",
      handler: "markAllNotificationsAsRead",
      description: "Mark all notifications as read",
      auth: true,
    },

    // Preferences routes
    {
      method: "GET",
      path: "/api/approval/notifications/preferences",
      handler: "getNotificationPreferences",
      description: "Get notification preferences",
      auth: true,
    },
    {
      method: "PUT",
      path: "/api/approval/notifications/preferences",
      handler: "updateNotificationPreferences",
      description: "Update notification preferences",
      auth: true,
    },
  ];
}

/**
 * Factory function to create API controller
 */
export function createApprovalTaskApiController(
  taskService: IApprovalTaskService,
  notificationService: INotificationService
): ApprovalTaskApiController {
  return new ApprovalTaskApiController(taskService, notificationService);
}
