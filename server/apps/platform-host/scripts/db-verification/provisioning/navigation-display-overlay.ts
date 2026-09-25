/** Change only explicit per-tab display modes, preserving all published destinations and permissions. */
export const navigationDisplayArtifactKeys = ["business_partner/presentation.detail"] as const;
export function navigationDisplayOverlay(baseline: readonly Record<string, any>[], sources: readonly Record<string, any>[]) {
  const key = navigationDisplayArtifactKeys[0];
  if (sources.length !== 1 || sources[0]?.artifactKey !== key) throw Error("NAVIGATION_DISPLAY_SOURCE_INVALID");
  const result = structuredClone([...baseline]);
  const target = result.find(a => a.artifactKey === key);
  if (!target?.navigation?.tabs || !Array.isArray(sources[0].navigation?.tabs)) throw Error("NAVIGATION_DISPLAY_BASELINE_REQUIRED");
  for (const proposed of sources[0].navigation.tabs) {
    if (proposed.sectionDisplay === undefined) continue;
    if (!["continuous", "selected"].includes(proposed.sectionDisplay)) throw Error("NAVIGATION_DISPLAY_INVALID");
    const tab = target.navigation.tabs.find((t: any) => t.key === proposed.key);
    if (!tab) throw Error("NAVIGATION_DISPLAY_TAB_MISSING");
    tab.sectionDisplay = proposed.sectionDisplay;
  }
  return result;
}
