import type { EntitySurfaceFieldV1 } from '@athyper/contract-platform-entity-runtime';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** Only admitted writable field keys and known violation codes become UI copy.
 * Server messages and values are deliberately excluded. */
export function formFieldErrors(cause: unknown, fields: readonly EntitySurfaceFieldV1[], message: (key: string, params: { field: string }) => string): Readonly<Record<string, string>> {
  const problem = object(object(cause).problem);
  const result = object(object(problem.errors).result);
  if (result.kind !== 'FieldsNotWritable' && result.kind !== 'ValidationFailed') return {};
  const violations = object(result.fields);
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.readOnly) continue;
    const items = violations[field.key];
    if (!Array.isArray(items) || !items.length) continue;
    const code = object(items[0]).code;
    const key = code === 'FIELD_REQUIRED' ? 'validation.required' : code === 'FIELD_OPTION_INVALID' ? 'validation.option' : 'validation.value';
    errors[field.key] = message(key, { field: field.label });
  }
  // Domain validation can report field names rather than detailed violations.
  if (result.kind === 'ValidationFailed' && Array.isArray(result.fields)) for (const field of fields) {
    if (!field.readOnly && result.fields.includes(field.key)) errors[field.key] = message('validation.value', { field: field.label });
  }
  return errors;
}
export function formVersionConflict(cause: unknown): boolean {
  return object(object(cause).problem).code === 'RECORD_VERSION_CONFLICT';
}

export function formAlreadyExists(cause: unknown): boolean { return object(object(cause).problem).code === 'RECORD_ALREADY_EXISTS'; }
