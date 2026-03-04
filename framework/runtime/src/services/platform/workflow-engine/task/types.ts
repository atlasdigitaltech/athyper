/**
 * Approval Task Management Types
 *
 * Types for managing approval tasks, inbox/work queues, and notifications.
 */

import type {
  ApprovalInstance,
  ApprovalStepInstance,
} from "../instance/types.js";
import type {
  ApprovalActionType,
} from "../types.js";

// ============================================================================
// 3.1 Task Creation
// ============================================================================

/**
 * Task status
 */
export type ApprovalTaskStatus =
  | "pending" // Awaiting action
  | "in_progress" // Being worked on
  | "completed" // Action taken
  | "delegated" // Delegated to another user
  | "escalated" // Escalated
  | "expired" // SLA expired
  | "cancelled"; // Cancelled with instance

/**
 * Task priority
 */
export type TaskPriority = "low" | "normal" | "high" | "urgent";

/**
 * Task type
 */
export type TaskType =
  | "approval" // Standard approval task
  | "review" // Review only (no decision)
  | "information" // FYI notification
  | "delegation" // Delegated task
  | "escalation"; // Escalated task

/**
 * Approval task - a unit of work for an approver
 */
export interface ApprovalTask {
  /** Unique task identifier */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Organization unit */
  orgId?: string;

  /** Related approval instance ID */
  instanceId: string;

  /** Related step instance ID */
  stepInstanceId: string;

  /** Approver assignment ID (from step instance) */
  assignmentId: string;

  /** Task type */
  type: TaskType;

  /** Task status */
  status: ApprovalTaskStatus;

  /** Task priority */
  priority: TaskPriority;

  /** Assigned user ID (task owner) */
  assigneeId: string;

  /** Assignee display name */
  assigneeDisplayName?: string;

  /** Assignee email */
  assigneeEmail?: string;

  /** Task title/subject */
  title: string;

  /** Task description */
  description?: string;

  /** Entity information for display */
  entity: {
    type: string;
    id: string;
    referenceCode?: string;
    displayName?: string;
  };

  /** Workflow information */
  workflow: {
    templateCode: string;
    templateName: string;
    stepName: string;
    stepLevel: number;
  };

  /** Requester information */
  requester: {
    userId: string;
    displayName?: string;
    email?: string;
  };

  /** Available actions for this task */
  availableActions: ApprovalActionType[];

  /** SLA tracking */
  sla: {
    /** Due date/time */
    dueAt: Date;
    /** Warning threshold date */
    warningAt?: Date;
    /** Is overdue */
    isOverdue: boolean;
    /** Time remaining in milliseconds (negative if overdue) */
    timeRemainingMs: number;
    /** SLA status */
    slaStatus: "on_track" | "warning" | "breached";
  };

  /** Delegation information (if delegated) */
  delegation?: {
    originalAssigneeId: string;
    originalAssigneeDisplayName?: string;
    delegatedBy: string;
    delegatedAt: Date;
    reason?: string;
  };

  /** Escalation information (if escalated) */
  escalation?: {
    escalatedFrom?: string;
    escalationLevel: number;
    escalatedAt: Date;
    reason?: string;
  };

  /** Read status */
  isRead: boolean;
  readAt?: Date;

  /** Timestamps */
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
}

// ============================================================================
// 3.2 Inbox & Work Queue
// ============================================================================

/**
 * Inbox filter options
 */
export interface InboxFilterOptions {
  /** Filter by status */
  status?: ApprovalTaskStatus | ApprovalTaskStatus[];

  /** Filter by priority */
  priority?: TaskPriority | TaskPriority[];

  /** Filter by task type */
  type?: TaskType | TaskType[];

  /** Filter by entity type */
  entityType?: string;

  /** Filter by workflow template code */
  templateCode?: string;

  /** Filter by requester */
  requesterId?: string;

  /** Filter overdue only */
  overdueOnly?: boolean;

  /** Filter by SLA status */
  slaStatus?: "on_track" | "warning" | "breached";

