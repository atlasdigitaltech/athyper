"use client";

// components/mesh/list/preset-storage.ts
//
// Client-side persistence for explorer view presets.
// Uses localStorage with Zod validation on load.

import { deserializePreset, serializePreset } from "./explorer-preset";

import type { ViewPreset } from "./types";

import {
  getLocalStorageValue,
  setLocalStorageValue,
} from "@/lib/local-storage.client";

const STORAGE_PREFIX = "neon:presets:";

/** Load all saved presets for an entity/page. */
export function loadPresets(entityKey: string): ViewPreset[] {
  const raw = getLocalStorageValue(`${STORAGE_PREFIX}${entityKey}`);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const presets: ViewPreset[] = [];
    for (const item of parsed) {
      const preset = deserializePreset(JSON.stringify(item));
      if (preset) presets.push(preset);
    }
    return presets;
  } catch {
    return [];
  }
}

/** Save a preset (create or update by id). */
export function savePreset(entityKey: string, preset: ViewPreset): void {
  const existing = loadPresets(entityKey);
  const idx = existing.findIndex((p) => p.id === preset.id);

  if (idx >= 0) {
    existing[idx] = preset;
  } else {
    existing.push(preset);
  }

  setLocalStorageValue(
    `${STORAGE_PREFIX}${entityKey}`,
    JSON.stringify(existing.map((p) => JSON.parse(serializePreset(p)))),
  );
}

/** Delete a preset by id. */
export function deletePreset(entityKey: string, presetId: string): void {
  const existing = loadPresets(entityKey);
  const filtered = existing.filter((p) => p.id !== presetId);
  setLocalStorageValue(
    `${STORAGE_PREFIX}${entityKey}`,
    JSON.stringify(filtered.map((p) => JSON.parse(serializePreset(p)))),
  );
}

/** Set a preset as the default (clears default from others). */
export function setDefaultPreset(entityKey: string, presetId: string): void {
  const existing = loadPresets(entityKey);
  for (const p of existing) {
    p.isDefault = p.id === presetId;
  }
  setLocalStorageValue(
    `${STORAGE_PREFIX}${entityKey}`,
    JSON.stringify(existing.map((p) => JSON.parse(serializePreset(p)))),
  );
}

/** Get the default preset for an entity/page. */
export function getDefaultPreset(entityKey: string): ViewPreset | null {
  const presets = loadPresets(entityKey);
  return presets.find((p) => p.isDefault) ?? null;
}
