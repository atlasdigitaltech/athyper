/**
 * Default Notification Templates — System-level seeds.
 *
 * Migrated from the existing DEFAULT_TEMPLATES in the workflow-engine
 * notification service, expanded to support multi-channel delivery.
 *
 * These are seeded into meta.notification_template with:
 * - tenant_id = NULL (system-level)
 * - status = "active"
 * - version = 1
 */

import type { CreateTemplateInput } from "../models/NotificationTemplate.js";

/**
 * Variable schemas for each template type.
 * Simple format: { "varName": "string" | "number" | "date" | "string?" }
 */
const TASK_ASSIGNED_VARS = {
    entityType: "string",
    entityDisplayName: "string",
    workflowName: "string",
    stepName: "string",
    requesterName: "string",
    dueDate: "string",
    taskUrl: "string?",
};

const SLA_WARNING_VARS = {
    entityType: "string",
    entityDisplayName: "string",
    dueDate: "string",
    timeRemaining: "string",
};

const SLA_BREACHED_VARS = {
    entityType: "string",
    entityDisplayName: "string",
    dueDate: "string",
    overdueBy: "string",
};

const TASK_ESCALATED_VARS = {
    entityType: "string",
    entityDisplayName: "string",
    escalationReason: "string",
    originalAssignee: "string",
    dueDate: "string",
};

const APPROVAL_COMPLETE_VARS = {
    entityType: "string",
    entityDisplayName: "string",
    outcome: "string",
    completedAt: "string",
};

const TASK_REMINDER_VARS = {
    reminderNumber: "number",
    entityType: "string",
    entityDisplayName: "string",
    dueDate: "string",
    timeRemaining: "string",
};

// ─── Template definitions ────────────────────────────────────────────

export const DEFAULT_TEMPLATES: CreateTemplateInput[] = [
    // ═══ task_assigned ═══
    {
        templateKey: "task_assigned",
        channel: "EMAIL",
        locale: "en",
        version: 1,
        status: "active",
        subject: "New approval task: {{entityDisplayName}}",
        bodyText:
            "You have a new approval task for {{entityType}} {{entityDisplayName}}.\n\n" +
            "Workflow: {{workflowName}}\n" +
            "Step: {{stepName}}\n" +
            "Requester: {{requesterName}}\n" +
            "Due: {{dueDate}}\n\n" +
            "Please review and take action.",
        bodyHtml: `<h2>New Approval Task</h2>
<p>You have a new approval task for <strong>{{entityType}}</strong> <strong>{{entityDisplayName}}</strong>.</p>
<table>
  <tr><td>Workflow:</td><td>{{workflowName}}</td></tr>
  <tr><td>Step:</td><td>{{stepName}}</td></tr>
  <tr><td>Requester:</td><td>{{requesterName}}</td></tr>
  <tr><td>Due:</td><td>{{dueDate}}</td></tr>
</table>
<p><a href="{{taskUrl}}">Review and take action</a></p>`,
        variablesSchema: TASK_ASSIGNED_VARS,
        createdBy: "system",
    },
    {
        templateKey: "task_assigned",
        channel: "IN_APP",
        locale: "en",
        version: 1,
        status: "active",
        subject: "New approval task",
        bodyText: "New approval task: {{entityDisplayName}} ({{stepName}})",
        variablesSchema: { entityDisplayName: "string", stepName: "string" },
        createdBy: "system",
    },
    {
        templateKey: "task_assigned",
        channel: "TEAMS",
        locale: "en",
        version: 1,
        status: "active",
        subject: "New approval task: {{entityDisplayName}}",
        bodyJson: {
            type: "AdaptiveCard",
            version: "1.4",
            body: [
                {
                    type: "TextBlock",
                    text: "New Approval Task",
                    weight: "bolder",
                    size: "medium",
                },
                {
                    type: "FactSet",
                    facts: [
                        { title: "Document", value: "{{entityType}} — {{entityDisplayName}}" },
                        { title: "Workflow", value: "{{workflowName}}" },
                        { title: "Step", value: "{{stepName}}" },
                        { title: "Requester", value: "{{requesterName}}" },
                        { title: "Due", value: "{{dueDate}}" },
                    ],
                },
            ],
            actions: [
                { type: "Action.OpenUrl", title: "Review", url: "{{taskUrl}}" },
            ],
        },
        variablesSchema: TASK_ASSIGNED_VARS,
        createdBy: "system",
    },

    // ═══ sla_warning ═══
    {
        templateKey: "sla_warning",
        channel: "EMAIL",
        locale: "en",
        version: 1,
        status: "active",
        subject: "SLA Warning: {{entityDisplayName}} approval due soon",
        bodyText:
            "The approval task for {{entityType}} {{entityDisplayName}} is approaching its SLA deadline.\n\n" +
            "Due: {{dueDate}}\n" +
            "Time remaining: {{timeRemaining}}\n\n" +
            "Please take action soon to avoid SLA breach.",
        variablesSchema: SLA_WARNING_VARS,
        createdBy: "system",
    },
    {
        templateKey: "sla_warning",
        channel: "IN_APP",
        locale: "en",
        version: 1,
        status: "active",
        subject: "SLA Warning",
        bodyText: "SLA Warning: {{entityDisplayName}} due in {{timeRemaining}}",
        variablesSchema: { entityDisplayName: "string", timeRemaining: "string" },
        createdBy: "system",
    },

    // ═══ sla_breached ═══
    {
        templateKey: "sla_breached",
        channel: "EMAIL",
        locale: "en",
        version: 1,
        status: "active",
        subject: "SLA Breached: {{entityDisplayName}} approval overdue",
        bodyText:
            "The approval task for {{entityType}} {{entityDisplayName}} has exceeded its SLA deadline.\n\n" +
            "Due date was: {{dueDate}}\n" +
            "Overdue by: {{overdueBy}}\n\n" +
            "Immediate action required.",
        variablesSchema: SLA_BREACHED_VARS,
        createdBy: "system",
    },
    {
        templateKey: "sla_breached",
        channel: "IN_APP",
        locale: "en",
        version: 1,
        status: "active",
        subject: "SLA Breached",
        bodyText: "SLA Breached: {{entityDisplayName}} overdue by {{overdueBy}}",
        variablesSchema: { entityDisplayName: "string", overdueBy: "string" },
        createdBy: "system",
    },

    // ═══ task_escalated ═══
    {
        templateKey: "task_escalated",
        channel: "EMAIL",
        locale: "en",
        version: 1,
        status: "active",
        subject: "Escalated approval task: {{entityDisplayName}}",
        bodyText:
            "An approval task has been escalated to you for {{entityType}} {{entityDisplayName}}.\n\n" +
            "Reason: {{escalationReason}}\n" +
            "Original assignee: {{originalAssignee}}\n" +
            "Due: {{dueDate}}\n\n" +
            "Please review and take action.",
        variablesSchema: TASK_ESCALATED_VARS,
        createdBy: "system",
    },
    {
        templateKey: "task_escalated",
        channel: "IN_APP",
        locale: "en",
        version: 1,
        status: "active",
        subject: "Task Escalated",
        bodyText: "Escalated: {{entityDisplayName}} (was: {{originalAssignee}})",
        variablesSchema: { entityDisplayName: "string", originalAssignee: "string" },
        createdBy: "system",
    },

    // ═══ approval_complete ═══
    {
        templateKey: "approval_complete",
        channel: "EMAIL",
        locale: "en",
        version: 1,
        status: "active",
        subject: "Approval {{outcome}}: {{entityDisplayName}}",
        bodyText:
            "The approval workflow for {{entityType}} {{entityDisplayName}} has been completed.\n\n" +
            "Outcome: {{outcome}}\n" +
            "Completed at: {{completedAt}}",
        variablesSchema: APPROVAL_COMPLETE_VARS,
        createdBy: "system",
    },
    {
        templateKey: "approval_complete",
        channel: "IN_APP",
        locale: "en",
        version: 1,
        status: "active",
        subject: "Approval {{outcome}}",
        bodyText: "{{outcome}}: {{entityDisplayName}}",
        variablesSchema: { outcome: "string", entityDisplayName: "string" },
        createdBy: "system",
    },

    // ═══ approval_rejected ═══
    {
        templateKey: "approval_rejected",
        channel: "EMAIL",
        locale: "en",
        version: 1,
        status: "active",
        subject: "Approval Rejected: {{entityDisplayName}}",
        bodyText:
            "The approval workflow for {{entityType}} {{entityDisplayName}} has been rejected.\n\n" +
            "Outcome: Rejected\n" +
            "Completed at: {{completedAt}}",
        variablesSchema: APPROVAL_COMPLETE_VARS,
        createdBy: "system",
    },

    // ═══ task_reminder ═══
    {
        templateKey: "task_reminder",
        channel: "EMAIL",
        locale: "en",
        version: 1,
        status: "active",
        subject: "Reminder: Approval pending for {{entityDisplayName}}",
        bodyText:
            "This is reminder #{{reminderNumber}} for your pending approval task.\n\n" +
            "{{entityType}}: {{entityDisplayName}}\n" +
            "Due: {{dueDate}}\n" +
            "Time remaining: {{timeRemaining}}\n\n" +
            "Please review and take action.",
        variablesSchema: TASK_REMINDER_VARS,
        createdBy: "system",
    },
];

