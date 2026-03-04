"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EnumValuesEditor } from "./EnumValuesEditor";
import { JsonSchemaHelper } from "./JsonSchemaHelper";
import { ReferenceFieldConfig } from "./ReferenceFieldConfig";

import type { LookupConfig } from "./ReferenceFieldConfig";
import type { FieldDefinition } from "@/lib/schema-manager/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";



// ─── Reserved Names ──────────────────────────────────────────

const RESERVED_FIELD_NAMES = new Set([
    "id", "tenant_id", "realm_id",
    "created_at", "created_by", "updated_at", "updated_by",
    "deleted_at", "deleted_by", "version",
]);

// ─── Unsafe Type Casts ──────────────────────────────────────

const UNSAFE_TYPE_CHANGES: Record<string, Set<string>> = {
    boolean: new Set(["json", "reference", "enum"]),
    json: new Set(["boolean", "integer", "number", "decimal", "uuid", "date", "datetime"]),
    reference: new Set(["boolean", "json"]),
    uuid: new Set(["integer", "number", "decimal", "boolean"]),
};

function isUnsafeTypeCast(from: string, to: string): boolean {
    return UNSAFE_TYPE_CHANGES[from]?.has(to) ?? false;
}

// ─── Constants ───────────────────────────────────────────────

const DATA_TYPES = [
    "string", "text", "number", "integer", "decimal",
    "boolean", "date", "datetime", "uuid",
    "reference", "enum", "json",
] as const;

const UI_TYPES = [
    "text", "textarea", "number", "toggle", "select",
    "datepicker", "reference-picker", "json-editor", "hidden",
] as const;

// ─── Schema Builder ──────────────────────────────────────────

function buildFieldSchema(existingFields: FieldDefinition[], editingFieldId?: string) {
    return z.object({
        name: z.string()
            .min(1, "Field name is required")
            .regex(/^[a-z][a-z0-9_]*$/, "Must be snake_case (lowercase, numbers, underscores)")
            .refine(
                (name) => !RESERVED_FIELD_NAMES.has(name),
                (name) => ({ message: `'${name}' is a reserved system field name` }),
            )
            .refine(
                (name) => {
                    const duplicate = existingFields.find(
                        (f) => f.name === name && f.id !== editingFieldId,
                    );
                    return !duplicate;
                },
                "A field with this name already exists",
            ),
        columnName: z.string()
            .min(1, "Column name is required")
            .refine(
                (col) => {
                    const duplicate = existingFields.find(
                        (f) => f.columnName === col && f.id !== editingFieldId,
                    );
                    return !duplicate;
                },
                "A field with this column name already exists",
            ),
        dataType: z.string().min(1, "Data type is required"),
        uiType: z.string().nullable(),
        isRequired: z.boolean(),
        isUnique: z.boolean(),
        isSearchable: z.boolean(),
        isFilterable: z.boolean(),
        defaultValue: z.string(),
        validationJson: z.string(),
    });
}

type FieldFormValues = z.infer<ReturnType<typeof buildFieldSchema>>;

// ─── Component ───────────────────────────────────────────────

interface FieldFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    field: FieldDefinition | null;
    existingFields?: FieldDefinition[];
    onSubmit: (values: FieldFormValues) => void;
}

