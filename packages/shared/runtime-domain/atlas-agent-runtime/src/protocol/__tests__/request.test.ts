import { describe, expect, it } from "vitest";
import { AgentRunRequestSchema } from "../request";

const validBody = {
  client_request_id: "00000000-0000-4000-8000-000000000001",
  plane: "neon" as const,
  model_id: "atlas-fast",
  policy_revision: "atlas-base-v1",
  message: "Hello",
};

describe("AgentRunRequestSchema.model_id", () => {
  it("accepts a well-formed request with model_id", () => {
    const parsed = AgentRunRequestSchema.safeParse(validBody);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.model_id).toBe("atlas-fast");
  });

  it("rejects a request missing model_id", () => {
    const rest: Record<string, unknown> = { ...validBody };
    delete rest["model_id"];
    const parsed = AgentRunRequestSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty model_id", () => {
    const parsed = AgentRunRequestSchema.safeParse({ ...validBody, model_id: "" });
    expect(parsed.success).toBe(false);
  });

  it("trims a model_id and rejects an oversized value", () => {
    const parsed = AgentRunRequestSchema.safeParse({
      ...validBody,
      model_id: " atlas-fast ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.model_id).toBe("atlas-fast");
    expect(AgentRunRequestSchema.safeParse({
      ...validBody,
      model_id: "m".repeat(101),
    }).success).toBe(false);
  });

  it("accepts a bounded effective policy revision", () => {
    const parsed = AgentRunRequestSchema.safeParse(validBody);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.policy_revision).toBe("atlas-base-v1");
    }
  });

  it("rejects an empty or oversized policy revision", () => {
    expect(AgentRunRequestSchema.safeParse({
      ...validBody,
      policy_revision: " ",
    }).success).toBe(false);
    expect(AgentRunRequestSchema.safeParse({
      ...validBody,
      policy_revision: "p".repeat(201),
    }).success).toBe(false);
  });

  it("accepts only bounded identifier context and never accepts scope overrides", () => {
    expect(AgentRunRequestSchema.safeParse({
      ...validBody,
      context: {
        route: "/app/company_code/CC-100",
        entity_type: "company_code",
        entity_id: "CC-100",
      },
    }).success).toBe(true);

    for (const context of [
      { entity_type: "Company Code", entity_id: "CC-100" },
      { entity_type: "company_code", entity_id: "../unsafe id" },
      { entity_type: "x".repeat(65), entity_id: "CC-100" },
      { entity_type: "company_code", entity_id: "x".repeat(129) },
      { route: `/${"x".repeat(500)}` },
      { entity_type: "company_code", entity_id: "CC-100", tenant_id: "other" },
    ]) {
      expect(AgentRunRequestSchema.safeParse({
        ...validBody,
        context,
      }).success).toBe(false);
    }
  });
});
