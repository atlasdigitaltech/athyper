# Intake validation messages

Metadata controls required and maximum-length constraints. Shared platform messages
supply wording. Native browser validation bubbles are replaced by inline errors,
an error summary with field links, and focus on the first invalid field.

The existing authoring JSON columns carry the configuration; no DDL change is
needed. Define entity-wide `layoutConfig.entityValidationMessages` on one intake
surface only. The compiler inherits those defaults into every intake surface.
Optional surface `layoutConfig.validationMessages` overrides those defaults;
`displayConfig.validationMessages` on an input binding overrides both.

```json
{
  "entityValidationMessages": {
    "required": "validation.required",
    "maxLength": "validation.maxLength"
  }
}
```

An input binding can carry:

```json
{
  "required": true,
  "maxLength": 100,
  "validationMessages": { "maxLength": "businessPartner.validation.nameLength" }
}
```

Message values are translation keys, not input placeholders or executable text.
Templates receive `{field}` from the current metadata label and `{max}` from the
constraint. Unknown catalog entries fall back to the corresponding platform
message. Catalog translations must be registered separately.

Standard codes currently supported: required, maxLength, option, url, number,
and value. Required validation wins over subsequent constraints. Whitespace is
trimmed and declared case normalization runs before checking length. Length is
counted in Unicode code points on both browser and server. Pasted text is kept;
there is no native maxlength truncation. Text fields show a character counter.

Fields validate on blur or Continue/Submit; invalid fields revalidate as edited.
Hidden and disabled controls are omitted from client validation. Nested surface
instances receive distinct input IDs and participate in the same form summary.
Existing collection-count and business-level errors remain form-level errors.

`validateDataInput` returns `{fieldPath, code, messageKey, params}`. The shared
`dataSurfaceValues` boundary throws `DataValidationError` for input failures.
Manual new Business Partner requests are checked against the current authorized
intake descriptor during preflight and create; rejection returns HTTP 422 and
`fieldErrors`. Existing owning-service business validations remain in force.
Other request kinds retain their existing validators.

This change does not introduce executable custom rules or a new uniqueness check.
Business rules needing database access must remain registered server validators;
they can adopt the structured field-error contract in a subsequent adapter.

The Business Partner provisioning transform sets Registered name to 100 characters
and preserves existing entity message overrides. Publish through authenticated
Studio; DEV uses its existing draft preview activation workflow.