  /** Filter unread only */
  unreadOnly?: boolean;

  /** Filter by date range */
  createdAfter?: Date;
  createdBefore?: Date;
  dueAfter?: Date;
  dueBefore?: Date;

  /** Search by title/description */
  search?: string;

  /** Pagination */
  limit?: number;
  offset?: number;

  /** Sort options */
  sortBy?: "createdAt" | "dueAt" | "priority" | "status" | "title";
  sortDirection?: "asc" | "desc";
}

/**
 * Inbox summary for quick overview
 */
export interface InboxSummary {
  /** Total pending tasks */
  totalPending: number;

  /** Count by status */
  byStatus: Record<ApprovalTaskStatus, number>;

  /** Count by priority */
  byPriority: Record<TaskPriority, number>;

  /** Overdue count */
  overdueCount: number;

  /** Warning (approaching SLA) count */
  warningCount: number;

  /** Unread count */
  unreadCount: number;

  /** Today's due count */
  dueToday: number;

  /** This week's due count */
  dueThisWeek: number;
}

/**
 * Work queue item with computed fields
 */
export interface WorkQueueItem extends ApprovalTask {
  /** Computed urgency score (higher = more urgent) */
  urgencyScore: number;

  /** Age in hours */
  ageHours: number;

  /** Time until due in hours (negative if overdue) */
  hoursUntilDue: number;
}

/**
 * Work queue configuration
 */
export interface WorkQueueConfig {
  /** Maximum items to fetch */
  maxItems: number;

  /** Include delegated tasks */
  includeDelegated: boolean;

  /** Include escalated tasks */
  includeEscalated: boolean;

  /** Urgency weight factors */
  urgencyWeights: {
    overdue: number;
    warning: number;
    highPriority: number;
    urgent: number;
    delegated: number;
    escalated: number;
  };
}

/**
 * Default work queue configuration
 */
export const DEFAULT_WORK_QUEUE_CONFIG: WorkQueueConfig = {
  maxItems: 50,
  includeDelegated: true,
  includeEscalated: true,
  urgencyWeights: {
    overdue: 100,
    warning: 50,
    highPriority: 30,
    urgent: 60,
    delegated: 20,
    escalated: 40,
  },
};

// ============================================================================
// 3.3 Notifications
// ============================================================================

/**
 * Notification channel
 */
export type NotificationChannel = "email" | "in_app" | "push" | "sms" | "webhook";

/**
 * Notification type
 */
export type NotificationType =
  | "task_assigned" // New task assigned
  | "task_reminder" // SLA reminder
  | "task_escalated" // Task escalated
  | "task_delegated" // Task delegated to you
  | "task_completed" // Task completed by someone
  | "task_cancelled" // Task cancelled
  | "sla_warning" // SLA breach warning
  | "sla_breached" // SLA breached
  | "approval_complete" // Entire approval completed
  | "approval_rejected" // Approval rejected
  | "changes_requested" // Changes requested
  | "comment_added"; // Comment added

/**
 * Notification priority
 */
export type NotificationPriority = "low" | "normal" | "high";

/**
 * Notification status
 */
export type NotificationStatus =
  | "pending" // Not yet sent
  | "sent" // Sent successfully
  | "delivered" // Delivered to recipient
  | "read" // Read by recipient
  | "failed" // Failed to send
  | "cancelled"; // Cancelled

/**
 * Notification recipient
 */
export interface NotificationRecipient {
  /** User ID */
  userId: string;

  /** Display name */
  displayName?: string;

  /** Email address */
  email?: string;

  /** Phone number (for SMS) */
  phone?: string;

  /** Push notification token */
  pushToken?: string;

  /** Preferred channels */
  preferredChannels?: NotificationChannel[];
}

/**
 * Notification template
 */
export interface NotificationTemplate {
  /** Template ID */
  id: string;

  /** Template code */
  code: string;

  /** Notification type this template is for */
  type: NotificationType;

  /** Channel */
  channel: NotificationChannel;

