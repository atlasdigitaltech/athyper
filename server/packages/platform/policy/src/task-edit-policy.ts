import type { PolicyDefinition } from "@athyper/server-contract-policy";

/** Purpose-specific publication guard; evaluation remains with the existing policy owner. */
export function validateTaskEditPolicy(definition: PolicyDefinition): readonly string[] {
  const purpose = definition.entityType === "workflow.task_edit";
  const typed = definition.rules.some(r => r.actionConfig?.schema === "athyper.task-edit-result/1");
  if (!purpose && !typed) return [];
  const errors: string[] = [];
  if (!purpose) errors.push("Task edit results require the workflow.task_edit policy purpose");
  if (!["all", "accumulate"].includes(definition.evaluationMode)) errors.push("Task edit policies must collect all applicable outcomes");
  if (!definition.rules.length) errors.push("Task edit policies require explicit rules, including an explicit deny where appropriate");
  const ids = new Set<string>();
  for (const rule of definition.rules) {
    if (!rule.id || ids.has(rule.id)) errors.push("Task edit rule identities must be unique");
    ids.add(rule.id);
    if (!Number.isSafeInteger(rule.priority)) errors.push(`Invalid task edit priority: ${rule.id}`);
    const result = rule.actionConfig;
    if (!result || typeof result !== "object" || Array.isArray(result) ||
        result.schema !== "athyper.task-edit-result/1" ||
        Object.keys(result).sort().join() !== "effect,paths,schema" ||
        !["deny", "metadata_only", "full_reapproval"].includes(String(result.effect)) ||
        rule.action !== (result.effect === "deny" ? "deny" : "require_workflow") ||
        !Array.isArray(result.paths) || !result.paths.length ||
        new Set(result.paths).size !== result.paths.length || result.paths.some(p =>
          typeof p !== "string" || !/^\/(?:[^~/]|~[01])+(?:\/(?:[^~/]|~[01])+)*$/.test(p) ||
          p.split("/").some(key => ["__proto__", "prototype", "constructor"].includes(key))))
      errors.push(`Unsafe task edit result: ${rule.id}`);
  }
  return errors;
}
