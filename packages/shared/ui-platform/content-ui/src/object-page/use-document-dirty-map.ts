"use client";

import { useMemo } from "react";
import type { DocumentSectionDescriptor } from "./types";

export interface UseDocumentDirtyMapOptions {
  /** Section descriptors. Provides the section ID universe + order. */
  sections: DocumentSectionDescriptor[];
  /**
   * Map a field name to its section ID. Return `null` for fields with no
   * section affinity (they don't contribute to any tab badge). Default:
   * every field is bucketed into the first section (typically `__overview`).
   *
   * Document entities with line-level edits map line fields to the lines
   * section ID — see consumer wiring in DocumentDetailPage.
   */
  fieldToSection?: (fieldName: string) => string | null;
  /** Pending header patch — e.g. `editDraft.pendingHeaderPatch`. */
  pendingPatch: Record<string, unknown>;
  /** Field-level validation errors — e.g. `editDraft.fieldErrors`. */
  fieldErrors: Record<string, string>;
}

export interface UseDocumentDirtyMapReturn {
  /** Section IDs with at least one dirty field. */
  dirtySectionIds: Set<string>;
  /** Section IDs with at least one validation error. */
  errorSectionIds: Set<string>;
  /** Per-section dirty field count. Missing sections imply 0. */
  dirtyCountBySection: Record<string, number>;
  /** Per-section error count. Missing sections imply 0. */
  errorCountBySection: Record<string, number>;
  /** First section (in `sections` order) with at least one error. Drives jump-to-error. */
  firstErrorSectionId: string | null;
  /** First field name in `firstErrorSectionId` reporting an error. Drives focus-on-error. */
  firstErrorFieldName: string | null;
}

const EMPTY_SET = new Set<string>();

/**
 * Partitions a document workspace draft's dirty + error state by section.
 *
 * Outputs are designed to drop into the tab strip's per-tab badge slot and
 * to seed `scrollToSection(id, "jumpToError")` after a failed save.
 *
 * Plane-agnostic — depends only on the section descriptor type and on plain
 * `Record` shapes that match `useDocumentEditDraft`'s public surface. Used
 * by neon today; usable by mesh / admin without modification.
 *
 * @example
 * const dirtyMap = useDocumentDirtyMap({
 *   sections,
 *   pendingPatch: editDraft.pendingHeaderPatch,
 *   fieldErrors: editDraft.fieldErrors,
 * });
 *
 * const tabsWithBadges = sections.map(s => ({
 *   id: s.id,
 *   label: s.label,
 *   badge: dirtyMap.errorSectionIds.has(s.id)
 *     ? { type: "error" as const, count: dirtyMap.errorCountBySection[s.id] }
 *     : dirtyMap.dirtySectionIds.has(s.id)
 *       ? { type: "dirty" as const }
 *       : undefined,
 * }));
 */
export function useDocumentDirtyMap(
  options: UseDocumentDirtyMapOptions,
): UseDocumentDirtyMapReturn {
  const { sections, fieldToSection, pendingPatch, fieldErrors } = options;
  const fallbackSectionId = sections[0]?.id ?? null;
  const validSectionIds = useMemo(() => {
    const s = new Set<string>();
    for (const sec of sections) s.add(sec.id);
    return s;
  }, [sections]);

  return useMemo<UseDocumentDirtyMapReturn>(() => {
    const dirtyCountBySection: Record<string, number> = {};
    const errorCountBySection: Record<string, number> = {};
    const errorFieldsBySection: Record<string, string[]> = {};

    const resolve = (fieldName: string): string | null => {
      const explicit = fieldToSection ? fieldToSection(fieldName) : fallbackSectionId;
      if (explicit == null) return null;
      // Defensive: ignore mappings into sections that don't exist on this page
      // (e.g. fieldToSection returns "__lines" but the entity has no lines tab).
      return validSectionIds.has(explicit) ? explicit : null;
    };

    for (const fieldName of Object.keys(pendingPatch)) {
      const id = resolve(fieldName);
      if (!id) continue;
      dirtyCountBySection[id] = (dirtyCountBySection[id] ?? 0) + 1;
    }

    for (const fieldName of Object.keys(fieldErrors)) {
      const id = resolve(fieldName);
      if (!id) continue;
      errorCountBySection[id] = (errorCountBySection[id] ?? 0) + 1;
      (errorFieldsBySection[id] = errorFieldsBySection[id] ?? []).push(fieldName);
    }

    const dirtySectionIds = Object.keys(dirtyCountBySection).length > 0
      ? new Set(Object.keys(dirtyCountBySection))
      : EMPTY_SET;
    const errorSectionIds = Object.keys(errorCountBySection).length > 0
      ? new Set(Object.keys(errorCountBySection))
      : EMPTY_SET;

    // Walk sections in declared order so the first error matches the user's
    // visual scan direction (top to bottom on the page, left to right on tabs).
    let firstErrorSectionId: string | null = null;
    let firstErrorFieldName: string | null = null;
    for (const sec of sections) {
      const fields = errorFieldsBySection[sec.id];
      if (fields && fields.length > 0) {
        firstErrorSectionId = sec.id;
        firstErrorFieldName = fields[0] ?? null;
        break;
      }
    }

    return {
      dirtySectionIds,
      errorSectionIds,
      dirtyCountBySection,
      errorCountBySection,
      firstErrorSectionId,
      firstErrorFieldName,
    };
  }, [sections, fieldToSection, pendingPatch, fieldErrors, validSectionIds, fallbackSectionId]);
}
