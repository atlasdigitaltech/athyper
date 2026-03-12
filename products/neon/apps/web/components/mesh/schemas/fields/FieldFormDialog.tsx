"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, HelpCircle, Lock } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DefaultValueEditor } from "./DefaultValueEditor";
import { EnumValuesEditor } from "./EnumValuesEditor";
import { FieldBehaviorRuleList } from "./FieldBehaviorRuleList";
import { FieldEntityRulesSummary } from "./FieldEntityRulesSummary";
import { FieldValidationEditor } from "./FieldValidationEditor";
import { JsonSchemaHelper } from "./JsonSchemaHelper";
import { ReferenceFieldConfig } from "./ReferenceFieldConfig";

import type { DefaultValueConfig } from "./DefaultValueEditor";
import type { LookupConfig } from "./ReferenceFieldConfig";
import type { ValidationRule } from "@/lib/schema-manager/use-entity-validation";
import type {
    EditabilityRule,
    FieldDefinition,
    VisibilityRule,
} from "@/lib/schema-manager/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    Form,
    FormControl,
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
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Hint Label ─────────────────────────────────────────────

function HintLabel({ children, hint }: { children: ReactNode; hint: string }) {
    return (
        <FormLabel className="inline-flex items-center gap-1">
            {children}
            <Tooltip>
                <TooltipTrigger type="button" tabIndex={-1} className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-52">
                    {hint}
                </TooltipContent>
            </Tooltip>
        </FormLabel>
    );
}

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
    "multi-select", "datepicker", "datetimepicker",
    "reference-picker", "reference-multi-picker",
    "json-editor", "hidden",
] as const;

const LAYOUT_OPTIONS = [
    { value: "full", label: "Full width" },
    { value: "half", label: "Half (2-col)" },
    { value: "third", label: "Third (3-col)" },
] as const;

const DENSITY_OPTIONS = [
    { value: "compact", label: "Compact" },
    { value: "normal", label: "Normal" },
    { value: "comfortable", label: "Comfortable" },
] as const;

const VISIBILITY_OPTIONS = [
    { value: "visible", label: "Visible" },
    { value: "hidden", label: "Hidden" },
    { value: "internal", label: "Internal" },
] as const;

const EDITABILITY_OPTIONS = [
    { value: "editable", label: "Editable" },
    { value: "read_only", label: "Read-only" },
    { value: "system_managed", label: "System Managed" },
    { value: "computed", label: "Computed" },
] as const;

/** Contextual semantic formats per data type */
const FORMAT_OPTIONS: Record<string, string[]> = {
    string: ["email", "phone", "url", "password", "color", "country", "timezone", "ip_address", "slug"],
    text: ["markdown", "html"],
    decimal: ["money", "percent"],
    integer: ["percent"],
};

/** Cardinality options */
const CARDINALITY_OPTIONS = [
    { value: "one", label: "One (scalar)" },
    { value: "many", label: "Many (array)" },
] as const;

// ─── Schema Builder ──────────────────────────────────────────

/** Convert a display name to snake_case for use as column/field key */
function toSnakeCase(str: string): string {
    return str
        .trim()
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[\s\-./]+/g, "_")
        .replace(/[^a-z0-9_]/gi, "")
        .toLowerCase()
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

function buildFieldSchema(existingFields: FieldDefinition[], editingFieldId?: string) {
    return z.object({
        name: z.string()
            .min(1, "Display name is required"),
        label: z.string(),
        columnName: z.string()
            .min(1, "Column name is required")
            .regex(/^[a-z][a-z0-9_]*$/, "Must be snake_case (lowercase, numbers, underscores)")
            .refine(
                (col) => !RESERVED_FIELD_NAMES.has(col),
                (col) => ({ message: `'${col}' is a reserved system column name` }),
            )
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
        format: z.string().nullable(),
        cardinality: z.string(),
        unit: z.string(),
        isRequired: z.boolean(),
        isUnique: z.boolean(),
        isSearchable: z.boolean(),
        isFilterable: z.boolean(),
        defaultValue: z.string(),
        validationJson: z.string(),
        // UI Behavior
        viewType: z.string().nullable(),
        editType: z.string().nullable(),
        layout: z.string(),
        density: z.string(),
        isHidden: z.boolean(),
        isDisabled: z.boolean(),
        isReadOnly: z.boolean(),
        lockOnEdit: z.boolean(),
        // Visibility rules
        visibilityCreate: z.string(),
        visibilityView: z.string(),
        visibilityEdit: z.string(),
        // Editability rules
        editabilityCreate: z.string(),
        editabilityEdit: z.string(),
    });
}

