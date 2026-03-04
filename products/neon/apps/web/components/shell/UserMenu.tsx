"use client";

// components/shell/UserMenu.tsx
//
// User avatar dropdown in the header bar.
// Thin wrapper around shared user-menu components.

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserMenuModel } from "@/lib/user-menu/use-user-menu-model";

import {
    ExperienceSection,
    LogoutSection,
    OperationalSection,
    TenantManagementSection,
    UserMenuHeader,
} from "./user-menu";

interface UserMenuProps {
    workbench: string;
}

export function UserMenu({ workbench }: UserMenuProps) {
    const model = useUserMenuModel();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar className="size-8">
                        <AvatarFallback
                            className="text-xs"
                            style={{
                                backgroundColor: model.avatarColor.bg,
                                color: model.avatarColor.fg,
                            }}
                        >
                            {model.initials}
                        </AvatarFallback>
                    </Avatar>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="p-0 font-normal">
                    <UserMenuHeader model={model} variant="dropdown" />
                </DropdownMenuLabel>
                <TenantManagementSection model={model} workbench={workbench} variant="dropdown" />
                <OperationalSection model={model} workbench={workbench} variant="dropdown" />
                <ExperienceSection model={model} variant="dropdown" />
                <LogoutSection model={model} variant="dropdown" />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
