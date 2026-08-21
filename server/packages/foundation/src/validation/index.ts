export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: ReadonlyArray<string | number>;
}

export type ValidationResult<T> =
  | { readonly valid: true; readonly value: T }
  | { readonly valid: false; readonly issues: ReadonlyArray<ValidationIssue> };

export interface Validator<Input, Output = Input> {
  validate(input: Input): ValidationResult<Output>;
}
