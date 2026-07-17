import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors, type SemanticColorSet, type SemanticIntent } from "@athyper/theme/semantic-colors";
import {
  adminStatusIntent,
  apArStatusIntent,
  closeRunStatusIntent,
  closeTaskStatusIntent,
  kanbanStatusIntent,
} from "@athyper/theme/domain-intents";

const SEMANTIC_RESOLVERS: Record<string, (value: string) => SemanticIntent> = {
  adminStatusIntent,
  apArStatusIntent,
  closeRunStatusIntent,
  closeTaskStatusIntent,
  kanbanStatusIntent,
};

export function resolveRuntimeStatusIntent(value: string, resolverName?: string): SemanticIntent {
  const resolverFn = resolverName ? SEMANTIC_RESOLVERS[resolverName] : undefined;
  return resolverFn ? resolverFn(value) : kanbanStatusIntent(value);
}

export function resolveRuntimeStatusColors(value: string, resolverName?: string): SemanticColorSet {
  return resolveSemanticColors(resolveRuntimeStatusIntent(value, resolverName));
}

export function runtimeStatusBarClass(value: string, resolverName?: string): string {
  return cn(resolveRuntimeStatusColors(value, resolverName).dot, "opacity-70");
}
