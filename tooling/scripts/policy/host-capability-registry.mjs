const PLANES = new Set(["studio", "neon", "mesh"]);
const MUTABLE = new Set(["runtime_mutable", "runtime-mutable"]);

export function validateHostCapabilityRegistry(registry, coverageArtifact, { profiles = {} } = {}) {
  const errors = [];
  const capabilities = Array.isArray(registry?.capabilities) ? registry.capabilities : [];
  const rows = Array.isArray(coverageArtifact?.rows) ? coverageArtifact.rows : [];
  if (registry?.schemaVersion !== 1) errors.push("registry.schemaVersion must be 1");
  if (!Array.isArray(registry?.capabilities)) return [...errors, "registry.capabilities must be an array"];
  if (!Array.isArray(coverageArtifact?.rows)) return [...errors, "coverage artifact must contain a rows array"];

  const ids = new Set();
  const flags = new Set();
  const linkedRows = new Map();
  for (const capability of capabilities) {
    const at = capability?.id || "<unknown capability>";
    if (!/^[a-z][a-z0-9-]*$/.test(capability?.id ?? "") || ids.has(capability.id)) errors.push(`${at}: invalid or duplicate capability id`);
    ids.add(capability.id);
    if (typeof capability?.service !== "string" || !capability.service) errors.push(`${at}: service is required`);
    validateFeatureFlag(capability, at, flags, errors);
    validatePlanes(capability, at, errors);
    validateProfiles(capability, at, profiles, errors);

    const selected = rows.filter((row) => matchesCoverage(row, capability.coverage));
    if (selected.length === 0) errors.push(`${at}: coverage selector resolves to no rows`);
    for (const row of selected) {
      if (row.serviceOwner !== capability.service) errors.push(`${at}: ${row.sourceKey} service does not agree with the registry`);
      if (row.featureGate !== capability.featureFlag?.name) errors.push(`${at}: ${row.sourceKey} feature flag does not agree with the registry`);
      const previous = linkedRows.get(row.sourceKey);
      if (previous) errors.push(`${row.sourceKey}: linked by both ${previous} and ${at}`);
      linkedRows.set(row.sourceKey, at);
    }

    const enabled = capability.featureFlag?.defaultEnabled === true || Object.values(capability.profiles ?? {}).some(Boolean);
    if (capability.exposure === "composed") validateComposed(capability, selected, at, errors);
    else if (capability.exposure === "not_exposed") {
      if (enabled) errors.push(`${at}: not_exposed capability cannot be enabled`);
      if (!capability.decision || typeof capability.decision.reason !== "string" || !capability.decision.reason.trim()) errors.push(`${at}: not_exposed capability needs a decision reason`);
      for (const row of selected) {
        if (row.commands?.decision !== "not_exposed") errors.push(`${at}: ${row.sourceKey} registry exposure disagrees with coverage command decision`);
        if (capability.decision?.approved === true && row.reviewStatus !== "reviewed") errors.push(`${at}: ${row.sourceKey} cannot inherit an approved not_exposed decision while coverage is provisional`);
      }
    } else errors.push(`${at}: exposure must be composed or not_exposed`);

    if (enabled && capability.featureFlag?.runtimeMutable === true && capability.exposure !== "composed") {
      errors.push(`${at}: enabled runtime-mutable capability lacks a composed chain`);
    }
  }

  for (const row of rows) {
    if (!MUTABLE.has(String(row.classification ?? "").toLowerCase())) continue;
    if (row.commands?.decision !== "supported" || row.reviewStatus !== "reviewed") continue;
    if (!linkedRows.has(row.sourceKey)) errors.push(`${row.sourceKey}: reviewed supported runtime-mutable row is absent from the host registry`);
  }
  return errors;
}

