# SearchField

Import from `@athyper/platform-ui` and include its stylesheet. The field has shared 40px (2.5rem) sizing, a search icon, an accessible `label`, and one clear button that returns focus to the input.

Provide `value` and `onValueChange`. Optional `onClear` can reset submitted results as well as the query. Standard input props (including `maxLength`, `placeholder`, `enterKeyHint`, and `disabled`) and an input ref are supported. `className` belongs to the outer field for layout spacing.

The caller owns search behavior: filter on change or wrap in a form with a submit action. Keep search scopes, filters and submission controls outside the field. Only display keyboard shortcuts when the owning feature implements them.
