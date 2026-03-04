"use client";

import { Search } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { useMessages } from "@/lib/i18n/messages-context";

interface SearchDialogProps {
    compact?: boolean;
}

export function SearchDialog({ compact }: SearchDialogProps) {
    const [open, setOpen] = React.useState(false);
    const { t } = useMessages();

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((o) => !o);
            }
        };
        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    return (
        <>
            {compact ? (
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setOpen(true)}
                    aria-label={t("common.header.search")}
                >
                    <Search className="size-4" />
                </Button>
            ) : (
                <Button
                    variant="link"
                    className="!px-0 font-normal text-muted-foreground hover:no-underline"
                    onClick={() => setOpen(true)}
                >
                    <Search className="size-4" />
                    {t("common.header.search")}
                    <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px]">
                        <span className="text-xs">&#x2318;</span>J
                    </kbd>
                </Button>
            )}
            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput placeholder={t("common.header.search_placeholder")} />
                <CommandList>
                    <CommandEmpty>{t("common.header.no_results")}</CommandEmpty>
                    <CommandGroup heading={t("common.header.quick_actions")}>
                        <CommandItem onSelect={() => setOpen(false)}>
                            <span>{t("common.header.go_to_dashboard")}</span>
                        </CommandItem>
                        <CommandItem onSelect={() => setOpen(false)}>
                            <span>{t("common.header.go_to_settings")}</span>
                        </CommandItem>
                        <CommandItem
                            onSelect={() => {
                                setOpen(false);
                                // Open GlobalCommandPalette via its Ctrl+K listener
                                requestAnimationFrame(() => {
                                    window.dispatchEvent(
                                        new KeyboardEvent("keydown", {
                                            key: "k",
                                            ctrlKey: true,
                                            bubbles: true,
                                        }),
                                    );
                                });
                            }}
                        >
                            <span>{t("common.header.go_to_command_palette")}</span>
                            <kbd className="ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px]">
                                <span className="text-xs">&#x2318;</span>K
                            </kbd>
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </CommandDialog>
        </>
    );
}
