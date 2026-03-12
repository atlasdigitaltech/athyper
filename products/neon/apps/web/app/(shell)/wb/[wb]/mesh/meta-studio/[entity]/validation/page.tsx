"use client";

import { use, useMemo } from "react";

import { ValidationRuleEditor } from "@/components/mesh/schemas/validation/ValidationRuleEditor";
import { compileFieldConstraints } from "@/lib/schema-manager/compile-field-constraints";
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

  // Auto-compile field-level constraints into entity-level validation rules
  const fieldDerivedRules = useMemo(
    () => compileFieldConstraints(fields ?? []),
    [fields],
  );

  return (
    <div className="space-y-6 p-4">
      <ValidationRuleEditor
        rules={rules}
        fieldDerivedRules={fieldDerivedRules}
        fields={fieldNames}
        loading={loading}
        onSave={saveRules}
        onTest={testRules}
      />
    </div>
  );
}
