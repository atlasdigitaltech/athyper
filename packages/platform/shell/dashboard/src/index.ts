import type { ComponentType, ReactNode } from "react";
import { createElement } from "react";
import { parseExperienceSurface, type ExperienceActionRef, type ExperienceRegistryPolicy, type ExperienceSurface, type ExperienceVisual } from "@athyper/contract-platform-dashboard";

export interface ExperienceDataResult { readonly value?: string | number; readonly items?: readonly Readonly<{ id: string; label: string; href?: string }>[]; readonly chart?: readonly number[]; }
export type ExperienceDataSource = (context: Readonly<Record<string, string>>) => ExperienceDataResult | Promise<ExperienceDataResult>;
export type ExperienceAction = (input: Readonly<Record<string, string | number | boolean>>) => string;
export type ExperienceExtension = ComponentType<Readonly<{ config: Readonly<Record<string, unknown>> }>>;
export interface ExperienceRuntimeRegistry {
  readonly dataSources: Readonly<Record<string, ExperienceDataSource>>;
  readonly actions: Readonly<Record<string, ExperienceAction>>;
  readonly extensions: Readonly<Record<string, ExperienceExtension>>;
  readonly icons?: Readonly<Record<string, ComponentType>>;
  readonly assets?: Readonly<Record<string,string>>;
}
export interface ExperienceModulePresentation { readonly pinnedModuleCodes?: readonly string[];readonly badges?:Readonly<Record<string,string>>;readonly badgesLoading?:boolean;readonly onTogglePinned?:(moduleCode:string)=>void; }

export function createRegistryPolicy(registry: ExperienceRuntimeRegistry): ExperienceRegistryPolicy {
  const assets=Object.keys(registry.assets??{}),assetRefPattern=assets.length?new RegExp(`^(?:${assets.map(escapePattern).join("|")})$`):/^(?!)$/;
  return { dataSources: new Set(Object.keys(registry.dataSources)), actions: new Set(Object.keys(registry.actions)), extensions: new Set(Object.keys(registry.extensions)),assetRefPattern };
}

export async function ExperienceSurfaceRenderer({ definition, registry, context = {}, headerAccessory, framedHeader = false, hideHeader = false }: Readonly<{ definition: unknown; registry: ExperienceRuntimeRegistry; context?: Readonly<Record<string, string>>; headerAccessory?: ReactNode; framedHeader?: boolean; hideHeader?: boolean }>) {
  const surface = parseExperienceSurface(definition, createRegistryPolicy(registry));
  const data = new Map<string, ExperienceDataResult>();
  await Promise.all(surface.blocks.flatMap((block) => "dataSource" in block ? [Promise.resolve(registry.dataSources[block.dataSource]!(context)).then((result) => data.set(block.id, result))] : []));
  return ExperienceSurfaceView({ surface, registry, data, headerAccessory, framedHeader, hideHeader });
}

export function ExperienceSurfaceView({ surface, registry, data = new Map(), headerAccessory, framedHeader = false, hideHeader = false, modulePresentation }: Readonly<{ surface: ExperienceSurface; registry: ExperienceRuntimeRegistry; data?: ReadonlyMap<string, ExperienceDataResult>; headerAccessory?: ReactNode; framedHeader?: boolean; hideHeader?: boolean;modulePresentation?:ExperienceModulePresentation }>) {
  return createElement("section", { className: "athyper-experience", "data-plane": surface.scope.plane, "data-scope": surface.scope.kind, "data-surface": surface.id },
    hideHeader ? null : createElement("header", { className: `athyper-experience__header${headerAccessory || framedHeader ? " athyper-experience__header--with-accessory" : ""}` }, renderVisual(surface.visual, registry), createElement("div", { className: "athyper-experience__identity" }, surface.eyebrow ? createElement("span", { className: "athyper-experience__eyebrow" }, surface.eyebrow) : null, createElement("h1", null, surface.title), surface.description ? createElement("p", null, surface.description) : null), headerAccessory),
    createElement("div", { className: "athyper-experience__grid" }, ...surface.blocks.map((block) => createElement("article", { key: block.id, className: `athyper-experience__block athyper-experience__block--${block.type}`, style: { gridColumn: `span ${block.span ?? 1}` } }, renderBlock(block, data.get(block.id), registry,modulePresentation)))),
  );
}

