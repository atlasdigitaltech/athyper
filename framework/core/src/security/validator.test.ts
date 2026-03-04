import { describe, it, expect } from "vitest";

import {
  validate,
  ValidationPatterns,
  ValidationRulesets,
  type ValidationRule,
} from "./validator.js";

describe("validate", () => {
  describe("required validation", () => {
    it("should fail when required field is missing", () => {
      const rules: ValidationRule[] = [
        { field: "email", required: true },
      ];

      const result = validate({}, rules);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe("email");
      expect(result.errors[0].message).toContain("required");
    });

    it("should pass when required field is present", () => {
      const rules: ValidationRule[] = [
        { field: "email", required: true },
      ];

      const result = validate({ email: "test@example.com" }, rules);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail when required field is empty string", () => {
      const rules: ValidationRule[] = [
        { field: "name", required: true },
      ];

      const result = validate({ name: "" }, rules);

      expect(result.valid).toBe(false);
    });
  });

  describe("type validation", () => {
    it("should validate string type", () => {
      const rules: ValidationRule[] = [
        { field: "name", type: "string" },
      ];

      expect(validate({ name: "John" }, rules).valid).toBe(true);
      expect(validate({ name: 123 }, rules).valid).toBe(false);
    });

    it("should validate number type", () => {
      const rules: ValidationRule[] = [
        { field: "age", type: "number" },
      ];

      expect(validate({ age: 25 }, rules).valid).toBe(true);
      expect(validate({ age: "25" }, rules).valid).toBe(false);
      expect(validate({ age: NaN }, rules).valid).toBe(false);
    });

    it("should validate boolean type", () => {
      const rules: ValidationRule[] = [
        { field: "active", type: "boolean" },
      ];

      expect(validate({ active: true }, rules).valid).toBe(true);
      expect(validate({ active: false }, rules).valid).toBe(true);
      expect(validate({ active: "true" }, rules).valid).toBe(false);
    });

    it("should validate object type", () => {
      const rules: ValidationRule[] = [
        { field: "metadata", type: "object" },
      ];

      expect(validate({ metadata: {} }, rules).valid).toBe(true);
      expect(validate({ metadata: { key: "value" } }, rules).valid).toBe(true);
      expect(validate({ metadata: [] }, rules).valid).toBe(false);
      // null is allowed for non-required fields
      expect(validate({ metadata: null }, rules).valid).toBe(true);
      // null should be rejected if field is required
      expect(validate({ metadata: null }, [{ field: "metadata", type: "object", required: true }]).valid).toBe(false);
    });

    it("should validate array type", () => {
      const rules: ValidationRule[] = [
        { field: "tags", type: "array" },
      ];

      expect(validate({ tags: [] }, rules).valid).toBe(true);
      expect(validate({ tags: ["a", "b"] }, rules).valid).toBe(true);
      expect(validate({ tags: {} }, rules).valid).toBe(false);
    });

    it("should validate email type", () => {
      const rules: ValidationRule[] = [
        { field: "email", type: "email" },
      ];

      expect(validate({ email: "test@example.com" }, rules).valid).toBe(true);
      expect(validate({ email: "invalid-email" }, rules).valid).toBe(false);
      expect(validate({ email: "test@" }, rules).valid).toBe(false);
    });

    it("should validate url type", () => {
      const rules: ValidationRule[] = [
        { field: "website", type: "url" },
      ];

      expect(validate({ website: "https://example.com" }, rules).valid).toBe(true);
      expect(validate({ website: "http://example.com" }, rules).valid).toBe(true);
      expect(validate({ website: "not-a-url" }, rules).valid).toBe(false);
      expect(validate({ website: "ftp://example.com" }, rules).valid).toBe(false);
    });

    it("should validate uuid type", () => {
      const rules: ValidationRule[] = [
        { field: "id", type: "uuid" },
      ];

      expect(validate({ id: "550e8400-e29b-41d4-a716-446655440000" }, rules).valid).toBe(true);
      expect(validate({ id: "invalid-uuid" }, rules).valid).toBe(false);
    });
  });

  describe("string validation", () => {
    it("should validate minLength", () => {
      const rules: ValidationRule[] = [
        { field: "password", type: "string", minLength: 8 },
      ];

      expect(validate({ password: "12345678" }, rules).valid).toBe(true);
      expect(validate({ password: "1234567" }, rules).valid).toBe(false);
    });

    it("should validate maxLength", () => {
      const rules: ValidationRule[] = [
        { field: "username", type: "string", maxLength: 20 },
      ];

      expect(validate({ username: "a".repeat(20) }, rules).valid).toBe(true);
      expect(validate({ username: "a".repeat(21) }, rules).valid).toBe(false);
    });

    it("should validate pattern", () => {
      const rules: ValidationRule[] = [
        { field: "username", type: "string", pattern: /^[a-z0-9_]+$/ },
      ];

      expect(validate({ username: "john_doe123" }, rules).valid).toBe(true);
      expect(validate({ username: "john-doe" }, rules).valid).toBe(false);
      expect(validate({ username: "John" }, rules).valid).toBe(false);
    });

    it("should validate enum", () => {
      const rules: ValidationRule[] = [
        { field: "role", type: "string", enum: ["admin", "user", "guest"] },
      ];

      expect(validate({ role: "admin" }, rules).valid).toBe(true);
      expect(validate({ role: "user" }, rules).valid).toBe(true);
      expect(validate({ role: "superadmin" }, rules).valid).toBe(false);
    });
  });

  describe("number validation", () => {
    it("should validate min", () => {
      const rules: ValidationRule[] = [
        { field: "age", type: "number", min: 18 },
      ];

      expect(validate({ age: 18 }, rules).valid).toBe(true);
      expect(validate({ age: 25 }, rules).valid).toBe(true);
      expect(validate({ age: 17 }, rules).valid).toBe(false);
    });

    it("should validate max", () => {
      const rules: ValidationRule[] = [
        { field: "rating", type: "number", max: 5 },
      ];

      expect(validate({ rating: 5 }, rules).valid).toBe(true);
      expect(validate({ rating: 3 }, rules).valid).toBe(true);
      expect(validate({ rating: 6 }, rules).valid).toBe(false);
    });
  });

  describe("custom validation", () => {
    it("should validate with custom function returning boolean", () => {
      const rules: ValidationRule[] = [
        {
          field: "age",
          custom: (value) => value >= 18 && value <= 100,
        },
      ];

      expect(validate({ age: 25 }, rules).valid).toBe(true);
      expect(validate({ age: 17 }, rules).valid).toBe(false);
      expect(validate({ age: 101 }, rules).valid).toBe(false);
    });

    it("should validate with custom function returning error message", () => {
      const rules: ValidationRule[] = [
        {
          field: "password",
          custom: (value) => {
            if (!/[A-Z]/.test(value)) {
              return "Password must contain uppercase letter";
            }
            return true;
          },
        },
      ];

      const result = validate({ password: "lowercase" }, rules);

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toBe("Password must contain uppercase letter");
    });
  });

  describe("nested fields", () => {
    it("should validate nested object fields", () => {
      const rules: ValidationRule[] = [
        { field: "user.email", required: true, type: "email" },
        { field: "user.name", required: true, type: "string" },
      ];

      const data = {
        user: {
          email: "test@example.com",
          name: "John",
        },
      };

      const result = validate(data, rules);
      expect(result.valid).toBe(true);
    });

    it("should handle missing nested fields", () => {
      const rules: ValidationRule[] = [
        { field: "user.email", required: true },
      ];

      const result = validate({}, rules);

      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe("user.email");
    });
  });

  describe("multiple errors", () => {
    it("should return all validation errors", () => {
      const rules: ValidationRule[] = [
        { field: "email", required: true, type: "email" },
        { field: "password", required: true, minLength: 8 },
      ];

      const result = validate(
        { email: "invalid", password: "short" },
        rules
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe("ValidationPatterns", () => {
  it("should have ALPHANUMERIC pattern", () => {
    expect(ValidationPatterns.ALPHANUMERIC.test("abc123")).toBe(true);
    expect(ValidationPatterns.ALPHANUMERIC.test("abc-123")).toBe(false);
  });

  it("should have SLUG pattern", () => {
    expect(ValidationPatterns.SLUG.test("my-slug")).toBe(true);
    expect(ValidationPatterns.SLUG.test("my_slug")).toBe(false);
    expect(ValidationPatterns.SLUG.test("MySlug")).toBe(false);
  });

  it("should have USERNAME pattern", () => {
    expect(ValidationPatterns.USERNAME.test("john_doe")).toBe(true);
    expect(ValidationPatterns.USERNAME.test("john-doe")).toBe(true);
    expect(ValidationPatterns.USERNAME.test("ab")).toBe(false); // too short
  });

  it("should have PHONE pattern", () => {
    expect(ValidationPatterns.PHONE.test("+1234567890")).toBe(true);
    expect(ValidationPatterns.PHONE.test("1234567890")).toBe(true);
    expect(ValidationPatterns.PHONE.test("123-456")).toBe(false);
  });

  it("should have HEX_COLOR pattern", () => {
    expect(ValidationPatterns.HEX_COLOR.test("#FFFFFF")).toBe(true);
    expect(ValidationPatterns.HEX_COLOR.test("#FFF")).toBe(true);
    expect(ValidationPatterns.HEX_COLOR.test("FFFFFF")).toBe(false);
  });

  it("should have ISO_DATE pattern", () => {
    expect(ValidationPatterns.ISO_DATE.test("2023-01-01")).toBe(true);
    expect(ValidationPatterns.ISO_DATE.test("2023-01-01T12:00:00Z")).toBe(true);
    expect(ValidationPatterns.ISO_DATE.test("01/01/2023")).toBe(false);
  });

  it("should have SEMVER pattern", () => {
    expect(ValidationPatterns.SEMVER.test("1.0.0")).toBe(true);
    expect(ValidationPatterns.SEMVER.test("1.0.0-alpha")).toBe(true);
    expect(ValidationPatterns.SEMVER.test("v1.0.0")).toBe(false);
  });
});

describe("ValidationRulesets", () => {
  it("should have userRegistration ruleset", () => {
    expect(ValidationRulesets.userRegistration).toBeDefined();
    expect(ValidationRulesets.userRegistration.length).toBeGreaterThan(0);

    const hasEmail = ValidationRulesets.userRegistration.some((r) => r.field === "email");
    expect(hasEmail).toBe(true);
  });

  it("should have login ruleset", () => {
    expect(ValidationRulesets.login).toBeDefined();
    expect(ValidationRulesets.login.length).toBe(2);
  });

  it("should have pagination ruleset", () => {
    expect(ValidationRulesets.pagination).toBeDefined();

    const pageRule = ValidationRulesets.pagination.find((r) => r.field === "page");
    expect(pageRule?.min).toBe(1);
  });
});
