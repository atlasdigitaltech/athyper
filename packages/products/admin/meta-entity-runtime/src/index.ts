import type {
  MetaEntityDiagnostic,
  MetaEntityDiagnosticSeverity,
  MetaEntityFieldDraft,
  MetaEntityStudioSection,
  MetaEntityStudioSnapshot,
  MetaEntitySummary,
} from "@athyper/meta-entity-authoring-contracts";

export * from "./client";

export interface MetaEntityStudioState {
  snapshot: MetaEntityStudioSnapshot;
  section: MetaEntityStudioSection;
  entityQuery: string;
  selectedFieldId: string | null;
  problemsOpen: boolean;
}

export type MetaEntityStudioAction =
  | { type: "select_entity"; entityId: string }
  | { type: "select_section"; section: MetaEntityStudioSection }
  | { type: "search_entities"; query: string }
  | { type: "select_field"; fieldId: string | null }
  | { type: "toggle_problems" }
  | { type: "replace_snapshot"; snapshot: MetaEntityStudioSnapshot };

export function createMetaEntityStudioState(
  snapshot: MetaEntityStudioSnapshot,
): MetaEntityStudioState {
  return {
    snapshot,
    section: "overview",
    entityQuery: "",
    selectedFieldId: null,
    problemsOpen: true,
  };
}

export function reduceMetaEntityStudioState(
  state: MetaEntityStudioState,
  action: MetaEntityStudioAction,
): MetaEntityStudioState {
  switch (action.type) {
    case "select_entity":
      return {
        ...state,
        snapshot: { ...state.snapshot, activeEntityId: action.entityId },
        selectedFieldId: null,
      };
    case "select_section":
      return { ...state, section: action.section };
    case "search_entities":
      return { ...state, entityQuery: action.query };
    case "select_field":
      return { ...state, selectedFieldId: action.fieldId };
    case "toggle_problems":
      return { ...state, problemsOpen: !state.problemsOpen };
    case "replace_snapshot":
      return { ...state, snapshot: action.snapshot, selectedFieldId: null };
  }
}

export function selectVisibleEntities(state: MetaEntityStudioState): readonly MetaEntitySummary[] {
  const query = state.entityQuery.trim().toLocaleLowerCase();
  if (!query) return state.snapshot.entities;
  return state.snapshot.entities.filter((entity) =>
    [entity.entityCode, entity.moduleCode, entity.entityClass, entity.ownershipModel]
      .some((value) => value.toLocaleLowerCase().includes(query)),
  );
}

export function selectActiveEntity(state: MetaEntityStudioState): MetaEntitySummary | null {
  return state.snapshot.entities.find((entity) => entity.id === state.snapshot.activeEntityId) ?? null;
}

export function selectActiveField(state: MetaEntityStudioState): MetaEntityFieldDraft | null {
  return state.snapshot.fields.find((field) => field.id === state.selectedFieldId) ?? null;
}

export function selectDiagnosticsBySeverity(
  diagnostics: readonly MetaEntityDiagnostic[],
): Readonly<Record<MetaEntityDiagnosticSeverity, number>> {
  return diagnostics.reduce<Record<MetaEntityDiagnosticSeverity, number>>(
    (counts, diagnostic) => {
      counts[diagnostic.severity] += 1;
      return counts;
    },
    { error: 0, warning: 0, info: 0 },
  );
}
