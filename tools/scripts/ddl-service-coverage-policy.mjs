const MUTABLE = new Set(["runtime_mutable", "runtime-mutable"]);
const APPEND_ONLY = new Set(["append_only", "append-only"]);
const PROJECTION = new Set(["projection", "balance", "balance_projection", "balance/projection"]);

export async function validateCoverage(artifact, { root }) {
  const errors = [];
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];

  if (!Array.isArray(artifact?.rows)) {
    return ["coverage artifact must contain a rows array"];
  }

  for (const row of rows) {
    const key = row.tableKey ?? row.qualifiedName ?? row.id ?? "<unknown table>";
    const classification = String(row.classification ?? "").toLowerCase();

    if (row.reviewStatus !== "reviewed") {
      errors.push(`${key}: classification and ownership remain provisional`);
    }

    if (!hasApprovedOwner(row)) {
      errors.push(`${key}: missing ownership row (serviceOwner)`);
    }

    if (MUTABLE.has(classification) && !hasQualifiedCommand(row) && !hasApproval(row, "not_exposed")) {
      errors.push(`${key}: runtime-mutable table needs a qualified command or approved not_exposed decision`);
    }

    if (APPEND_ONLY.has(classification)) {
      for (const kind of ["replay", "immutability", "reversal"]) {
        if (!hasEvidence(row, kind)) errors.push(`${key}: append-only table lacks ${kind} evidence`);
      }
    }

    if (PROJECTION.has(classification) || /(?:^|\.)(?:.*_)?balance(?:_|$)/i.test(key)) {
      if (!hasEvidence(row, "concurrency")) {
        errors.push(`${key}: balance/projection table lacks concurrency evidence`);
      }
      if (!hasEvidence(row, "rebuild") && !hasEvidence(row, "reconciliation")) {
        errors.push(`${key}: balance/projection table lacks rebuild or reconciliation evidence`);
      }
    }

    if (isComposedMutation(row)) {
      if (!hasEvidence(row, "audit")) errors.push(`${key}: composed mutation lacks audit evidence`);
      if (!hasEvidence(row, "outbox")) errors.push(`${key}: composed mutation lacks outbox evidence`);
    }

  }

  return errors;
}

function hasApprovedOwner(row) {
  if (typeof row.serviceOwner === "string") {
    if (row.serviceOwner === "none") return row.reviewStatus === "reviewed";
    return row.serviceOwner.length > 0;
  }
  if (row.serviceOwner && typeof row.serviceOwner === "object") {
    if (row.serviceOwner.owner && row.serviceOwner.owner !== "none") return true;
    return row.serviceOwner.decision === "none" && row.serviceOwner.approved === true;
  }
  return false;
}

function hasQualifiedCommand(row) {
  if (row.commands?.decision === "supported") return row.reviewStatus === "reviewed" && Array.isArray(row.commands.codes) && row.commands.codes.length > 0;
  const commands = Array.isArray(row.commands) ? row.commands : [];
  return commands.some((command) => {
    if (typeof command === "string") return command.length > 0 && command !== "not_exposed";
    return Boolean(command?.code) && command.qualified !== false && command.decision !== "not_exposed";
  });
}

function hasApproval(row, decision) {
  if (row.commands?.decision === decision && row.reviewStatus === "reviewed") return true;
  const candidates = [row.commands, row.commandDecision, row.exposureDecision].flat().filter(Boolean);
  return candidates.some((candidate) => typeof candidate === "object" && candidate.decision === decision && candidate.approved === true);
}

function hasEvidence(row, kind) {
  const capitalized = `${kind[0].toUpperCase()}${kind.slice(1)}`;
  const values = [
    row[`${kind}Evidence`],
    row[`${kind}Event`],
    row.evidence?.[kind],
    row.appendOnlyEvidence?.[kind],
    row.projectionEvidence?.[kind],
    row.compositionEvidence?.[kind],
    row[`has${capitalized}Evidence`] === true ? true : undefined,
  ];
  return values.some(nonEmpty);
}

function nonEmpty(value) {
  if (value === true) return true;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function isComposedMutation(row) {
  if (row.composedMutation === true || row.mutationComposition === "composed") return true;
  return (Array.isArray(row.commands) ? row.commands : []).some((command) => command?.composition === "composed" || command?.composed === true);
}