function renderBlock(block: ExperienceSurface["blocks"][number], result: ExperienceDataResult | undefined, registry: ExperienceRuntimeRegistry,modulePresentation?:ExperienceModulePresentation): ReactNode {
  switch (block.type) {
    case "heading": return createElement(block.level === 3 ? "h3" : "h2", null, block.text);
    case "text": return createElement("p", null, block.text);
    case "card": return createElement("div", null, renderVisual(block.visual, registry), block.title ? createElement("h2", null, block.title) : null, block.body ? createElement("p", null, block.body) : null, renderActions(block.actions ?? [], registry));
    case "shortcut": return renderShortcut(block, registry,modulePresentation);
    case "chart": return createElement("div", { role: "img", "aria-label": block.title ?? `${block.visualization} chart`, "data-values": (result?.chart ?? []).join(",") }, block.title ? createElement("h2", null, block.title) : null, createElement("p", null, (result?.chart ?? []).join(" · ")));
    case "number-card": return createElement("div", null, block.title ? createElement("h2", null, block.title) : null, createElement("strong", null, result?.value ?? "—"));
    case "quick-list": return createElement("div", null, block.title ? createElement("h2", null, block.title) : null, result?.items?.length ? createElement("ul", null, ...result.items.map((item) => createElement("li", { key: item.id }, item.href ? createElement("a", { href: item.href }, item.label) : item.label))) : createElement("p", null, block.emptyText ?? "No items"));
    case "onboarding": return createElement("ol", null, ...block.steps.map((step, index) => createElement("li", { key: `${block.id}-${index}` }, step.action ? actionLink(step.action, registry, step.label) : step.label)));
    case "extension": { const Extension = registry.extensions[block.extension]!; return createElement(Extension, { config: block.config ?? {} }); }
  }
}

function renderActions(actions: readonly ExperienceActionRef[], registry: ExperienceRuntimeRegistry): ReactNode { return actions.length ? createElement("div", { className: "athyper-experience__actions" }, ...actions.map((action) => actionLink(action, registry))) : null; }
function renderShortcut(block: Extract<ExperienceSurface["blocks"][number], { type: "shortcut" }>, registry: ExperienceRuntimeRegistry,modulePresentation?:ExperienceModulePresentation): ReactNode { if(!block.body&&block.actions.length===1)return createElement("div",null,renderVisual(block.visual,registry),block.title?createElement("h2",null,block.title):null,renderActions(block.actions,registry));const [primary,...secondary]=block.actions,moduleCode=block.id.startsWith("module.")?block.id.slice("module.".length):undefined,pinned=Boolean(moduleCode&&modulePresentation?.pinnedModuleCodes?.includes(moduleCode)),badge=moduleCode?modulePresentation?.badges?.[moduleCode]:undefined;return createElement("div",{className:"athyper-experience__module-card"},renderVisual(block.visual,registry),createElement("div",{className:"athyper-experience__module-meta"},createElement("span",{className:"athyper-experience__module-context"},"Available module"),badge?createElement("span",{className:"athyper-experience__module-badge"},badge):moduleCode&&modulePresentation?.badgesLoading?createElement("span",{className:"athyper-experience__module-badge athyper-experience__module-badge--loading","aria-hidden":true}):null),moduleCode&&modulePresentation?.onTogglePinned?createElement("button",{type:"button",className:"athyper-experience__module-pin","aria-label":`${pinned?"Unpin":"Pin"} ${block.title??"module"}`,"aria-pressed":pinned,title:pinned?"Unpin module":"Pin module",onClick:()=>modulePresentation.onTogglePinned?.(moduleCode)},createElement("span",{"aria-hidden":true},pinned?"★":"☆")):null,block.title&&primary?createElement("h2",null,createElement("a",{className:"athyper-experience__module-primary",href:registry.actions[primary.action]!(primary.input??{})},block.title)):block.title?createElement("h2",null,block.title):null,block.body?createElement("p",null,block.body):null,renderActions(secondary,registry)); }
function actionLink(action: ExperienceActionRef, registry: ExperienceRuntimeRegistry, label = action.label): ReactNode { return createElement("a", { key: `${action.action}:${label}`, href: registry.actions[action.action]!(action.input ?? {}) }, label); }
function renderVisual(visual: ExperienceVisual | undefined, registry: ExperienceRuntimeRegistry): ReactNode { if (!visual) return null; if (visual.kind === "image") return createElement("img", { src: registry.assets?.[visual.assetRef], alt: visual.alt, style: visual.focalPoint ? { objectPosition: `${visual.focalPoint.x * 100}% ${visual.focalPoint.y * 100}%` } : undefined }); const Icon = registry.icons?.[visual.key]; return Icon ? createElement(Icon) : createElement("span", { "aria-hidden": true, "data-icon": visual.key }); }
function escapePattern(value:string):string{return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
