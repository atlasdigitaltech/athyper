/**
 * Event Taxonomy Tests
 */
import { describe, it, expect } from "vitest";

import {
  AUDIT_EVENT_TAXONOMY,
  getTaxonomyEntry,
  getDefaultSeverity,
  validateAuditEvent,
  listEventTypes,
  listEventsByCategory,
  listPrivilegedEventTypes,
} from "../domain/event-taxonomy.js";

describe("Event Taxonomy", () => {
  it("should have entries for all expected event types", () => {
    const types = listEventTypes();
    expect(types.length).toBeGreaterThanOrEqual(30);
  });

  it("should have valid severity for every entry", () => {
    const validSeverities = ["info", "warning", "error", "critical"];
    for (const [type, entry] of Object.entries(AUDIT_EVENT_TAXONOMY)) {
      expect(validSeverities).toContain(entry.severity);
    }
  });

  it("should have valid category for every entry", () => {
    const validCategories = [
      "workflow",
      "step",
      "action",
      "admin",
      "sla",
      "entity",
      "error",
      "recovery",
    ];
    for (const [, entry] of Object.entries(AUDIT_EVENT_TAXONOMY)) {
      expect(validCategories).toContain(entry.category);
    }
  });

  it("should have requiredFields defined for every entry", () => {
    for (const [, entry] of Object.entries(AUDIT_EVENT_TAXONOMY)) {
      expect(Array.isArray(entry.requiredFields)).toBe(true);
      expect(entry.requiredFields.length).toBeGreaterThan(0);
    }
  });

  it("should have schemaVersion >= 1 for every entry", () => {
    for (const [, entry] of Object.entries(AUDIT_EVENT_TAXONOMY)) {
      expect(entry.schemaVersion).toBeGreaterThanOrEqual(1);
    }
  });

  describe("getTaxonomyEntry", () => {
    it("should return entry for known event type", () => {
      const entry = getTaxonomyEntry("workflow.created");
      expect(entry).toBeDefined();
      expect(entry?.category).toBe("workflow");
    });

    it("should return undefined for unknown event type", () => {
      const entry = getTaxonomyEntry("unknown.event" as any);
      expect(entry).toBeUndefined();
    });
  });

  describe("getDefaultSeverity", () => {
    it("should return correct severity for known types", () => {
      expect(getDefaultSeverity("workflow.created")).toBe("info");
      expect(getDefaultSeverity("admin.force_approve")).toBe("critical");
    });

    it("should return 'info' for unknown types", () => {
      expect(getDefaultSeverity("unknown.event" as any)).toBe("info");
    });
  });

  describe("validateAuditEvent", () => {
    it("should return empty array for valid event with all required fields", () => {
      const missing = validateAuditEvent("workflow.created", {
        instanceId: "inst-1",
        entity: { type: "PO", id: "po-1" },
        workflow: {
          templateId: "t1",
          templateCode: "WF1",
          templateVersion: 1,
          templateName: "Test",
        },
        actor: { userId: "u1" },
      });
      expect(missing).toHaveLength(0);
    });

    it("should return missing fields for event missing required fields", () => {
      const missing = validateAuditEvent("workflow.created", {
        // missing instanceId, entity, workflow, actor
      });
      expect(missing.length).toBeGreaterThan(0);
      expect(missing).toContain("instanceId");
    });

    it("should return empty array for unknown event types", () => {
      const missing = validateAuditEvent("unknown.event", {});
      expect(missing).toHaveLength(0);
    });
  });

  describe("listEventsByCategory", () => {
    it("should return events for workflow category", () => {
      const events = listEventsByCategory("workflow");
      expect(events.length).toBeGreaterThan(0);
      expect(events).toContain("workflow.created");
    });

    it("should return events for admin category", () => {
      const events = listEventsByCategory("admin");
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe("listPrivilegedEventTypes", () => {
    it("should return only privileged event types", () => {
      const privileged = listPrivilegedEventTypes();
      expect(privileged.length).toBeGreaterThan(0);
      for (const type of privileged) {
        const entry = getTaxonomyEntry(type);
        expect(entry?.privileged).toBe(true);
      }
    });

    it("should include admin events", () => {
      const privileged = listPrivilegedEventTypes();
      expect(privileged.some((t) => t.startsWith("admin."))).toBe(true);
    });
  });
});
