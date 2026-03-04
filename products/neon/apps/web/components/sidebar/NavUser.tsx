"use client";

import {
    BadgeCheck,
    ChevronsUpDown,
    LogOut,
    Stethoscope,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { SessionBootstrap } from "@/lib/session-bootstrap";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar";
import { useMessages } from "@/lib/i18n/messages-context";


function getInitials(name: string): string {
    return name
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

export function NavUser() {
    const { isMobile } = useSidebar();
    const router = useRouter();
    const { t } = useMessages();
    const [bootstrap, setBootstrap] = useState<SessionBootstrap | undefined>(undefined);

    useEffect(() => {
        const bs = (window as any).__SESSION_BOOTSTRAP__ as SessionBootstrap | undefined;
        if (bs) setBootstrap(bs);
    }, []);

    const displayName = bootstrap?.displayName ?? "User";
    const persona = bootstrap?.persona ?? "viewer";
    const initials = getInitials(displayName);

    async function handleLogout() {
        try {
            const csrfToken = bootstrap?.csrfToken ?? "";
            const res = await fetch("/api/auth/logout", {
                method: "POST",
                headers: { "x-csrf-token": csrfToken },
            });
            const data = (await res.json()) as { logoutUrl?: string };
            if (data.logoutUrl) {
                window.location.href = data.logoutUrl;
            } else {
                window.location.href = "/login";
            }
        } catch {
            window.location.href = "/login";
        }
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <Avatar className="size-8 rounded-lg">
                                <AvatarFallback className="rounded-lg text-xs">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                            <div className="grid flex-1 text-start text-sm leading-tight">
                                <span className="truncate font-semibold">{displayName}</span>
                                <span className="truncate text-xs text-muted-foreground capitalize">{persona}</span>
                            </div>
                            <ChevronsUpDown className="ms-auto size-4" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                        side={isMobile ? "bottom" : "right"}
                        align="end"
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                                <Avatar className="size-8 rounded-lg">
                                    <AvatarFallback className="rounded-lg text-xs">
                                        {initials}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="grid flex-1 text-start text-sm leading-tight">
                                    <span className="truncate font-semibold">{displayName}</span>
                                    <span className="truncate text-xs text-muted-foreground capitalize">{persona}</span>
                                </div>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem>
                                <BadgeCheck className="me-2 size-4" />
                                {t("common.user.account")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => {
                                    const wb = bootstrap?.workbench ?? "user";
                                    router.push(`/wb/${wb}/settings/debug`);
                                }}
                            >
                                <Stethoscope className="me-2 size-4" />
                                {t("common.user.diagnostics")}
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout}>
                            <LogOut className="me-2 size-4" />
                            {t("common.user.logout")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
