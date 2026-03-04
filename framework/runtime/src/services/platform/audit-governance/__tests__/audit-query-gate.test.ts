/**
 * Audit Query Policy Gate Tests
 */
import { describe, it, expect } from "vitest";

import {
  AuditQueryPolicyGate,
  type AuditCaller,
  type AuditAccessRole,
} from "../domain/audit-query-gate.js";

import type { AuditEvent, AuditEventQueryOptions } from "../../workflow-engine/audit/types.js";

function makeCaller(roles: AuditAccessRole[], userId = "user-1"): AuditCaller {
  return { userId, tenantId: "t-1", roles };
}

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "e-1",
    tenantId: "t-1",
    eventType: "workflow.created",
    severity: "info",
    instanceId: "inst-1",
    entity: { type: "PO", id: "po-1", referenceCode: "PO-001", displayName: "Test PO" },
    workflow: { templateId: "t1", templateCode: "WF1", templateVersion: 1, templateName: "Test" },
    actor: { userId: "u-1", displayName: "Test User" },
    timestamp: new Date(),
    ipAddress: "192.168.1.1",
    userAgent: "Mozilla/5.0",
    ...overrides,
  } as AuditEvent;
}

describe("AuditQueryPolicyGate", () => {
  const gate = new AuditQueryPolicyGate();

  describe("authorize", () => {
    it("should allow security_admin with full access", () => {
      const permission = gate.authorize(
        makeCaller(["security_admin"]),
        {} as AuditEventQueryOptions,
      );
      expect(permission.allowed).toBe(true);
      expect(permission.redactedFields).toHaveLength(0);
      expect(permission.enforcedFilters).toEqual({});
    });

    it("should allow view_tenant_events but redact PII fields", () => {
      const permission = gate.authorize(
        makeCaller(["view_tenant_events"]),
        {} as AuditEventQueryOptions,
      );
      expect(permission.allowed).toBe(true);
      expect(permission.redactedFields).toContain("ip_address");
      expect(permission.redactedFields).toContain("user_agent");
    });

    it("should allow view_own_events with enforced actorUserId filter", () => {
      const permission = gate.authorize(
        makeCaller(["view_own_events"], "user-42"),
        {} as AuditEventQueryOptions,
      );
      expect(permission.allowed).toBe(true);
      expect(permission.enforcedFilters.actorUserId).toBe("user-42");
      expect(permission.redactedFields).toContain("ip_address");
    });

    it("should deny with no roles", () => {
      const permission = gate.authorize(
        makeCaller([]),
        {} as AuditEventQueryOptions,
      );
      expect(permission.allowed).toBe(false);
      expect(permission.reason).toBeDefined();
    });
  });

  describe("applyPermission", () => {
    it("should merge enforced filters into query", () => {
      const permission = gate.authorize(
        makeCaller(["view_own_events"], "user-42"),
        {} as AuditEventQueryOptions,
      );

      const query: AuditEventQueryOptions = { instanceId: "inst-1" };
      const applied = gate.applyPermission(query, permission);

      expect(applied.instanceId).toBe("inst-1");
      expect(applied.actorUserId).toBe("user-42");
    });
  });

  describe("redactResults", () => {
    it("should strip redacted fields from events", () => {
      const permission = gate.authorize(
        makeCaller(["view_tenant_events"]),
        {} as AuditEventQueryOptions,
      );

      const events = [makeEvent()];
      const redacted = gate.redactResults(events, permission);

      expect(redacted[0].ipAddress).toBeUndefined();
      expect(redacted[0].userAgent).toBeUndefined();
      // Other fields should be preserved
      expect(redacted[0].eventType).toBe("workflow.created");
    });

    it("should not redact for security_admin", () => {
      const permission = gate.authorize(
        makeCaller(["security_admin"]),
        {} as AuditEventQueryOptions,
      );

      const events = [makeEvent()];
      const redacted = gate.redactResults(events, permission);

      expect(redacted[0].ipAddress).toBe("192.168.1.1");
      expect(redacted[0].userAgent).toBe("Mozilla/5.0");
    });

    it("should not mutate original events", () => {
      const permission = gate.authorize(
        makeCaller(["view_tenant_events"]),
        {} as AuditEventQueryOptions,
      );

      const events = [makeEvent()];
      gate.redactResults(events, permission);

      // Original should be untouched
      expect(events[0].ipAddress).toBe("192.168.1.1");
    });
  });
});
