"use client";

import { useCallback, useEffect, useState } from "react";

import type { Node } from "@xyflow/react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";


// ─── Types ───────────────────────────────────────────────────

export interface StatePropertyData {
    name: string;
    code: string;
    isTerminal: boolean;
    description: string;
}

interface StatePropertyPanelProps {
    node: Node | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (nodeId: string, data: StatePropertyData) => void;
}

// ─── Component ───────────────────────────────────────────────

export function StatePropertyPanel({ node, open, onOpenChange, onSave }: StatePropertyPanelProps) {
    const stateData = node?.data as Record<string, unknown> | undefined;

    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [isTerminal, setIsTerminal] = useState(false);
    const [description, setDescription] = useState("");

    // Determine if code is immutable (non-temp, i.e., from server)
    const isCodeImmutable = node ? !node.id.startsWith("temp_") : false;

    // Sync form when node changes
    useEffect(() => {
        if (node && open) {
            const label = typeof stateData?.label === "string" ? stateData.label : "";
            const parts = label.split("\n");
            setName((stateData?.stateName as string) ?? parts[0] ?? "");
            setCode((stateData?.stateCode as string) ?? (parts[1]?.replace(/[()]/g, "") ?? ""));
            setIsTerminal((stateData?.isTerminal as boolean) ?? node.style?.borderRadius === "50%");
            setDescription((stateData?.description as string) ?? "");
        }
    }, [node, open, stateData]);

    const handleSave = useCallback(() => {
        if (!node) return;
        onSave(node.id, { name, code, isTerminal, description });
        onOpenChange(false);
    }, [node, name, code, isTerminal, description, onSave, onOpenChange]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[380px] sm:max-w-[380px]">
                <SheetHeader>
                    <SheetTitle>State Properties</SheetTitle>
                    <SheetDescription>
                        Edit the properties for this workflow state.
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium">Name</label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Under Review"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium">Code</label>
                        <Input
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="e.g., under_review"
                            className="font-mono text-xs"
                            disabled={isCodeImmutable}
                        />
                        {isCodeImmutable && (
                            <p className="text-xs text-muted-foreground">
                                Code cannot be changed for published states.
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <Checkbox
                            checked={isTerminal}
                            onCheckedChange={(checked) => setIsTerminal(checked === true)}
                        />
                        <label className="text-sm">Terminal state</label>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
                        When enabled, the workflow ends when this state is reached.
                    </p>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium">Description</label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional description for this state..."
                            rows={3}
                            className="text-xs"
                        />
                    </div>
                </div>

                <SheetFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={!name.trim() || !code.trim()}>
                        Save
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
