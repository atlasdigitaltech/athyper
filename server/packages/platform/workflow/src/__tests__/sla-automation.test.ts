import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowSlaAutomation,
  scheduleSla,
  type SlaBreachCandidate,
} from "../index.js";
describe("workflow SLA automation", () => {
  it("normalizes schedules and escalates through an active delegation", async () => {
    expect(
      scheduleSla(
        {
          code: "approval",
          version: 2,
          durationMinutes: 60,
          reminderMinutes: [30, 10, 30],
          escalationMinutes: 0,
        },
        new Date("2026-08-12T00:00:00Z"),
      ),
    ).toEqual({
      policyCode: "approval",
      policyVersion: 2,
      dueAt: "2026-08-12T01:00:00.000Z",
      remindersAt: ["2026-08-12T00:10:00.000Z", "2026-08-12T00:30:00.000Z"],
      escalateAt: "2026-08-12T00:00:00.000Z",
    });
    const candidate: SlaBreachCandidate = {
      id: "item",
      tenantId: "tenant",
      title: "Approve invoice",
      assigneePrincipalId: "owner",
      dueAt: "2026-08-11T00:00:00Z",
      rowVersion: 1,
      payload: {},
    };
    const record = vi.fn().mockResolvedValue(true),
      automation = createWorkflowSlaAutomation({
        repository: { claim: vi.fn().mockResolvedValue([candidate]), record },
        transactions: { run: async (_plane, _actor, work) => work({}) },
        delegations: { resolve: vi.fn().mockResolvedValue("delegate") },
        now: () => new Date("2026-08-12T00:00:00Z"),
      });
    await expect(
      automation.sweep({
        planeKey: "neon",
        tenantId: "tenant",
        principalId: "system",
      }),
    ).resolves.toEqual({ inspected: 1, breached: 0, escalated: 1, skipped: 0 });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ candidate, escalatedTo: "delegate" }),
      {},
    );
  });
  it("dispatches each configured reminder before evaluating a breach", async () => {
    const reminder = {
      id: "item",
      tenantId: "tenant",
      title: "Approve supplier",
      assigneePrincipalId: "owner",
      dueAt: "2026-08-12T01:00:00Z",
      reminderAt: "2026-08-12T00:30:00Z",
      reminderIndex: 0,
      rowVersion: 1,
      payload: {},
    };
    const recordReminder = vi.fn().mockResolvedValue(true),
      automation = createWorkflowSlaAutomation({
        repository: {
          claimReminders: vi.fn().mockResolvedValue([reminder]),
          recordReminder,
          claim: vi.fn().mockResolvedValue([]),
          record: vi.fn(),
        },
        transactions: { run: async (_plane, _actor, work) => work({}) },
        now: () => new Date("2026-08-12T00:30:00Z"),
      });
    await expect(
      automation.sweep({
        planeKey: "neon",
        tenantId: "tenant",
        principalId: "system",
      }),
    ).resolves.toEqual({
      inspected: 1,
      breached: 0,
      escalated: 0,
      skipped: 0,
      reminded: 1,
    });
    expect(recordReminder).toHaveBeenCalledWith(
      expect.objectContaining({ candidate: reminder }),
      {},
    );
  });
});
