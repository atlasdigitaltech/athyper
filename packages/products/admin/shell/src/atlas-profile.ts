import type { AtlasPlaneProfile } from "@athyper/platform-ai-agent-runtime";

export const adminAtlasProfile = {
  plane: "admin",
  title: "Atlas",
  description: "Governed Admin product guidance",
  emptyState:
    "Ask about Athyper platform documentation or safe Admin navigation. Tenant records, IAM traces, customer history, and actions are unavailable.",
  suggestions: [
    "Explain the Admin metadata publishing workflow",
    "Where do I configure platform feature flags?",
    "How should I review a metadata validation failure?",
  ],
  capabilityIds: [],
} as const satisfies AtlasPlaneProfile;