function matchesCoverage(row, selector) {
  if (!selector || typeof selector !== "object") return false;
  if (selector.serviceOwner && row.serviceOwner !== selector.serviceOwner) return false;
  if (selector.featureGate && row.featureGate !== selector.featureGate) return false;
  if (Array.isArray(selector.classifications) && !selector.classifications.includes(row.classification)) return false;
  if (Array.isArray(selector.sourceKeys) && !selector.sourceKeys.includes(row.sourceKey)) return false;
  return true;
}

function validateFeatureFlag(capability, at, flags, errors) {
  const flag = capability?.featureFlag;
  if (!flag || typeof flag.name !== "string" || !flag.name) errors.push(`${at}: featureFlag.name is required`);
  else if (flags.has(flag.name)) errors.push(`${at}: duplicate feature flag ${flag.name}`);
  else flags.add(flag.name);
  if (flag?.runtimeMutable !== true) errors.push(`${at}: mutation feature flag must be runtimeMutable`);
  if (typeof flag?.defaultEnabled !== "boolean") errors.push(`${at}: featureFlag.defaultEnabled must be boolean`);
}

function validatePlanes(capability, at, errors) {
  if (!Array.isArray(capability?.planes) || capability.planes.length === 0) errors.push(`${at}: at least one plane is required`);
  else for (const plane of capability.planes) if (!PLANES.has(plane)) errors.push(`${at}: invalid plane ${plane}`);
}

function validateProfiles(capability, at, profiles, errors) {
  for (const [profile, enabled] of Object.entries(capability?.profiles ?? {})) {
    if (Object.keys(profiles).length > 0 && !profiles[profile]) errors.push(`${at}: unknown profile ${profile}`);
    if (typeof enabled !== "boolean") errors.push(`${at}: profile ${profile} must be boolean`);
  }
}

function validateComposed(capability, rows, at, errors) {
  const provider = capability.repositoryProvider;
  const entry = capability.entryPoint;
  const readiness = capability.readiness;
  const behavior = capability.mutationBehavior;
  if (!provider?.id || !provider?.module) errors.push(`${at}: composed capability lacks repository provider id/module`);
  if (!entry?.id || !entry?.module || !["route", "job"].includes(entry?.kind)) errors.push(`${at}: composed capability lacks a valid route/job entry point`);
  if (!readiness || typeof readiness.checks !== "object") errors.push(`${at}: composed capability lacks readiness checks`);
  else for (const plane of capability.planes ?? []) if (!readiness.checks[plane]) errors.push(`${at}: composed capability lacks ${plane} readiness check`);
  const commandCodes = [...new Set(rows.flatMap((row) => row.commands?.codes ?? []))];
  for (const field of ["permissions", "audit", "outbox", "rollback"]) validateCommandBehavior(behavior?.[field], commandCodes, at, field, errors);
  for (const row of rows) {
    if (row.reviewStatus !== "reviewed" || row.commands?.decision !== "supported") errors.push(`${at}: ${row.sourceKey} is composed but coverage is not reviewed/supported`);
    if (provider?.module && !row.repository?.includes(provider.module)) errors.push(`${at}: ${row.sourceKey} does not name repository provider module ${provider.module}`);
    if (entry?.module && !row.entryPoints?.includes(entry.module)) errors.push(`${at}: ${row.sourceKey} does not name entry point module ${entry.module}`);
    if (!Array.isArray(row.auditEvent) || row.auditEvent.length === 0) errors.push(`${at}: ${row.sourceKey} lacks audit evidence`);
    if (!Array.isArray(row.outboxEvent) || row.outboxEvent.length === 0) errors.push(`${at}: ${row.sourceKey} lacks outbox evidence`);
  }
}

function validateCommandBehavior(mapping, commandCodes, at, field, errors) {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    errors.push(`${at}: composed mutation lacks exact ${field} behavior by command`);
    return;
  }
  for (const code of commandCodes) {
    const value = mapping[code];
    if (typeof value !== "string" || !value.trim()) errors.push(`${at}: ${code} lacks exact ${field} behavior`);
  }
}
