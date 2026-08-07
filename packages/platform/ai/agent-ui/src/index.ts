"use client";

export {
  AtlasProvider,
  type AtlasProviderProps,
  type AtlasThreadHistoryOptions,
} from "./provider/atlas-provider";
export {
  useAtlas,
  useOptionalAtlas,
  type AtlasContextValue,
  type AtlasAvailability,
  type AtlasRateLimitNotice,
  type AtlasSurfaceMode,
  type AtlasThreadHistoryContextValue,
} from "./provider/atlas-context";
export { useAtlasCatalog, type UseAtlasCatalogResult } from "./provider/use-atlas-catalog";
export { useAtlasContextBinding } from "./provider/use-atlas-context-binding";
export type { AtlasContextBinding } from "./provider/atlas-context-binding";
export { AtlasPanel } from "./surfaces/atlas-panel";
export { AtlasFullscreen } from "./surfaces/atlas-fullscreen";
export {
  AtlasShellWrapper,
  type AtlasShellWrapperProps,
  type AtlasShortcut,
} from "./shell/atlas-shell-wrapper";
export { MessageList } from "./conversation/message-list";
export { MessageBubble } from "./conversation/message-bubble";
export { Composer } from "./composer/composer";
export { ModelPicker } from "./composer/model-picker";
export { SuggestionStrip } from "./composer/suggestion-strip";
export { HistoryRail } from "./history/history-rail";
export {
  PROVIDER_ICONS,
  AnthropicIcon,
  OpenAiIcon,
  GeminiIcon,
  AtlasIcon,
  GenericProviderIcon,
  providerDisplayName,
  providerIcon,
} from "./composer/provider-icons";
export { AskAtlasPill } from "./triggers/ask-atlas-pill";
export { AskAtlasInput } from "./triggers/ask-atlas-input";
export {
  AtlasHeaderTrigger,
  type AtlasHeaderTriggerProps,
} from "./triggers/atlas-header-trigger";
export { ResultCard } from "./result-cards/result-card-registry";
