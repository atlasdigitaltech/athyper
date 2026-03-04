/**
 * Request validation utilities
 * Prevents common security vulnerabilities through input validation
 */

export type ValidationRule = {
  field: string;
  required?: boolean;
  type?: "string" | "number" | "boolean" | "object" | "array" | "email" | "url" | "uuid";
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: readonly string[];
  custom?: (value: any) => boolean | string;
};

export type ValidationError = {
  field: string;
  message: string;
  value?: any;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

/**
 * Validate request data against rules
 */
export function validate(data: any, rules: ValidationRule[]): ValidationResult {
  const errors: ValidationError[] = [];

  for (const rule of rules) {
    const value = getNestedValue(data, rule.field);
    const fieldErrors = validateField(rule.field, value, rule);
    errors.push(...fieldErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a single field
 */
function validateField(field: string, value: any, rule: ValidationRule): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required check
  if (rule.required && (value === undefined || value === null || value === "")) {
    errors.push({
      field,
      message: `${field} is required`,
    });
    return errors; // Stop further validation if required field is missing
  }

  // Skip other validations if value is not present and not required
  if (value === undefined || value === null || value === "") {
    return errors;
  }

  // Type validation
  if (rule.type) {
    const typeError = validateType(field, value, rule.type);
    if (typeError) {
      errors.push(typeError);
      return errors; // Stop if type is wrong
    }
  }

  // String validations
  if (typeof value === "string") {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push({
        field,
        message: `${field} must be at least ${rule.minLength} characters`,
        value,
      });
    }

    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      errors.push({
        field,
        message: `${field} must be at most ${rule.maxLength} characters`,
        value,
      });
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push({
        field,
        message: `${field} has invalid format`,
        value,
      });
    }

    if (rule.enum && !rule.enum.includes(value)) {
      errors.push({
        field,
        message: `${field} must be one of: ${rule.enum.join(", ")}`,
        value,
      });
    }
  }

  // Number validations
  if (typeof value === "number") {
    if (rule.min !== undefined && value < rule.min) {
      errors.push({
        field,
        message: `${field} must be at least ${rule.min}`,
        value,
      });
    }

    if (rule.max !== undefined && value > rule.max) {
      errors.push({
        field,
        message: `${field} must be at most ${rule.max}`,
        value,
      });
    }
  }

  // Custom validation
  if (rule.custom) {
    const result = rule.custom(value);
    if (result !== true) {
      errors.push({
        field,
        message: typeof result === "string" ? result : `${field} is invalid`,
        value,
      });
    }
  }

  return errors;
}

/**
 * Validate type
 */
function validateType(
  field: string,
  value: any,
  type: ValidationRule["type"]
): ValidationError | null {
  switch (type) {
    case "string":
      if (typeof value !== "string") {
        return { field, message: `${field} must be a string` };
      }
      break;

    case "number":
      if (typeof value !== "number" || isNaN(value)) {
        return { field, message: `${field} must be a number` };
      }
      break;

    case "boolean":
      if (typeof value !== "boolean") {
        return { field, message: `${field} must be a boolean` };
      }
      break;

    case "object":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { field, message: `${field} must be an object` };
      }
      break;

    case "array":
      if (!Array.isArray(value)) {
        return { field, message: `${field} must be an array` };
      }
      break;

    case "email":
      if (typeof value !== "string" || !isValidEmail(value)) {
        return { field, message: `${field} must be a valid email address` };
      }
      break;

    case "url":
      if (typeof value !== "string" || !isValidUrl(value)) {
        return { field, message: `${field} must be a valid URL` };
      }
      break;

    case "uuid":
      if (typeof value !== "string" || !isValidUuid(value)) {
        return { field, message: `${field} must be a valid UUID` };
      }
      break;
  }

  return null;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  // RFC 5322 simplified regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 320;
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate UUID format
 */
function isValidUuid(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Common validation patterns
 */
export const ValidationPatterns = {
  /**
   * Alphanumeric only (a-z, A-Z, 0-9)
   */
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,

  /**
   * Alphanumeric with hyphens and underscores
   */
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,

  /**
   * Username (alphanumeric, underscore, hyphen, 3-20 chars)
   */
  USERNAME: /^[a-zA-Z0-9_-]{3,20}$/,

  /**
   * Phone number (international format)
   */
  PHONE: /^\+?[1-9]\d{1,14}$/,

  /**
   * Hex color code
   */
  HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,

  /**
   * ISO 8601 date
   */
  ISO_DATE: /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?)?$/,

  /**
   * Semantic version (e.g., 1.0.0)
   */
  SEMVER: /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
} as const;

/**
 * Pre-configured validation rule sets
 */
export const ValidationRulesets = {
  /**
   * Common user registration fields
   */
  userRegistration: [
    {
      field: "email",
      required: true,
      type: "email" as const,
      maxLength: 320,
    },
    {
      field: "password",
      required: true,
      type: "string" as const,
      minLength: 8,
      maxLength: 128,
    },
    {
      field: "username",
      required: true,
      type: "string" as const,
      pattern: ValidationPatterns.USERNAME,
    },
  ],

  /**
   * Common login fields
   */
  login: [
    {
      field: "email",
      required: true,
      type: "email" as const,
    },
    {
      field: "password",
      required: true,
      type: "string" as const,
    },
  ],

  /**
   * Pagination parameters
   */
  pagination: [
    {
      field: "page",
      type: "number" as const,
      min: 1,
    },
    {
      field: "limit",
      type: "number" as const,
      min: 1,
      max: 100,
    },
  ],
} as const;
