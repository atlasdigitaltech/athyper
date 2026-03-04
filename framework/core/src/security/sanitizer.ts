/**
 * Input sanitization utilities
 * Prevents XSS, injection attacks, and other security vulnerabilities
 */

/**
 * HTML entities that need escaping
 */
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
};

/**
 * Sanitize HTML string to prevent XSS
 * Escapes HTML special characters
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  return input.replace(/[&<>"'/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Strip all HTML tags from string
 */
export function stripHtml(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  return input.replace(/<[^>]*>/g, "");
}

/**
 * Sanitize string for use in SQL LIKE patterns
 * Escapes % and _ characters
 */
export function sanitizeSqlLike(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  return input.replace(/[%_]/g, "\\$&");
}

/**
 * Sanitize filename to prevent path traversal
 * Removes directory separators and dangerous characters
 */
export function sanitizeFilename(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  // Remove path separators and null bytes
  let safe = input.replace(/[/\\:\0]/g, "");

  // Remove leading dots to prevent hidden files
  safe = safe.replace(/^\.+/, "");

  // Limit length
  if (safe.length > 255) {
    safe = safe.substring(0, 255);
  }

  return safe || "file";
}

/**
 * Sanitize URL to prevent javascript: and data: protocols
 */
export function sanitizeUrl(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  const trimmed = input.trim().toLowerCase();

  // Block dangerous protocols
  const dangerousProtocols = ["javascript:", "data:", "vbscript:", "file:"];

  for (const protocol of dangerousProtocols) {
    if (trimmed.startsWith(protocol)) {
      return "";
    }
  }

  // Allow relative URLs and safe protocols
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:")
  ) {
    return input;
  }

  // If it looks like a protocol-less absolute URL, prepend https://
  if (/^[a-z0-9]+\.[a-z]{2,}/i.test(trimmed)) {
    return `https://${input}`;
  }

  return input;
}

/**
 * Sanitize object by applying sanitizers to all string values
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  sanitizer: (value: string) => string = sanitizeHtml
): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === "string" ? sanitizer(item) : sanitizeObject(item, sanitizer)
    ) as any;
  }

  const sanitized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      sanitized[key] = sanitizer(value);
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeObject(value, sanitizer);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Trim whitespace from all string values in object
 */
export function trimObject<T extends Record<string, any>>(obj: T): T {
  return sanitizeObject(obj, (value) => value.trim());
}

/**
 * Normalize whitespace (collapse multiple spaces into one)
 */
export function normalizeWhitespace(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  return input.replace(/\s+/g, " ").trim();
}

/**
 * Remove null bytes from string
 */
export function removeNullBytes(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  return input.replace(/\0/g, "");
}

/**
 * Sanitize email address
 * Normalizes and validates format
 */
export function sanitizeEmail(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  // Trim and lowercase
  let email = input.trim().toLowerCase();

  // Remove multiple @ symbols (keep only first)
  const atIndex = email.indexOf("@");
  if (atIndex !== -1) {
    const localPart = email.substring(0, atIndex);
    const domainPart = email.substring(atIndex + 1).replace(/@/g, "");
    email = `${localPart}@${domainPart}`;
  }

  // Remove dangerous characters
  email = email.replace(/[<>()[\]\\,;:\s]/g, "");

  return email;
}

/**
 * Sanitize phone number
 * Removes all non-digit characters except leading +
 */
export function sanitizePhone(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  // Keep leading + for international format
  const hasPlus = input.trim().startsWith("+");
  const digits = input.replace(/\D/g, "");

  return hasPlus ? `+${digits}` : digits;
}

/**
 * Sanitize integer input
 * Converts to integer, returns 0 if invalid
 */
export function sanitizeInteger(input: any, defaultValue: number = 0): number {
  const num = parseInt(String(input), 10);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Sanitize float input
 * Converts to float, returns 0 if invalid
 */
export function sanitizeFloat(input: any, defaultValue: number = 0): number {
  const num = parseFloat(String(input));
  return isNaN(num) ? defaultValue : num;
}

/**
 * Sanitize boolean input
 * Converts truthy/falsy strings to boolean
 */
export function sanitizeBoolean(input: any): boolean {
  if (typeof input === "boolean") {
    return input;
  }

  const str = String(input).toLowerCase().trim();
  return str === "true" || str === "1" || str === "yes" || str === "on";
}

/**
 * Limit string length
 */
export function limitLength(input: string, maxLength: number, suffix: string = "..."): string {
  if (typeof input !== "string") {
    return "";
  }

  if (input.length <= maxLength) {
    return input;
  }

  return input.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Deep clone and sanitize object
 * Prevents prototype pollution
 */
export function sanitizeDeep<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // Prevent prototype pollution
  if (["__proto__", "constructor", "prototype"].includes(String(obj))) {
    return {} as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeDeep(item)) as any;
  }

  const sanitized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip dangerous keys
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      continue;
    }

    sanitized[key] = sanitizeDeep(value);
  }

  return sanitized;
}

/**
 * Sanitize JSON input
 * Safely parses JSON and sanitizes the result
 */
export function sanitizeJson<T = any>(input: string, defaultValue: T | null = null): T | null {
  if (typeof input !== "string") {
    return defaultValue;
  }

  try {
    const parsed = JSON.parse(input);
    return sanitizeDeep(parsed);
  } catch {
    return defaultValue;
  }
}

/**
 * Sanitization profiles for common use cases
 */
export const SanitizationProfiles = {
  /**
   * Basic sanitization: HTML escape and trim
   */
  basic: (input: string) => sanitizeHtml(input).trim(),

  /**
   * Strict sanitization: Strip HTML, normalize whitespace, limit length
   */
  strict: (input: string) => limitLength(normalizeWhitespace(stripHtml(input)), 1000),

  /**
   * Username: Alphanumeric, lowercase, trim
   */
  username: (input: string) =>
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, ""),

  /**
   * Slug: Lowercase, hyphenated, no special chars
   */
  slug: (input: string) =>
    input
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, ""),

  /**
   * Search query: Strip HTML, normalize whitespace, limit length
   */
  searchQuery: (input: string) => limitLength(normalizeWhitespace(stripHtml(input)), 200),

  /**
   * Rich text: Allow limited HTML but escape dangerous content
   */
  richText: (input: string) => {
    // Strip script tags and event handlers
    let safe = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    safe = safe.replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
    safe = safe.replace(/javascript:/gi, "");
    return safe;
  },
} as const;
