import { resolveSourcePath } from "../../../../../../../tooling/scripts/metadata/source-workspace.mjs";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { NOTIFICATION_EVENTS } from "@athyper/server-contract-publication";
import { compileTableEntityProduct, parseTableEntityProduct } from "./table-product.js";

const source = (entity: string) =>
  JSON.parse(readFileSync(resolveSourcePath(new URL(`../../../../../../../metadata/entities/${entity}/definition.json`, import.meta.url)), "utf8"));
const bindings = (entity: string, suffix: string) =>
  (source(entity).definition.surfaceFieldBindings as { bindingKey: string; displayConfig?: { lookup?: { options: { value: string; label: string }[] } } }[])
    .filter((binding) => binding.bindingKey.endsWith(suffix));

it.each(["principal", "principal_notification_preference", "principal_ui_profile"])("%s still compiles for every plane", (entity) => {
  const product = parseTableEntityProduct(source(entity));
  for (const plane of ["studio", "neon", "mesh"] as const) expect(() => compileTableEntityProduct(product, plane)).not.toThrow();
});

it("the account record's sections carry their own icons", () => {
  const detail = source("principal").definition.surfaces.find((surface: { surfaceKind: string }) => surface.surfaceKind === "detail");
  expect(detail.layoutConfig.recordPresentation.sections.map((section: { key: string; iconKey?: string }) => [section.key, section.iconKey]))
    .toEqual([["overview", "layout"], ["profile", "user"], ["notifications", "bell"], ["ui_profile", "settings"]]);
});

it("notification preference events are exactly the events the platform publishes", () => {
  const published = [...NOTIFICATION_EVENTS.comments, ...NOTIFICATION_EVENTS.attachments];
  const event = bindings("principal_notification_preference", "_event_code");
  expect(event.length).toBeGreaterThan(0);
  for (const binding of event) expect(binding.displayConfig?.lookup?.options.map((option) => option.value)).toEqual(published);
  // A preference row is named by its event, not its record id.
  const list = source("principal_notification_preference").definition.surfaces.find((surface: { surfaceKind: string }) => surface.surfaceKind === "list");
  expect(list.layoutConfig.identityField).toBe("event_code");
});

it("week start is a choice of the seven days, stored as 0 (Sunday) to 6", () => {
  for (const binding of bindings("principal_ui_profile", "_week_start"))
    expect(binding.displayConfig?.lookup?.options.map((option) => option.value)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
});

it("empty one-record sections publish a short title with the message as its description", () => {
  const detail = source("principal").definition.surfaces.find((surface: { surfaceKind: string }) => surface.surfaceKind === "detail");
  const states = Object.fromEntries(detail.layoutConfig.recordPresentation.entityRelationships
    .filter((relationship: { emptyState?: unknown }) => relationship.emptyState)
    .map((relationship: { key: string; emptyState: { title?: string; message: string } }) => [relationship.key, relationship.emptyState]));
  expect(states.profile).toMatchObject({ title: { defaultText: "Set up your profile" }, message: { defaultText: "Add the names shown across the platform." } });
  expect(states.ui_profile).toMatchObject({ title: { defaultText: "Using your organization's defaults" } });
});

it("empty-state texts are translated from the localization sidecar for every plane", () => {
  const localization = JSON.parse(readFileSync(resolveSourcePath(new URL("../../../../../../../metadata/entities/principal/localization.json", import.meta.url)), "utf8"));
  const product = parseTableEntityProduct(source("principal"), localization);
  for (const plane of ["studio", "neon", "mesh"] as const) {
    const { artifact } = compileTableEntityProduct(product, plane);
    const relationships = (artifact.descriptor as { recordPresentation?: { entityRelationships?: { key: string; emptyState?: Record<string, { values?: Record<string, string> }> }[] } })
      .recordPresentation?.entityRelationships ?? [];
    const profile = relationships.find((relationship) => relationship.key === "profile")!.emptyState!;
    expect(profile.title!.values).toMatchObject({ en: "Set up your profile", ms: "Sediakan profil anda", ar: "إعداد ملفك الشخصي" });
    expect(profile.setupLabel!.values!.ms).toBe("Sediakan profil");
  }
});

it("the UI profile entity is labelled for people, with translations, not derived from its code", () => {
  const localization = JSON.parse(readFileSync(resolveSourcePath(new URL("../../../../../../../metadata/entities/principal_ui_profile/localization.json", import.meta.url)), "utf8"));
  const product = parseTableEntityProduct(source("principal_ui_profile"), localization);
  for (const plane of ["studio", "neon", "mesh"] as const) {
    const { artifact } = compileTableEntityProduct(product, plane);
    const labels = (artifact.descriptor as { listPresentation?: { localizedLabels?: { entity?: { defaultText: string; values?: Record<string, string> } } } }).listPresentation?.localizedLabels;
    expect(labels?.entity).toMatchObject({ defaultText: "UI profile", values: { en: "UI profile", ms: "Profil antara muka", ar: "ملف الواجهة" } });
  }
});