export function FieldFormDialog({ open, onOpenChange, field, existingFields = [], onSubmit }: FieldFormDialogProps) {
    const isEditing = field !== null;

    // Type-specific state
    const existingLookup = field?.validation as Record<string, unknown> | undefined;
    const [lookupConfig, setLookupConfig] = useState<LookupConfig>({
        targetEntity: (existingLookup?.targetEntity as string) ?? "",
        targetKey: (existingLookup?.targetKey as string) ?? "id",
        onDelete: (existingLookup?.onDelete as LookupConfig["onDelete"]) ?? "restrict",
    });
    const [enumValues, setEnumValues] = useState<string[]>(
        () => (field?.validation as Record<string, unknown>)?.allowedValues as string[] ?? [],
    );

    const schema = useMemo(
        () => buildFieldSchema(existingFields, field?.id),
        [existingFields, field?.id],
    );

    const form = useForm<FieldFormValues>({
        resolver: zodResolver(schema as any),
        defaultValues: {
            name: field?.name ?? "",
            columnName: field?.columnName ?? "",
            dataType: field?.dataType ?? "string",
            uiType: field?.uiType ?? null,
            isRequired: field?.isRequired ?? false,
            isUnique: field?.isUnique ?? false,
            isSearchable: field?.isSearchable ?? false,
            isFilterable: field?.isFilterable ?? false,
            defaultValue: field?.defaultValue ? JSON.stringify(field.defaultValue) : "",
            validationJson: field?.validation ? JSON.stringify(field.validation, null, 2) : "",
        },
    });

    const handleSubmit = (values: FieldFormValues) => {
        const dt = values.dataType;
        const finalValues = { ...values };

        if (dt === "reference" && lookupConfig.targetEntity) {
            finalValues.validationJson = JSON.stringify(lookupConfig);
        } else if (dt === "enum" && enumValues.length > 0) {
            finalValues.validationJson = JSON.stringify({ allowedValues: enumValues });
        }

        onSubmit(finalValues);
        onOpenChange(false);
    };

    // Sync column name with field name when creating
    const watchName = form.watch("name");
    if (!isEditing && form.getValues("columnName") === "") {
        form.setValue("columnName", watchName);
    }

    // Type change warning for existing fields
    const watchDataType = form.watch("dataType");
    const typeChangeWarning = isEditing && field?.dataType && watchDataType !== field.dataType
        ? isUnsafeTypeCast(field.dataType, watchDataType)
            ? `Changing from '${field.dataType}' to '${watchDataType}' may cause data loss. This is a potentially unsafe type cast.`
            : `Type will change from '${field.dataType}' to '${watchDataType}'.`
        : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEditing ? "Edit Field" : "Add Field"}</DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? `Modify the configuration for "${field.name}".`
                            : "Define a new field for this entity version."}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field: f }) => (
                                    <FormItem>
                                        <FormLabel>Field Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="unit_price" {...f} className="font-mono" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="columnName"
                                render={({ field: f }) => (
                                    <FormItem>
                                        <FormLabel>Column Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="unit_price" {...f} className="font-mono" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="dataType"
                                render={({ field: f }) => (
                                    <FormItem>
                                        <FormLabel>Data Type</FormLabel>
                                        <Select onValueChange={f.onChange} value={f.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {DATA_TYPES.map((t) => (
                                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="uiType"
                                render={({ field: f }) => (
                                    <FormItem>
                                        <FormLabel>UI Type</FormLabel>
                                        <Select
                                            onValueChange={(v) => f.onChange(v === "__none__" ? null : v)}
                                            value={f.value ?? "__none__"}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Auto-detect" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="__none__">Auto-detect</SelectItem>
                                                {UI_TYPES.map((t) => (
                                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Type change warning */}
                        {typeChangeWarning && (
                            <div className="rounded-md border border-warning/50 bg-warning/5 p-3 flex items-start gap-2">
                                <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
                                <div className="text-xs">
                                    <p className="text-warning font-medium">{typeChangeWarning}</p>
                                    {isUnsafeTypeCast(field?.dataType ?? "", watchDataType) && (
                                        <Badge variant="destructive" className="text-[10px] mt-1">
                                            Breaking Change
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Type-specific sub-forms */}
                        {watchDataType === "reference" && (
                            <ReferenceFieldConfig value={lookupConfig} onChange={setLookupConfig} />
                        )}
                        {watchDataType === "enum" && (
                            <EnumValuesEditor values={enumValues} onChange={setEnumValues} />
                        )}
                        {watchDataType === "json" && (
                            <FormField
                                control={form.control}
                                name="validationJson"
                                render={({ field: f }) => (
                                    <JsonSchemaHelper value={f.value} onChange={f.onChange} />
                                )}
                            />
                        )}

                        <Separator />

                        <div className="space-y-3">
                            <p className="text-sm font-medium">Constraints</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {(["isRequired", "isUnique", "isSearchable", "isFilterable"] as const).map(
                                    (flag) => (
                                        <FormField
                                            key={flag}
                                            control={form.control}
                                            name={flag}
                                            render={({ field: f }) => (
                                                <FormItem className="flex items-center gap-2 space-y-0">
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={f.value}
                                                            onCheckedChange={f.onChange}
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="font-normal text-sm">
                                                        {flag.replace("is", "")}
                                                    </FormLabel>
                                                </FormItem>
                                            )}
                                        />
                                    ),
                                )}
                            </div>
                        </div>

                        <Separator />

                        <FormField
                            control={form.control}
                            name="defaultValue"
                            render={({ field: f }) => (
                                <FormItem>
                                    <FormLabel>Default Value</FormLabel>
                                    <FormControl>
                                        <Input placeholder='e.g., "active" or 0' {...f} className="font-mono" />
                                    </FormControl>
                                    <FormDescription>JSON-encoded default value.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="validationJson"
                            render={({ field: f }) => (
                                <FormItem>
                                    <FormLabel>Validation Rules (JSON)</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder='{"minLength": 1, "maxLength": 255}'
                                            rows={4}
                                            className="font-mono text-xs"
                                            {...f}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        JSON object with validation constraints (minLength, maxLength, pattern, min, max, etc.).
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button type="submit">
                                {isEditing ? "Save Changes" : "Add Field"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
