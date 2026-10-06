import {
  referenceMembers,
  validateReferenceMember,
  referenceFailure,
  parseReferenceMembers,
  type ReferenceCommandBatch,
  type ReferenceMemberKind,
  type ReferenceMemberGraph,
  type ReferenceAnchors,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson } from "./deterministic.js";
type Row = Record<string, unknown>;
export function applyReferenceCommands(
  before: ReferenceMemberGraph,
  batch: ReferenceCommandBatch,
  anchors: ReferenceAnchors,
  allocate: () => string,
) {
  const members = Object.fromEntries(
    Object.entries(before.members).map(([k, rows]) => [
      k,
      rows.map((row) => ({ ...row })),
    ]),
  ) as unknown as Record<ReferenceMemberKind, Row[]>;
  const identities: Record<string, string> = Object.create(null);
  const kinds = new Map<string, string>();
  const fail = (code: string, path = "commands"): never =>
    referenceFailure(code, path);
  for (const c of batch.commands)
    if (c.kind === "addMember" || c.kind === "reserveFieldIdentity") {
      if (Object.hasOwn(identities, c.tempRef))
        fail("AUTHORING_TEMP_REF_DUPLICATE");
      identities[c.tempRef] = allocate();
      kinds.set(
        c.tempRef,
        c.kind === "addMember" ? c.memberKind : "fieldIdentity",
      );
    }
  const resolve = (v: unknown, kind?: string): unknown => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const r = v as Row;
      if (
        Object.keys(r).join(",") !== "$tempRef" ||
        typeof r.$tempRef !== "string" ||
        !Object.hasOwn(identities, r.$tempRef) ||
        (kind && kinds.get(r.$tempRef) !== kind)
      )
        return fail("AUTHORING_TEMP_REF_INVALID");
      return identities[r.$tempRef];
    }
    if (
      typeof v !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
    )
      return fail("AUTHORING_MEMBER_IDENTITY_INVALID");
    return v;
  };
  const resolvedValue = (
    kind: ReferenceMemberKind,
    raw: Readonly<Record<string, unknown>>,
  ): Row =>
    Object.fromEntries(
      Object.entries(raw).map(([p, v]) => {
        const col = (
          referenceMembers[kind].columns as Record<
            string,
            { reference?: string }
          >
        )[p];
        if (col?.reference && v !== null) {
          const target = Object.entries(referenceMembers).find(
            ([, d]) => d.table === col.reference,
          )?.[0];
          return [p, resolve(v, target)];
        }
        return [p, v];
      }),
    );
  // Allocate and insert all new logical members before applying edits; this permits
  // typed FK forward references while keeping member updates deterministic.
  for (const c of batch.commands)
    if (c.kind === "addMember") {
      const value = resolvedValue(c.memberKind, c.value);
      validateReferenceMember(c.memberKind, value);
      members[c.memberKind].push({ id: identities[c.tempRef], ...value });
    }
  for (const c of batch.commands) {
    if (c.kind === "addMember" || c.kind === "reserveFieldIdentity") continue;
    const descriptor = referenceMembers[c.memberKind];
    const rows = members[c.memberKind];
    if (c.kind === "reorderMembers") {
      if (!("ordered" in descriptor)) fail("REFERENCE_REORDER_UNSUPPORTED");
      const order = descriptor.ordered!;
      const scopeProps = order.scope.map(
        (col) =>
          Object.entries(descriptor.columns).find(
            ([, c]) => c.column === col,
          )![0],
      );
      if (
        Object.keys(c.scope).sort().join(",") !==
        scopeProps.slice().sort().join(",")
      )
        fail("REFERENCE_REORDER_SCOPE_INVALID");
      const siblings = rows.filter((r) =>
        scopeProps.every(
          (p) => canonicalJson(r[p]) === canonicalJson(c.scope[p]),
        ),
      );
      const ids = c.ids.map((id) => String(resolve(id, c.memberKind)));
      if (
        new Set(ids).size !== ids.length ||
        siblings.length !== ids.length ||
        siblings.some((r) => !ids.includes(String(r.id)))
      )
        fail("REFERENCE_REORDER_INCOMPLETE");
      const position = Object.entries(descriptor.columns).find(
        ([, col]) => col.column === order.column,
      )![0];
      ids.forEach((id, i) => {
        rows.find((r) => r.id === id)![position] = i + 1;
      });
      continue;
    }
    const id = resolve(c.id, c.memberKind);
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) fail("AUTHORING_MEMBER_NOT_FOUND");
    if (c.kind === "removeMember") {
      rows.splice(index, 1);
      continue;
    }
    const patch = resolvedValue(c.memberKind, c.set);
    const columns = descriptor.columns as Record<
      string,
      { nullable: boolean; immutable: boolean }
    >;
    if (new Set(c.clear).size !== c.clear.length)
      fail("REFERENCE_PATCH_INVALID");
    for (const p of c.clear) {
      if (
        !columns[p]?.nullable ||
        columns[p]?.immutable ||
        Object.hasOwn(patch, p)
      )
        fail("REFERENCE_CLEAR_FORBIDDEN", p);
      patch[p] = null;
    }
    validateReferenceMember(c.memberKind, patch, true);
    for (const [p, v] of Object.entries(patch))
      if (
        columns[p]?.immutable &&
        canonicalJson(v) !== canonicalJson(rows[index]![p])
      )
        fail("REFERENCE_REMAP_REQUIRED", p);
    rows[index] = { ...rows[index], ...patch };
  }
  const graph = parseReferenceMembers(
    { contract: before.contract, members },
    anchors,
  );
  for (const c of batch.commands)
    if (
      c.kind === "addMember" &&
      !members[c.memberKind].some((r) => r.id === identities[c.tempRef])
    )
      fail("AUTHORING_TEMP_REF_REMOVED");
  return { graph, identities };
}