/**
 * Default notification rules — system-level event routing.
 * These map workflow events to the templates above.
 */
export const DEFAULT_RULES = [
    {
        code: "workflow_task_assigned",
        name: "Task Assigned",
        eventType: "workflow.task.assigned",
        templateKey: "task_assigned",
        channels: ["EMAIL", "IN_APP", "TEAMS"],
        priority: "normal",
        recipientRules: [{ type: "expression", value: "payload.task.assigneeId" }],
    },
    {
        code: "workflow_sla_warning",
        name: "SLA Warning",
        eventType: "workflow.sla.warning",
        templateKey: "sla_warning",
        channels: ["EMAIL", "IN_APP"],
        priority: "high",
        recipientRules: [{ type: "expression", value: "payload.task.assigneeId" }],
    },
    {
        code: "workflow_sla_breached",
        name: "SLA Breached",
        eventType: "workflow.sla.breached",
        templateKey: "sla_breached",
        channels: ["EMAIL", "IN_APP"],
        priority: "high",
        recipientRules: [{ type: "expression", value: "payload.task.assigneeId" }],
    },
    {
        code: "workflow_task_escalated",
        name: "Task Escalated",
        eventType: "workflow.task.escalated",
        templateKey: "task_escalated",
        channels: ["EMAIL", "IN_APP"],
        priority: "high",
        recipientRules: [{ type: "expression", value: "payload.escalatedToId" }],
    },
    {
        code: "workflow_approval_complete",
        name: "Approval Complete",
        eventType: "workflow.approval.completed",
        templateKey: "approval_complete",
        channels: ["EMAIL"],
        priority: "normal",
        recipientRules: [{ type: "expression", value: "payload.requesterId" }],
    },
    {
        code: "workflow_task_reminder",
        name: "Task Reminder",
        eventType: "workflow.task.reminder",
        templateKey: "task_reminder",
        channels: ["EMAIL"],
        priority: "normal",
        recipientRules: [{ type: "expression", value: "payload.task.assigneeId" }],
        dedupWindowMs: 3600000, // 1 hour — don't spam reminders
    },
] as const;
