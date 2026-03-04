"use client";

// components/shell/user-menu/UserMenuHeader.tsx
//
// Identity & context section shown at the top of the user menu.
// Renders avatar (hash-colored), name (truncated + tooltip), role, tenant context.
// Adapts layout via variant prop for dropdown vs drawer surfaces.

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMessages } from "@/lib/i18n/messages-context";
import type { UserMenuModel } from "@/lib/user-menu/use-user-menu-model";

export interface UserMenuHeaderProps {
    model: UserMenuModel;
    variant: "dropdown" | "drawer";
}

export function UserMenuHeader({ model, variant }: UserMenuHeaderProps) {
    const { t } = useMessages();

    const nameNeedsTruncation = model.displayName.length > 28;
    const hasAdditionalRoles = model.additionalRoles.length > 0;
    const rolesText = model.additionalRoles.join(", ");

    return (
        <div className="p-0 font-normal">
            <div className={variant === "drawer"
                ? "flex items-center gap-2 px-1 py-1.5"
                : "flex items-center gap-2 px-2 py-2"
            }>
                <Avatar className={variant === "drawer" ? "size-8 rounded-lg" : "size-8"}>
                    <AvatarFallback
                        className={variant === "drawer"
                            ? "rounded-lg text-xs"
                            : "text-xs"
                        }
                        style={{
                            backgroundColor: model.avatarColor.bg,
                            color: model.avatarColor.fg,
                        }}
                    >
                        {model.initials}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    {/* Name with tooltip on truncation */}
                    {nameNeedsTruncation ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <p className="truncate text-sm font-semibold">
                                    {model.truncatedName}
                                </p>
                            </TooltipTrigger>
                            <TooltipContent>
                                {model.displayName}
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <p className="truncate text-sm font-semibold">
                            {model.displayName}
                        </p>
                    )}

                    {/* Role/Persona with tooltip for additional roles */}
                    {hasAdditionalRoles ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <p className="truncate text-xs capitalize text-muted-foreground">
                                    {model.persona}
                                </p>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t("user.menu.alsoRoles", `Also: ${rolesText}`)}
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <p className="truncate text-xs capitalize text-muted-foreground">
                            {model.persona}
                        </p>
                    )}

                    {/* Tenant context */}
                    <p className="truncate text-xs text-muted-foreground/70">
                        {model.tenantDisplayName}
                    </p>
                </div>
            </div>

            {/* Platform admin "Operating As" badge */}
            {model.isPlatformAdmin && model.selectedTenantId && (
                <div className="px-2 pb-1.5">
                    <Badge variant="outline" className="h-5 text-xs">
                        {t("user.menu.operatingAs", "Operating As")}:{" "}
                        {model.selectedTenantId}
                    </Badge>
                </div>
            )}
        </div>
    );
}
