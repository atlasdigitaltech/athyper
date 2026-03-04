"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// ─── Templates ───────────────────────────────────────────────

interface JsonTemplate {
    label: string;
    description: string;
    schema: Record<string, unknown>;
}

const TEMPLATES: JsonTemplate[] = [
    {
        label: "Key-Value Map",
        description: "Simple string key-value pairs",
        schema: {
            type: "object",
            additionalProperties: { type: "string" },
        },
    },
    {
        label: "Address",
        description: "Standard address structure",
        schema: {
            type: "object",
            properties: {
                street: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                postalCode: { type: "string" },
                country: { type: "string" },
            },
            required: ["street", "city", "country"],
        },
    },
    {
        label: "Metadata Bag",
        description: "Flexible metadata with tags",
        schema: {
            type: "object",
            properties: {
                tags: { type: "array", items: { type: "string" } },
                attributes: {
                    type: "object",
                    additionalProperties: { type: "string" },
                },
            },
        },
    },
    {
        label: "Custom",
        description: "Write your own JSON schema",
        schema: {},
    },
];

// ─── Component ───────────────────────────────────────────────

interface JsonSchemaHelperProps {
    value: string;
    onChange: (value: string) => void;
}

export function JsonSchemaHelper({ value, onChange }: JsonSchemaHelperProps) {
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [jsonError, setJsonError] = useState<string | null>(null);

    const handleTemplateSelect = useCallback(
        (template: JsonTemplate) => {
            setSelectedTemplate(template.label);
            if (template.label !== "Custom") {
                const text = JSON.stringify(template.schema, null, 2);
                onChange(text);
                setJsonError(null);
            }
        },
        [onChange],
    );

    const handleTextChange = useCallback(
        (text: string) => {
            onChange(text);
            if (!text.trim()) {
                setJsonError(null);
                return;
            }
            try {
                JSON.parse(text);
                setJsonError(null);
            } catch {
                setJsonError("Invalid JSON");
            }
        },
        [onChange],
    );

    return (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium">JSON Schema Template</p>

            <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((tpl) => (
                    <Button
                        key={tpl.label}
                        type="button"
                        variant={selectedTemplate === tpl.label ? "secondary" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleTemplateSelect(tpl)}
                    >
                        {tpl.label}
                    </Button>
                ))}
            </div>

            {selectedTemplate && selectedTemplate !== "Custom" && (
                <p className="text-xs text-muted-foreground">
                    {TEMPLATES.find((t) => t.label === selectedTemplate)?.description}
                </p>
            )}

            <Textarea
                value={value}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder='{"type": "object", "properties": {...}}'
                rows={5}
                className="font-mono text-xs"
            />

            {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
        </div>
    );
}
