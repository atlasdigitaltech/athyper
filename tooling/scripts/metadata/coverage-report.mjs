/** Source coverage only: declared planes never attest published activation. */
export function coverageReport(entities) {
  const rows = [...entities.values()].map(({ entityCode, descriptor }) => {
    const targets = descriptor.targets;
    const declared = targets?.declared ?? [];
    return {
      entityCode,
      declared,
      required: targets?.required ?? [],
      recommended: targets?.recommended ?? [],
      missingRequired: (targets?.required ?? []).filter(plane => !declared.includes(plane)),
      missingRecommended: (targets?.recommended ?? []).filter(plane => !declared.includes(plane)),
      classificationStatus: !targets ? "legacy_unclassified" : descriptor.entityClass === null || descriptor.ownershipModel === null ? "unresolved" : "resolved",
      placementStatus: descriptor.placement ? "declared" : "exposure_decision_pending",
    };
  }).sort((a, b) => a.entityCode.localeCompare(b.entityCode));
  return {
    schema: "athyper.entity-source-coverage/1",
    publicationVerified: false,
    entities: rows,
    counts: {
      entities: rows.length,
      missingRequiredPlanes: rows.reduce((sum, row) => sum + row.missingRequired.length, 0),
      missingRecommendedPlanes: rows.reduce((sum, row) => sum + row.missingRecommended.length, 0),
      unresolvedClassifications: rows.filter(row => row.classificationStatus !== "resolved").length,
    },
  };
}

export function requiredCoverageFailures(report, entityCodes = report.entities.map(row => row.entityCode)) {
  const byCode = new Map(report.entities.map(row => [row.entityCode, row]));
  return [...new Set(entityCodes)].sort().flatMap(code => {
    const row = byCode.get(code);
    if (!row || row.classificationStatus === "legacy_unclassified") return [`${code}: classified target metadata unavailable`];
    return row.missingRequired.length ? [`${code}: required planes not declared: ${row.missingRequired.join(", ")}`] : [];
  });
}
