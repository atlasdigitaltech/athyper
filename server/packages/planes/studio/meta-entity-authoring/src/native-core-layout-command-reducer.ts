import {
  AuthoringPolicyError,
  nativeCoreLayoutMembers,
  nativeOrderScopes,
  parseNormalizedLayoutGraph,
  validateFoundationNode,
  referenceUuid,
  nativeCoreLayoutCommandNode,
  type NativeCoreLayoutCommandBatch,
  type NativeCoreLayoutKind,
  type NormalizedCoreGraph,
  type NormalizedLayoutGraph,
  type NormalizedLayoutContext,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson } from "./deterministic.js";
type Row = Record<string, unknown>;
export type NativeCoreLayoutState = {
  readonly core: NormalizedCoreGraph;
  readonly layout: NormalizedLayoutGraph;
};
/** Registered source resolution is outside the command payload. It returns every
 * service-owned property explicitly; omission is not an initialization default. */
export type NativeMemberInitializer = (
  kind: NativeCoreLayoutKind,
  id: string,
  tempRef: string,
  value: Readonly<Row>,
) => Readonly<Row>;
export function applyNativeCoreLayoutCommands(
  before: NativeCoreLayoutState,
  batch: NativeCoreLayoutCommandBatch,
  context: NormalizedLayoutContext,
  allocate: () => string,
  initialize: NativeMemberInitializer,
): NativeCoreLayoutState & { identities: Record<string, string> } {
  const fail = (code: string): never => {
    throw new AuthoringPolicyError(
      code,
      `${code}: native command batch rejected without partial changes.`,
    );
  };
  validateFoundationNode(nativeCoreLayoutCommandNode(), batch, "/commands");
  const rows = structuredClone({
    ...before.core,
    ...before.layout,
  }) as unknown as Record<NativeCoreLayoutKind, Row[]>;
  const identities: Record<string, string> = Object.create(null);
  const kinds = new Map<string, NativeCoreLayoutKind>();
  const allocated = new Set<string>(
    Object.values(rows).flatMap((rs) => rs.map((r) => String(r.id))),
  );
  for (const c of batch.commands)
    if (c.kind === "addMember") {
      if (Object.hasOwn(identities, c.tempRef))
        fail("AUTHORING_TEMP_REF_DUPLICATE");
      const id = allocate();
      validateFoundationNode(referenceUuid, id, "/allocatedId");
      if (allocated.has(id)) fail("AUTHORING_MEMBER_IDENTITY_REPLACEMENT");
      allocated.add(id);
      identities[c.tempRef] = id;
      kinds.set(c.tempRef, c.memberKind);
    }
  const resolve = (
    value: unknown,
    expected?: NativeCoreLayoutKind,
  ): unknown => {
    if (value !== null && typeof value === "object") {
      const token = (value as Row).$tempRef;
      if (
        typeof token !== "string" ||
        !Object.hasOwn(identities, token) ||
        (expected && kinds.get(token) !== expected)
      )
        fail("AUTHORING_TEMP_REF_INVALID");
      return identities[String(token)];
    }
    return value;
  };
  const values = (kind: NativeCoreLayoutKind, raw: Readonly<Row>): Row =>
    Object.fromEntries(
      Object.entries(raw).map(([p, v]) => {
        const column = (
          nativeCoreLayoutMembers[kind].columns as Record<
            string,
            { reference?: string }
          >
        )[p];
        if (v !== null && column?.reference) {
          const target = Object.entries(nativeCoreLayoutMembers).find(
            ([, m]) => m.table === column.reference,
          )?.[0] as NativeCoreLayoutKind | undefined;
          if (typeof v === "object" && !target)
            fail("AUTHORING_TEMP_REF_FOREIGN_RESOURCE");
          return [p, resolve(v, target)];
        }
        return [p, v];
      }),
    );
  for (const c of batch.commands)
    if (c.kind === "addMember") {
      const value = values(c.memberKind, c.value);
      const owned = initialize(
        c.memberKind,
        identities[c.tempRef]!,
        c.tempRef,
        structuredClone(value),
      );
      const properties = Object.entries(
        nativeCoreLayoutMembers[c.memberKind].columns,
      )
        .filter(([, col]) => col.serviceOwned)
        .map(([p]) => p);
      if (Object.keys(owned).sort().join(",") !== properties.sort().join(","))
        fail("NATIVE_INITIALIZATION_SOURCE_REQUIRED");
      rows[c.memberKind].push({
        id: identities[c.tempRef],
        ...value,
        ...owned,
      });
    }
  for (const c of batch.commands) {
    if (c.kind === "addMember") continue;
    const members = rows[c.memberKind];
    if (c.kind === "reorderMembers") {
      const properties = nativeOrderScopes[c.memberKind];
      const scope = values(c.memberKind, c.scope);
      const siblings = members.filter((r) =>
        properties.every(
          (p) => canonicalJson(r[p]) === canonicalJson(scope[p]),
        ),
      );
      const ids = c.ids.map((id) => String(resolve(id, c.memberKind)));
      if (
        new Set(ids).size !== ids.length ||
        siblings.length !== ids.length ||
        siblings.some((r) => !ids.includes(String(r.id)))
      )
        fail("NATIVE_REORDER_INCOMPLETE");
      ids.forEach((id, i) => {
        siblings.find((r) => r.id === id)!.position = i + 1;
      });
      continue;
    }
    const id = resolve(c.id, c.memberKind),
      index = members.findIndex((r) => r.id === id);
    if (index < 0) fail("AUTHORING_MEMBER_NOT_FOUND");
    if (c.kind === "removeMember") {
      members.splice(index, 1);
      continue;
    }
    if (
      new Set(c.clear).size !== c.clear.length ||
      c.clear.some((p) => Object.hasOwn(c.set, p))
    )
      fail("NATIVE_PATCH_OVERLAP");
    const patch = values(c.memberKind, c.set);
    for (const p of c.clear) patch[p] = null;
    members[index] = { ...members[index], ...patch };
  }
  for (const [token, id] of Object.entries(identities))
    if (!rows[kinds.get(token)!].some((r) => r.id === id))
      fail("AUTHORING_TEMP_REF_REMOVED");
  if (
    Object.values(rows).reduce((n, rs) => n + rs.length, 0) > context.maxMembers
  )
    fail("AUTHORING_GRAPH_LIMIT");
  for (const members of Object.values(rows))
    members.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const core = {
    field: rows.field,
    runtime: rows.runtime,
    surface: rows.surface,
  } as unknown as NormalizedCoreGraph;
  const layout = {
    section: rows.section,
    binding: rows.binding,
  } as unknown as NormalizedLayoutGraph;
  const checked = parseNormalizedLayoutGraph(layout, { ...context, core });
  return { core, layout: checked, identities };
}
