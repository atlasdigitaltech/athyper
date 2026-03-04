/**
 * Content Audit Event Types
 *
 * These events are emitted during content operations and stored
 * in the audit log for compliance and troubleshooting.
 */

export const ContentAuditEvent = {
  // Upload events
  UPLOAD_INITIATED: "content.upload_initiated",
  UPLOAD_COMPLETED: "content.upload_completed",
  UPLOAD_FAILED: "content.upload_failed",

  // File operations
  FILE_DOWNLOADED: "content.file_downloaded",
  FILE_DELETED: "content.file_deleted",

  // Versioning events
  VERSION_CREATED: "content.version_created",
  VERSION_RESTORED: "content.version_restored",

  // Entity linking events
  LINK_CREATED: "content.link_created",
  LINK_REMOVED: "content.link_removed",

  // Permission events
  PERMISSION_DENIED: "content.permission_denied",
  PERMISSION_GRANTED: "content.permission_granted",
} as const;

export type ContentAuditEventType = typeof ContentAuditEvent[keyof typeof ContentAuditEvent];