  /** Subject template (for email) */
  subject?: string;

  /** Body template */
  body: string;

  /** HTML body template (for email) */
  htmlBody?: string;

  /** Template variables */
  variables: string[];

  /** Is active */
  active: boolean;

  /** Locale */
  locale: string;
}

/**
 * Notification record
 */
export interface NotificationRecord {
  /** Notification ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Notification type */
  type: NotificationType;

  /** Channel used */
  channel: NotificationChannel;

  /** Priority */
  priority: NotificationPriority;

  /** Status */
  status: NotificationStatus;

  /** Recipient user ID */
  recipientId: string;

  /** Recipient email/phone (for audit) */
  recipientAddress?: string;

  /** Related task ID */
  taskId?: string;

  /** Related instance ID */
  instanceId?: string;

  /** Subject */
  subject?: string;

  /** Body content */
  body: string;

  /** Rendered HTML (for email) */
  htmlBody?: string;

  /** Template used */
  templateCode?: string;

  /** Variables used for rendering */
  variables?: Record<string, unknown>;

  /** Delivery attempts */
  attempts: number;

  /** Last attempt error */
  lastError?: string;

  /** Scheduled time */
  scheduledAt?: Date;

  /** Sent time */
  sentAt?: Date;

  /** Delivered time */
  deliveredAt?: Date;

  /** Read time */
  readAt?: Date;

  /** Created time */
  createdAt: Date;
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
  /** User ID */
  userId: string;

  /** Tenant ID */
  tenantId: string;

  /** Global enabled */
  enabled: boolean;

  /** Enabled channels */
  enabledChannels: NotificationChannel[];

  /** Per-type preferences */
  typePreferences: {
    [K in NotificationType]?: {
      enabled: boolean;
      channels: NotificationChannel[];
    };
  };

  /** Quiet hours */
  quietHours?: {
    enabled: boolean;
    startHour: number;
    endHour: number;
    timezone: string;
  };

  /** Email digest */
  emailDigest?: {
    enabled: boolean;
    frequency: "daily" | "weekly";
    dayOfWeek?: number; // For weekly
    hourOfDay: number;
  };
}

/**
 * Reminder schedule
 */
export interface ReminderSchedule {
  /** Schedule ID */
  id: string;

  /** Task ID */
  taskId: string;

  /** Instance ID */
  instanceId: string;

  /** Reminder number (1st, 2nd, etc.) */
  reminderNumber: number;

  /** Scheduled time */
  scheduledAt: Date;

  /** Status */
  status: "pending" | "sent" | "cancelled";

  /** Sent time */
  sentAt?: Date;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Task repository interface
 */
export interface IApprovalTaskRepository {
  // Task CRUD
  getById(tenantId: string, taskId: string): Promise<ApprovalTask | undefined>;
  getByAssignmentId(tenantId: string, assignmentId: string): Promise<ApprovalTask | undefined>;
  list(tenantId: string, assigneeId: string, options?: InboxFilterOptions): Promise<ApprovalTask[]>;
  create(tenantId: string, task: Omit<ApprovalTask, "id" | "createdAt">): Promise<ApprovalTask>;
  update(tenantId: string, taskId: string, updates: Partial<ApprovalTask>): Promise<ApprovalTask>;
  delete(tenantId: string, taskId: string): Promise<void>;

  // Bulk operations
  createBulk(tenantId: string, tasks: Omit<ApprovalTask, "id" | "createdAt">[]): Promise<ApprovalTask[]>;
  updateByInstanceId(tenantId: string, instanceId: string, updates: Partial<ApprovalTask>): Promise<void>;
  deleteByInstanceId(tenantId: string, instanceId: string): Promise<void>;

  // Queries
  getTasksForInstance(tenantId: string, instanceId: string): Promise<ApprovalTask[]>;
  getTasksForStep(tenantId: string, stepInstanceId: string): Promise<ApprovalTask[]>;
  getOverdueTasks(tenantId: string): Promise<ApprovalTask[]>;
  getTasksDueSoon(tenantId: string, withinHours: number): Promise<ApprovalTask[]>;

