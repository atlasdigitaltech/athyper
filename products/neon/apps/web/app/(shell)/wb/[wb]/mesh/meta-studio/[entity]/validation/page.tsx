"use client";

import { use } from "react";

import { ValidationRuleEditor } from "@/components/mesh/schemas/validation/ValidationRuleEditor";
import { useEntityFields } from "@/lib/schema-manager/use-entity-fields";
import { useEntityValidation } from "@/lib/schema-manager/use-entity-validation";

export default function ValidationPage({
    params,
}: {
    params: Promise<{ entity: string }>;
}) {
    const { entity } = use(params);
    const { rules, loading, saveRules, testRules } = useEntityValidation(entity);
    const { fields } = useEntityFields(entity);

    // Extract field names for the rule builder dropdowns
    const fieldNames = (fields ?? []).map((f) => f.name);

    return (
        <div className="space-y-6 p-4">
            <ValidationRuleEditor
                rules={rules}
                fields={fieldNames}
                loading={loading}
                onSave={saveRules}
                onTest={testRules}
            />
        </div>
    );
}
