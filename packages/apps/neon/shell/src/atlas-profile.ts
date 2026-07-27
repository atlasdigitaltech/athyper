import type { AtlasPlaneProfile } from "@athyper/atlas-agent-runtime";

export const neonAtlasProfile = {
  plane: "neon",
  title: "Atlas",
  description: "Your governed Neon assistant",
  emptyState:
    "Ask a product or process question. Live record lookup and business actions will be added behind governed capabilities in later phases.",
  suggestions: [
    "Explain the purchase invoice lifecycle",
    "How should I review an approval exception?",
    "What is the difference between a supplier and a business partner?",
  ],
  capabilityIds: [],
} as const satisfies AtlasPlaneProfile;