  // Summary
  getInboxSummary(tenantId: string, assigneeId: string): Promise<InboxSummary>;
  countByAssignee(tenantId: string, assigneeId: string, status?: ApprovalTaskStatus): Promise<number>;
}

/**
 * Notification service interface
 */
export interface INotificationService {
  // Send notifications
  sendTaskAssigned(tenantId: string, task: ApprovalTask): Promise<void>;
  sendReminder(tenantId: string, task: ApprovalTask, reminderNumber: number): Promise<void>;
  sendSlaWarning(tenantId: string, task: ApprovalTask): Promise<void>;
  sendSlaBreach(tenantId: string, task: ApprovalTask): Promise<void>;
  sendEscalation(tenantId: string, task: ApprovalTask, escalatedTo: NotificationRecipient): Promise<void>;
  sendApprovalComplete(tenantId: string, instance: ApprovalInstance, outcome: "approved" | "rejected"): Promise<void>;

  // Bulk notifications
  sendBulkReminders(tenantId: string, tasks: ApprovalTask[]): Promise<void>;

  // Notification management
  getNotifications(tenantId: string, userId: string, options?: {
    unreadOnly?: boolean;
    type?: NotificationType;
    limit?: number;
    offset?: number;
  }): Promise<NotificationRecord[]>;
  markAsRead(tenantId: string, notificationId: string): Promise<void>;
  markAllAsRead(tenantId: string, userId: string): Promise<void>;

  // Preferences
  getPreferences(tenantId: string, userId: string): Promise<NotificationPreferences | undefined>;
  updatePreferences(tenantId: string, userId: string, preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences>;

  // Templates
  getTemplate(tenantId: string, type: NotificationType, channel: NotificationChannel, locale?: string): Promise<NotificationTemplate | undefined>;
}

/**
 * Task service interface
 */
export interface IApprovalTaskService {
  // Task creation (called when step is activated)
  createTasksForStep(
    tenantId: string,
    instance: ApprovalInstance,
    stepInstance: ApprovalStepInstance
  ): Promise<ApprovalTask[]>;

  // Inbox operations
  getInbox(tenantId: string, userId: string, options?: InboxFilterOptions): Promise<ApprovalTask[]>;
  getInboxSummary(tenantId: string, userId: string): Promise<InboxSummary>;
  getWorkQueue(tenantId: string, userId: string, config?: Partial<WorkQueueConfig>): Promise<WorkQueueItem[]>;

  // Task operations
  getTask(tenantId: string, taskId: string): Promise<ApprovalTask | undefined>;
  markAsRead(tenantId: string, taskId: string): Promise<ApprovalTask>;
  markAllAsRead(tenantId: string, userId: string): Promise<void>;

  // Task completion (called when action is taken)
  completeTask(
    tenantId: string,
    taskId: string,
    action: ApprovalActionType,
    userId: string
  ): Promise<ApprovalTask>;

  // Task delegation
  delegateTask(
    tenantId: string,
    taskId: string,
    delegateTo: string,
    delegatedBy: string,
    reason?: string
  ): Promise<ApprovalTask>;

  // Task cancellation
  cancelTasksForInstance(tenantId: string, instanceId: string): Promise<void>;

  // SLA management
  processOverdueTasks(tenantId: string): Promise<void>;
  scheduleReminders(tenantId: string, task: ApprovalTask): Promise<ReminderSchedule[]>;

  // Admin operations
  getTasksForInstance(tenantId: string, instanceId: string): Promise<ApprovalTask[]>;
  reassignTask(tenantId: string, taskId: string, newAssigneeId: string, reassignedBy: string): Promise<ApprovalTask>;
}

/**
 * Notification sender interface (for different channels)
 */
export interface INotificationSender {
  channel: NotificationChannel;
  send(notification: NotificationRecord, recipient: NotificationRecipient): Promise<{ success: boolean; error?: string }>;
}
