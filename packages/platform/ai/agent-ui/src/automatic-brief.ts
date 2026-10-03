import type { AtlasBusinessContextV1 } from "@athyper/platform-ai-agent-runtime";

/** Only saved state and applied query coordinates trigger inference. */
export function automaticBriefKey(page: AtlasBusinessContextV1 | undefined): string | undefined {
  if (!page) return;
  if (page.kind === "record") {
    if (page.asOf || !page.savedRevision) return;
    const { generationId: _generation, section: _section, dirty: _dirty, ...saved } = page;
    return JSON.stringify(saved);
  }
  const { generationId: _generation, ...applied } = page;
  return JSON.stringify(applied);
}

export function automaticBriefQuestion(page: AtlasBusinessContextV1): string {
  return page.kind === "record"
    ? "Summarize this saved record using its published capabilities and available evidence."
    : "Summarize the current analysis target using its published capabilities and available evidence coverage.";
}
