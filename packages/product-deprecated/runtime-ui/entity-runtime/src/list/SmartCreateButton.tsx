"use client";

import { Plus } from "lucide-react";
import type { CompiledEntity, EntityOperation } from "@athyper/api-contracts/metadata";
import {
  appEntityNewHref,
  entitySlugFromCode,
  normalizeAppEntityHref,
} from "@athyper/runtime-shared/core";
import {
  Button,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@athyper/ui/primitives";

export interface SmartCreateButtonProps {
  entity: CompiledEntity;
  operations: EntityOperation[] | null;
  className?: string;
}

interface CreateResolution {
  href: string | null;
  disabledReason: string | null;
}

export function SmartCreateButton({ entity, operations, className }: SmartCreateButtonProps) {
  if (operations === null) {
    return <Skeleton className="h-8 w-24" />;
  }

  const resolution = resolveSmartCreateHref(entity, operations);
  if (!resolution.href && !resolution.disabledReason) {
    return null;
  }

  const button = (
    <Button
      asChild={Boolean(resolution.href)}
      size="sm"
      disabled={!resolution.href}
      className={className}
      aria-label={`Create ${entity.entity_name}`}
    >
      {resolution.href ? (
        <a href={resolution.href}>
          <Plus className="size-4" />
          Create
        </a>
      ) : (
        <>
          <Plus className="size-4" />
          Create
        </>
      )}
    </Button>
  );

  if (!resolution.href && resolution.disabledReason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex cursor-not-allowed">
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64 text-xs">
            {resolution.disabledReason}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}

export function resolveSmartCreateHref(
  entity: CompiledEntity,
  operations: EntityOperation[],
): CreateResolution {
  const staticBlockReason = staticCreateBlockReason(entity);
  if (staticBlockReason) {
    return { href: null, disabledReason: staticBlockReason };
  }

  const createOp = operations.find(isCreateOperation);
  if (!createOp) {
    return {
      href: null,
      disabledReason: null,
    };
  }

  if (!createOp.is_enabled) {
    return {
      href: null,
      disabledReason:
        createOp.disabled_reason ??
        `You do not have permission to create ${entity.entity_name} records`,
    };
  }

  if (createOp.disabled_reason) {
    return {
      href: null,
      disabledReason: createOp.disabled_reason,
    };
  }

  if (createOp.handler_type === "NAVIGATE" && createOp.handler_target) {
    return {
      href: normalizeCreateHref(expandCreateHrefTemplate(createOp.handler_target, entity)),
      disabledReason: null,
    };
  }

  const redirect = entity.display_config.create_redirect;
  if (redirect?.href_template) {
    return {
      href: normalizeCreateHref(expandCreateHrefTemplate(redirect.href_template, entity)),
      disabledReason: null,
    };
  }

  return {
    href: appEntityNewHref(entity.entity_code),
    disabledReason: null,
  };
}

export function isCreateOperation(op: EntityOperation): boolean {
  if (op.is_record_required) return false;
  if (op.surface !== "LIST" && op.surface !== "BOTH") return false;

  return isCreatePermissionCode(op.permission_code);
}

export function isCreatePermissionCode(permissionCode: string): boolean {
  const tokens = actionTokens(permissionCode);
  return (
    tokens.has("create") ||
    tokens.has("new") ||
    tokens.has("insert") ||
    tokens.has("add")
  );
}

function actionTokens(permissionCode: string): Set<string> {
  return new Set(
    permissionCode
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .split("_")
      .filter(Boolean),
  );
}

function staticCreateBlockReason(entity: CompiledEntity): string | null {
  if (entity.feature_flags.is_hidden) {
    return `${entity.entity_name} is hidden in this runtime`;
  }
  if (entity.feature_flags.records_api_disabled || entity.feature_flags.generic_runtime_disabled) {
    return `${entity.entity_name} records are not managed by the generic runtime`;
  }
  if (entity.feature_flags.is_readonly || entity.mutability === "immutable") {
    return `${entity.entity_name} is read-only`;
  }
  return null;
}

function expandCreateHrefTemplate(template: string, entity: CompiledEntity): string {
  return template
    .replaceAll("{entity_code}", entity.entity_code)
    .replaceAll("{entityCode}", entity.entity_code)
    .replaceAll("{entity}", entitySlugFromCode(entity.entity_code));
}

function normalizeCreateHref(href: string): string {
  if (!href.startsWith("/app/")) return href;
  return normalizeAppEntityHref(href);
}
