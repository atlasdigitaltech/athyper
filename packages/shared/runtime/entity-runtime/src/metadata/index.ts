export {
  DEFAULT_DISPLAY_CONFIG,
  type ResolvedDisplayConfig,
  type DetailRenderer,
  type ListRenderer,
  type ViewMode,
} from "./displayConfig.defaults";

export { resolvePresentationConfig } from "./displayConfig.resolve";

export {
  detailRendererMap,
  listRendererMap,
  registerLinesRenderer,
  resolveLinesRenderer,
  type LinesRenderer,
  type LinesRendererProps,
  type DetailRendererKey,
  type ListRendererKey,
} from "./renderer.registry";
