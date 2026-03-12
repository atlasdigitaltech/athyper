"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";
import { useModules } from "@/lib/schema-manager/use-modules";

// ─── Constants ───────────────────────────────────────────────

const ENTITY_CLASSES = [
    { value: "REFERENCE", label: "Reference", hint: "Lookup / config data" },
    { value: "MASTER", label: "Master", hint: "Core business entities" },
    { value: "DOCUMENT", label: "Document", hint: "Lifecycle-managed documents" },
    { value: "CONTROL", label: "Control", hint: "Configuration / rules" },
    { value: "LEDGER", label: "Ledger", hint: "Immutable append-only records" },
    { value: "LOG", label: "Log", hint: "Operational event streams" },
] as const;

/** Smart default: entityClass → governance level */
const CLASS_GOVERNANCE_DEFAULT: Record<string, string> = {
    REFERENCE: "light",
    MASTER: "full",
    DOCUMENT: "full",
    CONTROL: "light",
    LEDGER: "full",
    LOG: "audit_only",
};

const GOVERNANCE_LEVELS = [
    { value: "full", label: "Full" },
    { value: "light", label: "Light" },
    { value: "audit_only", label: "Audit Only" },
] as const;


/** All user-created entities live in the "custom" schema. */
const CUSTOM_SCHEMA = "custom";

// ─── Schema ──────────────────────────────────────────────────

const entityFormSchema = z.object({
    name: z
        .string()
        .min(1, "Name is required")
        .max(128, "Name must be ≤ 128 characters")
        .regex(/^[a-z][a-z0-9_]*$/, "Must be lowercase snake_case starting with a letter"),
    entityClass: z.enum(["REFERENCE", "MASTER", "DOCUMENT", "CONTROL", "LEDGER", "LOG"]),
    moduleId: z.string().min(1, "Module is required"),
    tableSchema: z.string().min(1).max(63),
    tableName: z
        .string()
        .min(1, "Table name is required")
        .max(128, "Table name must be ≤ 128 characters")
        .regex(/^[a-z][a-z0-9_]*$/, "Must be lowercase snake_case starting with a letter"),
    governanceLevel: z.enum(["full", "light", "audit_only"]),
});

type EntityFormValues = z.infer<typeof entityFormSchema>;

// ─── Component ───────────────────────────────────────────────

interface EntityFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}

export function EntityFormDialog({ open, onOpenChange, onCreated }: EntityFormDialogProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { modules } = useModules();

    const form = useForm<EntityFormValues>({
        resolver: zodResolver(entityFormSchema),
        defaultValues: {
            name: "",
            entityClass: "DOCUMENT",
            moduleId: "",
            tableSchema: CUSTOM_SCHEMA,
            tableName: "",
            governanceLevel: "full",
        },
    });

    // Auto-set governance level when entityClass changes
    const watchClass = form.watch("entityClass");
    useEffect(() => {
        const defaultGov = CLASS_GOVERNANCE_DEFAULT[watchClass];
        if (defaultGov) {
            form.setValue("governanceLevel", defaultGov as EntityFormValues["governanceLevel"]);
        }
    }, [watchClass, form]);

    const handleSubmit = async (values: EntityFormValues) => {
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch("/api/admin/mesh/meta-studio", {
                method: "POST",
                headers: { ...buildHeaders(), "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ ...values, ownershipModel: "tenant" }),
            });

            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as {
                    error?: { message?: string };
                };
                throw new Error(
                    body.error?.message ?? `Failed to create entity (${res.status})`,
                );
            }

            form.reset();
            onOpenChange(false);
            onCreated();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create entity");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!submitting) { onOpenChange(v); setError(null); } }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>New Entity</DialogTitle>
                    <DialogDescription>
                        Define a new entity in the schema registry.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field: f }) => (
                                <FormItem>
                                    <FormLabel>Entity Name</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="purchase_order"
                                            className="font-mono"
                                            {...f}
                                            onChange={(e) => {
                                                f.onChange(e);
                                                // Auto-fill tableName if it's empty or matches the old name
                                                const oldName = form.getValues("name");
                                                const tbl = form.getValues("tableName");
                                                if (tbl === "" || tbl === oldName) {
                                                    form.setValue("tableName", e.target.value);
                                                }
                                            }}
                                        />
                                    </FormControl>
                                    <FormDescription>Lowercase snake_case identifier.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="moduleId"
                            render={({ field: f }) => (
                                <FormItem>
                                    <FormLabel>Module</FormLabel>
                                    <Select onValueChange={f.onChange} value={f.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select module" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {modules.map((m) => (
                                                <SelectItem key={m.code} value={m.code}>
                                                    {m.code} — {m.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>Owning business module.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="entityClass"
                            render={({ field: f }) => (
                                <FormItem>
                                    <FormLabel>Entity Class</FormLabel>
                                    <Select onValueChange={f.onChange} value={f.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select class" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {ENTITY_CLASSES.map((c) => (
                                                <SelectItem key={c.value} value={c.value}>
                                                    <span>{c.label}</span>
                                                    <span className="ml-1.5 text-muted-foreground text-xs">
                                                        — {c.hint}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="governanceLevel"
                            render={({ field: f }) => (
                                <FormItem>
                                    <FormLabel>Governance</FormLabel>
                                    <Select onValueChange={f.onChange} value={f.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {GOVERNANCE_LEVELS.map((g) => (
                                                <SelectItem key={g.value} value={g.value}>
                                                    {g.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="tableName"
                            render={({ field: f }) => (
                                <FormItem>
                                    <FormLabel>Table Name</FormLabel>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm text-muted-foreground font-mono shrink-0">
                                            {CUSTOM_SCHEMA}.
                                        </span>
                                        <FormControl>
                                            <Input placeholder="purchase_order" className="font-mono" {...f} />
                                        </FormControl>
                                    </div>
                                    <FormDescription>
                                        All custom entities are created in the <code className="text-xs">{CUSTOM_SCHEMA}</code> schema.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {error && (
                            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
                                <p className="text-xs text-destructive">{error}</p>
                            </div>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={submitting}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? "Creating..." : "Create Entity"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