type FieldFormValues = z.infer<ReturnType<typeof buildFieldSchema>>;

// ─── Component ───────────────────────────────────────────────

interface FieldFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    field: FieldDefinition | null;
    existingFields?: FieldDefinition[];
    /** Entity-level validation rules (for cross-reference display) */
    entityValidationRules?: ValidationRule[];
    /** Entity name for navigation links */
    entityName?: string;
    /** When true, the form is view-only (published/archived version) */
    readonly?: boolean;
    onSubmit: (values: FieldFormValues) => void;
}

export function FieldFormDialog({ open, onOpenChange, field, existingFields = [], entityValidationRules = [], entityName = "", readonly = false, onSubmit }: FieldFormDialogProps) {
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
    const [visibilityRules, setVisibilityRules] = useState<VisibilityRule[]>(
        () => field?.visibility?.rules ?? [],
    );
    const [editabilityRules, setEditabilityRules] = useState<EditabilityRule[]>(
        () => field?.editability?.rules ?? [],
    );

    // Default value config: parse from existing JSON string or raw value
    const [defaultValueConfig, setDefaultValueConfig] = useState<DefaultValueConfig>(() => {
        const raw = field?.defaultValue;
        if (!raw) return { staticValue: "", conditionals: [] };
        // Try to parse structured config
        if (typeof raw === "object" && raw !== null && "staticValue" in (raw as Record<string, unknown>)) {
            const obj = raw as Record<string, unknown>;
            return {
                staticValue: String(obj.staticValue ?? ""),
                conditionals: Array.isArray(obj.conditionals) ? obj.conditionals as DefaultValueConfig["conditionals"] : [],
            };
        }
        // Legacy: plain scalar default
        return { staticValue: typeof raw === "string" ? raw : JSON.stringify(raw), conditionals: [] };
    });

    // Collect sibling field names for condition builder dropdowns
    const siblingFieldNames = useMemo(
        () => existingFields.filter((f) => f.id !== field?.id).map((f) => f.name),
        [existingFields, field?.id],
    );

    const schema = useMemo(
        () => buildFieldSchema(existingFields, field?.id),
        [existingFields, field?.id],
    );

    const getFormValues = (f: FieldDefinition | null): FieldFormValues => ({
        name: f?.name ?? "",
        label: f?.label ?? "",
        columnName: f?.columnName ?? "",
        dataType: f?.dataType ?? "string",
        uiType: f?.uiType ?? null,
        format: f?.format ?? null,
        cardinality: f?.cardinality ?? "one",
        unit: f?.unit ?? "",
        isRequired: f?.isRequired ?? false,
        isUnique: f?.isUnique ?? false,
        isSearchable: f?.isSearchable ?? false,
        isFilterable: f?.isFilterable ?? false,
        defaultValue: f?.defaultValue ? JSON.stringify(f.defaultValue) : "",
        validationJson: f?.validation ? JSON.stringify(f.validation, null, 2) : "",
        // UI Behavior
        viewType: (f?.uiHint as any)?.viewType ?? null,
        editType: (f?.uiHint as any)?.editType ?? null,
        layout: (f?.uiHint as any)?.layout ?? "half",
        density: (f?.uiHint as any)?.density ?? "normal",
        isHidden: (f?.uiHint as any)?.hidden ?? false,
        isDisabled: (f?.uiHint as any)?.disabled ?? false,
        isReadOnly: f?.isReadOnly ?? false,
        lockOnEdit: (f?.uiHint as any)?.lockOnEdit ?? false,
        // Visibility rules (read from defaults sub-object)
        visibilityCreate: f?.visibility?.defaults?.create ?? "visible",
        visibilityView: f?.visibility?.defaults?.view ?? "visible",
        visibilityEdit: f?.visibility?.defaults?.edit ?? "visible",
        // Editability rules (read from defaults sub-object)
        editabilityCreate: f?.editability?.defaults?.create ?? "editable",
        editabilityEdit: f?.editability?.defaults?.edit ?? "editable",
    });

    const form = useForm<FieldFormValues>({
        resolver: zodResolver(schema as any),
        defaultValues: getFormValues(field),
    });

    // Reset form when dialog opens or field changes
    useEffect(() => {
        if (open) {
            form.reset(getFormValues(field));
            // Reset type-specific state
            const lookup = field?.validation as Record<string, unknown> | undefined;
            setLookupConfig({
                targetEntity: (lookup?.targetEntity as string) ?? "",
                targetKey: (lookup?.targetKey as string) ?? "id",
                onDelete: (lookup?.onDelete as LookupConfig["onDelete"]) ?? "restrict",
            });
            setEnumValues(
                (field?.validation as Record<string, unknown>)?.allowedValues as string[] ?? [],
            );
            setVisibilityRules(field?.visibility?.rules ?? []);
            setEditabilityRules(field?.editability?.rules ?? []);
            // Reset default value config
            const raw = field?.defaultValue;
            if (raw && typeof raw === "object" && raw !== null && "staticValue" in (raw as Record<string, unknown>)) {
                const obj = raw as Record<string, unknown>;
                setDefaultValueConfig({
                    staticValue: String(obj.staticValue ?? ""),
                    conditionals: Array.isArray(obj.conditionals) ? obj.conditionals as DefaultValueConfig["conditionals"] : [],
                });
            } else {
                setDefaultValueConfig({
                    staticValue: raw ? (typeof raw === "string" ? raw : JSON.stringify(raw)) : "",
                    conditionals: [],
                });
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, field?.id]);

    const handleSubmit = (values: FieldFormValues) => {
        const dt = values.dataType;
        const finalValues = { ...values };

        if (dt === "reference" && lookupConfig.targetEntity) {
            finalValues.validationJson = JSON.stringify(lookupConfig);
        } else if (dt === "enum" && enumValues.length > 0) {
            finalValues.validationJson = JSON.stringify({ allowedValues: enumValues });
        }

        // Assemble uiHint from UI behavior fields (only include non-default values)
        const uiHint: Record<string, unknown> = {};
        if (values.viewType) uiHint.viewType = values.viewType;
        if (values.editType) uiHint.editType = values.editType;
        if (values.layout && values.layout !== "half") uiHint.layout = values.layout;
        if (values.density && values.density !== "normal") uiHint.density = values.density;
        if (values.isHidden) uiHint.hidden = true;
        if (values.isDisabled) uiHint.disabled = true;
        if (values.lockOnEdit) uiHint.lockOnEdit = true;
        // Attach assembled uiHint to finalValues for the parent to persist
        (finalValues as any).uiHint = Object.keys(uiHint).length > 0 ? uiHint : null;

        // Assemble default value (structured if conditional defaults exist)
        if (defaultValueConfig.conditionals.length > 0) {
            (finalValues as any).defaultValue = JSON.stringify(defaultValueConfig);
        } else if (defaultValueConfig.staticValue) {
            finalValues.defaultValue = defaultValueConfig.staticValue;
        } else {
            finalValues.defaultValue = "";
        }

        // Assemble visibility config (defaults + conditional rules)
        const visDefaults: Record<string, string> = {};
        if (values.visibilityCreate !== "visible") visDefaults.create = values.visibilityCreate;
        if (values.visibilityView !== "visible") visDefaults.view = values.visibilityView;
        if (values.visibilityEdit !== "visible") visDefaults.edit = values.visibilityEdit;
        const hasVisData = Object.keys(visDefaults).length > 0 || visibilityRules.length > 0;
        (finalValues as any).visibility = hasVisData
            ? {
                defaults: Object.keys(visDefaults).length > 0 ? visDefaults : undefined,
                rules: visibilityRules.length > 0 ? visibilityRules : undefined,
            }
            : null;

        // Assemble editability config (defaults + conditional rules)
        const editDefaults: Record<string, string> = {};
        if (values.editabilityCreate !== "editable") editDefaults.create = values.editabilityCreate;
        if (values.editabilityEdit !== "editable") editDefaults.edit = values.editabilityEdit;
        const hasEditData = Object.keys(editDefaults).length > 0 || editabilityRules.length > 0;
        (finalValues as any).editability = hasEditData
            ? {
                defaults: Object.keys(editDefaults).length > 0 ? editDefaults : undefined,
                rules: editabilityRules.length > 0 ? editabilityRules : undefined,
            }
            : null;

        onSubmit(finalValues);
        onOpenChange(false);
    };

    // Sync column name from display name when creating a new field
    const watchName = form.watch("name");
    useEffect(() => {
        if (!isEditing && watchName) {
            const snake = toSnakeCase(watchName);
            form.setValue("columnName", snake);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watchName, isEditing]);

    // Type change warning for existing fields
    const watchDataType = form.watch("dataType");
    const typeChangeWarning = isEditing && field?.dataType && watchDataType !== field.dataType
        ? isUnsafeTypeCast(field.dataType, watchDataType)
            ? `Changing from '${field.dataType}' to '${watchDataType}' may cause data loss. This is a potentially unsafe type cast.`
            : `Type will change from '${field.dataType}' to '${watchDataType}'.`
        : null;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" resizable defaultWidth={560} className="w-full overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>{readonly ? "View Field" : isEditing ? "Edit Field" : "Add Field"}</SheetTitle>
                    <SheetDescription>
                        {readonly
                            ? `Viewing configuration for "${field?.name ?? ""}". Create a new version to make changes.`
                            : isEditing
                                ? `Modify the configuration for "${field.name}".`
                                : "Define a new field for this entity version."}
                    </SheetDescription>
                    {readonly && (
                        <div className="flex items-center gap-2 rounded-md border border-muted bg-muted/30 px-3 py-2 text-xs text-muted-foreground mt-2">
                            <Lock className="size-3.5 shrink-0" />
                            <span>This version is locked. Fields cannot be modified.</span>
                        </div>
                    )}
                </SheetHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="px-4">
                    <fieldset disabled={readonly} className="space-y-3">
                        {/* Row 1: Display Name + Column Name */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field: f }) => (
                                    <FormItem>
                                        <HintLabel hint="Human-readable name shown in the UI.">Display Name</HintLabel>
                                        <FormControl>
                                            <Input placeholder="Unit Price" {...f} />
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
                                        <HintLabel hint={isEditing ? "Locked — cannot be changed after creation." : "snake_case database column. Auto-generated from display name."}>Column Name</HintLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="unit_price"
                                                {...f}
                                                className="font-mono"
                                                disabled={isEditing}
                                                title={isEditing ? "Column name cannot be changed after creation" : undefined}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        {/* Row 2: Label Override (full width, optional) */}
                        <FormField
                            control={form.control}
                            name="label"
                            render={({ field: f }) => (
                                <FormItem>
                                    <HintLabel hint="Alternate label for forms and reports.">Label Override <span className="text-muted-foreground font-normal">(optional)</span></HintLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Price per unit" {...f} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Row 3: Data Type + UI Type */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="dataType"
                                render={({ field: f }) => (
                                    <FormItem>
                                        <HintLabel hint="Storage type: string, number, boolean, reference, etc.">Data Type</HintLabel>
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
                                        <HintLabel hint="Override the auto-detected form input widget.">UI Type</HintLabel>
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

                        {/* Row 4: Format + Cardinality + Unit */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="format"
                                render={({ field: f }) => {
                                    const options = FORMAT_OPTIONS[watchDataType] ?? [];
                                    return (
                                        <FormItem>
                                            <HintLabel hint="Semantic format hint for validation and display.">Format</HintLabel>
                                            <Select
                                                onValueChange={(v) => f.onChange(v === "__none__" ? null : v)}
                                                value={f.value ?? "__none__"}
                                                disabled={options.length === 0}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="None" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="__none__">None</SelectItem>
                                                    {options.map((fmt) => (
                                                        <SelectItem key={fmt} value={fmt}>{fmt}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    );
                                }}
                            />
                            <FormField
                                control={form.control}
                                name="cardinality"
                                render={({ field: f }) => (
                                    <FormItem>
                                        <HintLabel hint="One = single value, Many = array of values.">Cardinality</HintLabel>
                                        <Select onValueChange={f.onChange} value={f.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {CARDINALITY_OPTIONS.map((opt) => (
                                                    <SelectItem key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        {(watchDataType === "decimal" || watchDataType === "integer" || watchDataType === "number") && (
                            <FormField
                                control={form.control}
                                name="unit"
                                render={({ field: f }) => (
                                    <FormItem>
                                        <HintLabel hint="Unit of measure displayed alongside the value.">Unit</HintLabel>
                                        <FormControl>
                                            <Input placeholder="kg, hours, %" {...f} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

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

                        <Separator className="my-2" />

                        <div className="space-y-4">
                            <p className="text-sm font-medium">Constraints</p>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {([
                                    ["isRequired", "Required", "Field must have a value; NULL is not allowed."],
                                    ["isUnique", "Unique", "Values must be unique across all records."],
                                    ["isSearchable", "Searchable", "Include in full-text search and typeahead queries."],
                                    ["isFilterable", "Filterable", "Show as a filter option in list views and reports."],
                                ] as const).map(
                                    ([flag, flagLabel, hint]) => (
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
                                                    <HintLabel hint={hint}>{flagLabel}</HintLabel>
                                                </FormItem>
                                            )}
                                        />
                                    ),
                                )}
                            </div>
                        </div>

                        <Separator className="my-2" />

                        {/* UI Behavior */}
                        <div className="space-y-4">
                            <p className="text-sm font-medium">UI Behavior</p>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="viewType"
                                    render={({ field: f }) => (
                                        <FormItem>
                                            <HintLabel hint="Override component in read mode.">View Component</HintLabel>
                                            <Select
                                                onValueChange={(v) => f.onChange(v === "__none__" ? null : v)}
                                                value={f.value ?? "__none__"}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Auto" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="__none__">Auto</SelectItem>
                                                    {UI_TYPES.map((t) => (
                                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="editType"
                                    render={({ field: f }) => (
                                        <FormItem>
                                            <HintLabel hint="Override component in edit/create mode.">Edit Component</HintLabel>
                                            <Select
                                                onValueChange={(v) => f.onChange(v === "__none__" ? null : v)}
                                                value={f.value ?? "__none__"}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Auto" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="__none__">Auto</SelectItem>
                                                    {UI_TYPES.map((t) => (
                                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="layout"
                                    render={({ field: f }) => (
                                        <FormItem>
                                            <HintLabel hint="Column span in form layout.">Layout</HintLabel>
                                            <Select onValueChange={f.onChange} value={f.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {LAYOUT_OPTIONS.map((opt) => (
                                                        <SelectItem key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="density"
                                    render={({ field: f }) => (
                                        <FormItem>
                                            <HintLabel hint="Vertical spacing around the field.">Density</HintLabel>
                                            <Select onValueChange={f.onChange} value={f.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {DENSITY_OPTIONS.map((opt) => (
                                                        <SelectItem key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {([
                                    ["isHidden", "Hidden", "Field is never rendered in the UI."],
                                    ["isDisabled", "Disabled", "Field is visible but not interactive."],
                                    ["isReadOnly", "Read-only", "Field is displayed but cannot be edited."],
                                    ["lockOnEdit", "Lock on Edit", "Editable on create, locked after first save."],
                                ] as const).map(
                                    ([flag, flagLabel, hint]) => (
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
                                                    <HintLabel hint={hint}>{flagLabel}</HintLabel>
                                                </FormItem>
                                            )}
                                        />
                                    ),
                                )}
                            </div>
                        </div>

                        <Separator className="my-2" />

                        {/* Visibility Rules */}
                        <div className="space-y-4">
                            <HintLabel hint="Control when this field is shown in different modes.">Visibility Rules</HintLabel>

                            {/* Static defaults */}
                            <p className="text-xs font-medium text-muted-foreground">Default Behavior</p>
                            <div className="grid gap-4 sm:grid-cols-3">
                                {([
                                    ["visibilityCreate", "Create"],
                                    ["visibilityView", "View"],
                                    ["visibilityEdit", "Edit"],
                                ] as const).map(([name, label]) => (
                                    <FormField
                                        key={name}
                                        control={form.control}
                                        name={name}
                                        render={({ field: f }) => (
                                            <FormItem>
                                                <FormLabel>{label}</FormLabel>
                                                <Select onValueChange={f.onChange} value={f.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {VISIBILITY_OPTIONS.map((opt) => (
                                                            <SelectItem key={opt.value} value={opt.value}>
                                                                {opt.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </FormItem>
                                        )}
                                    />
                                ))}
                            </div>

                            {/* Conditional visibility rules */}
                            <FieldBehaviorRuleList
                                mode="visibility"
                                rules={visibilityRules}
                                onChange={setVisibilityRules}
                                fields={siblingFieldNames}
                            />
                        </div>

                        <Separator className="my-2" />

                        {/* Editability Rules */}
                        <div className="space-y-4">
                            <HintLabel hint="Control when this field is editable in create/edit modes.">Edit Rules</HintLabel>

                            {/* Static defaults */}
                            <p className="text-xs font-medium text-muted-foreground">Default Behavior</p>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {([
                                    ["editabilityCreate", "Create"],
                                    ["editabilityEdit", "Edit"],
                                ] as const).map(([name, label]) => (
                                    <FormField
                                        key={name}
                                        control={form.control}
                                        name={name}
                                        render={({ field: f }) => (
                                            <FormItem>
                                                <FormLabel>{label}</FormLabel>
                                                <Select onValueChange={f.onChange} value={f.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {EDITABILITY_OPTIONS.map((opt) => (
                                                            <SelectItem key={opt.value} value={opt.value}>
                                                                {opt.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </FormItem>
                                        )}
                                    />
                                ))}
                            </div>

                            {/* Conditional editability rules */}
                            <FieldBehaviorRuleList
                                mode="editability"
                                rules={editabilityRules}
                                onChange={setEditabilityRules}
                                fields={siblingFieldNames}
                            />
                        </div>

                        <Separator className="my-2" />

                        {/* Default Value — type-aware with conditional defaults */}
                        <DefaultValueEditor
                            dataType={watchDataType}
                            value={defaultValueConfig}
                            onChange={setDefaultValueConfig}
                            enumValues={watchDataType === "enum" ? enumValues : undefined}
                            fields={siblingFieldNames}
                        />

                        <Separator className="my-2" />

                        {/* Validation Rules — structured editor with JSON fallback */}
                        <FormField
                            control={form.control}
                            name="validationJson"
                            render={({ field: f }) => (
                                <FieldValidationEditor
                                    dataType={watchDataType}
                                    value={f.value}
                                    onChange={f.onChange}
                                    fields={siblingFieldNames}
                                />
                            )}
                        />

                        {/* Entity-level validation rules targeting this field */}
                        {field && entityName && (
                            <FieldEntityRulesSummary
                                fieldName={field.name}
                                entityRules={entityValidationRules}
                                entityName={entityName}
                            />
                        )}

                    </fieldset>
                        <SheetFooter className="flex-row justify-end gap-2 pt-4 border-t">
                            {readonly ? (
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                    Close
                                </Button>
                            ) : (
                                <>
                                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                        Cancel
                                    </Button>
                                    <Button type="submit">
                                        {isEditing ? "Save Changes" : "Add Field"}
                                    </Button>
                                </>
                            )}
                        </SheetFooter>
                    </form>
                </Form>
            </SheetContent>
        </Sheet>
    );
}
