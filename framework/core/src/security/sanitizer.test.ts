import { describe, it, expect } from "vitest";

import {
  sanitizeHtml,
  stripHtml,
  sanitizeSqlLike,
  sanitizeFilename,
  sanitizeUrl,
  sanitizeObject,
  trimObject,
  normalizeWhitespace,
  removeNullBytes,
  sanitizeEmail,
  sanitizePhone,
  sanitizeInteger,
  sanitizeFloat,
  sanitizeBoolean,
  limitLength,
  sanitizeDeep,
  sanitizeJson,
  SanitizationProfiles,
} from "./sanitizer.js";

describe("sanitizeHtml", () => {
  it("should escape HTML special characters", () => {
    expect(sanitizeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;"
    );
  });

  it("should escape ampersand", () => {
    expect(sanitizeHtml("A & B")).toBe("A &amp; B");
  });

  it("should escape quotes", () => {
    expect(sanitizeHtml('"Hello" and \'World\'')).toBe(
      "&quot;Hello&quot; and &#x27;World&#x27;"
    );
  });

  it("should handle empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("should handle non-string input", () => {
    expect(sanitizeHtml(123 as any)).toBe("");
  });
});

describe("stripHtml", () => {
  it("should remove HTML tags", () => {
    expect(stripHtml("<p>Hello <b>World</b></p>")).toBe("Hello World");
  });

  it("should remove script tags", () => {
    expect(stripHtml("<script>alert('xss')</script>")).toBe("alert('xss')");
  });

  it("should handle self-closing tags", () => {
    expect(stripHtml("Line 1<br/>Line 2")).toBe("Line 1Line 2");
  });

  it("should handle empty string", () => {
    expect(stripHtml("")).toBe("");
  });
});

describe("sanitizeSqlLike", () => {
  it("should escape % character", () => {
    expect(sanitizeSqlLike("test%")).toBe("test\\%");
  });

  it("should escape _ character", () => {
    expect(sanitizeSqlLike("test_value")).toBe("test\\_value");
  });

  it("should escape both % and _", () => {
    expect(sanitizeSqlLike("%test_value%")).toBe("\\%test\\_value\\%");
  });
});

describe("sanitizeFilename", () => {
  it("should remove directory separators", () => {
    // Leading dots are also removed for security
    expect(sanitizeFilename("../../etc/passwd")).toBe("etcpasswd");
  });

  it("should remove null bytes", () => {
    expect(sanitizeFilename("file\0.txt")).toBe("file.txt");
  });

  it("should remove leading dots", () => {
    expect(sanitizeFilename("...hidden")).toBe("hidden");
  });

  it("should limit length to 255 characters", () => {
    const longName = "a".repeat(300);
    expect(sanitizeFilename(longName).length).toBe(255);
  });

  it("should return 'file' for empty filename", () => {
    expect(sanitizeFilename("")).toBe("file");
  });

  it("should remove colons", () => {
    expect(sanitizeFilename("file:name.txt")).toBe("filename.txt");
  });
});

describe("sanitizeUrl", () => {
  it("should block javascript: protocol", () => {
    expect(sanitizeUrl("javascript:alert('xss')")).toBe("");
  });

  it("should block data: protocol", () => {
    expect(sanitizeUrl("data:text/html,<script>alert('xss')</script>")).toBe("");
  });

  it("should allow http: protocol", () => {
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("should allow https: protocol", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
  });

  it("should allow relative URLs", () => {
    expect(sanitizeUrl("/path/to/page")).toBe("/path/to/page");
  });

  it("should prepend https:// to protocol-less URLs", () => {
    expect(sanitizeUrl("example.com")).toBe("https://example.com");
  });

  it("should handle empty string", () => {
    expect(sanitizeUrl("")).toBe("");
  });
});

describe("sanitizeObject", () => {
  it("should sanitize all string values", () => {
    const obj = {
      name: "<script>xss</script>",
      description: "Normal text",
    };

    const sanitized = sanitizeObject(obj);

    expect(sanitized.name).not.toContain("<script>");
    expect(sanitized.description).toBe("Normal text");
  });

  it("should handle nested objects", () => {
    const obj = {
      user: {
        name: "<b>John</b>",
        email: "<script>alert()</script>",
      },
    };

    const sanitized = sanitizeObject(obj);

    expect(sanitized.user.name).not.toContain("<b>");
    expect(sanitized.user.email).not.toContain("<script>");
  });

  it("should handle arrays", () => {
    const obj = {
      tags: ["<script>1</script>", "tag2", "<b>tag3</b>"],
    };

    const sanitized = sanitizeObject(obj);

    expect(sanitized.tags[0]).not.toContain("<script>");
    expect(sanitized.tags[2]).not.toContain("<b>");
  });

  it("should preserve non-string values", () => {
    const obj = {
      count: 42,
      active: true,
      data: null,
    };

    const sanitized = sanitizeObject(obj);

    expect(sanitized.count).toBe(42);
    expect(sanitized.active).toBe(true);
    expect(sanitized.data).toBe(null);
  });
});

describe("trimObject", () => {
  it("should trim all string values", () => {
    const obj = {
      name: "  John  ",
      email: "test@example.com  ",
    };

    const trimmed = trimObject(obj);

    expect(trimmed.name).toBe("John");
    expect(trimmed.email).toBe("test@example.com");
  });
});

describe("normalizeWhitespace", () => {
  it("should collapse multiple spaces", () => {
    expect(normalizeWhitespace("hello    world")).toBe("hello world");
  });

  it("should handle tabs and newlines", () => {
    expect(normalizeWhitespace("hello\t\n  world")).toBe("hello world");
  });

  it("should trim leading and trailing whitespace", () => {
    expect(normalizeWhitespace("  hello world  ")).toBe("hello world");
  });
});

describe("removeNullBytes", () => {
  it("should remove null bytes", () => {
    expect(removeNullBytes("hello\0world")).toBe("helloworld");
  });

  it("should handle multiple null bytes", () => {
    expect(removeNullBytes("\0test\0\0value\0")).toBe("testvalue");
  });
});

describe("sanitizeEmail", () => {
  it("should lowercase and trim email", () => {
    expect(sanitizeEmail("  Test@Example.COM  ")).toBe("test@example.com");
  });

  it("should remove multiple @ symbols", () => {
    expect(sanitizeEmail("test@@example.com")).toBe("test@example.com");
  });

  it("should remove dangerous characters", () => {
    expect(sanitizeEmail("test<>@example.com")).toBe("test@example.com");
  });

  it("should handle empty string", () => {
    expect(sanitizeEmail("")).toBe("");
  });
});

describe("sanitizePhone", () => {
  it("should keep only digits", () => {
    expect(sanitizePhone("(123) 456-7890")).toBe("1234567890");
  });

  it("should preserve leading +", () => {
    expect(sanitizePhone("+1 (234) 567-8900")).toBe("+12345678900");
  });

  it("should remove all non-digits except leading +", () => {
    expect(sanitizePhone("1-800-CALL-NOW")).toBe("1800");
  });
});

describe("sanitizeInteger", () => {
  it("should convert string to integer", () => {
    expect(sanitizeInteger("42")).toBe(42);
  });

  it("should return default for invalid input", () => {
    expect(sanitizeInteger("abc")).toBe(0);
    expect(sanitizeInteger("abc", 10)).toBe(10);
  });

  it("should truncate floats", () => {
    expect(sanitizeInteger("42.7")).toBe(42);
  });

  it("should handle negative numbers", () => {
    expect(sanitizeInteger("-42")).toBe(-42);
  });
});

describe("sanitizeFloat", () => {
  it("should convert string to float", () => {
    expect(sanitizeFloat("42.5")).toBe(42.5);
  });

  it("should return default for invalid input", () => {
    expect(sanitizeFloat("abc")).toBe(0);
    expect(sanitizeFloat("abc", 1.5)).toBe(1.5);
  });

  it("should handle negative numbers", () => {
    expect(sanitizeFloat("-42.5")).toBe(-42.5);
  });
});

describe("sanitizeBoolean", () => {
  it("should convert true strings to true", () => {
    expect(sanitizeBoolean("true")).toBe(true);
    expect(sanitizeBoolean("TRUE")).toBe(true);
    expect(sanitizeBoolean("1")).toBe(true);
    expect(sanitizeBoolean("yes")).toBe(true);
    expect(sanitizeBoolean("on")).toBe(true);
  });

  it("should convert false strings to false", () => {
    expect(sanitizeBoolean("false")).toBe(false);
    expect(sanitizeBoolean("0")).toBe(false);
    expect(sanitizeBoolean("no")).toBe(false);
    expect(sanitizeBoolean("off")).toBe(false);
  });

  it("should handle boolean input", () => {
    expect(sanitizeBoolean(true)).toBe(true);
    expect(sanitizeBoolean(false)).toBe(false);
  });
});

describe("limitLength", () => {
  it("should not modify short strings", () => {
    expect(limitLength("short", 10)).toBe("short");
  });

  it("should truncate long strings", () => {
    expect(limitLength("this is a long string", 10)).toBe("this is...");
  });

  it("should use custom suffix", () => {
    // maxLength=10, suffix length=1, so take 9 chars + suffix
    expect(limitLength("this is a long string", 10, "…")).toBe("this is a…");
  });
});

describe("sanitizeDeep", () => {
  it("should prevent prototype pollution", () => {
    const obj = {
      normal: "value",
      __proto__: { polluted: true },
    };

    const sanitized = sanitizeDeep(obj);

    expect(sanitized).not.toHaveProperty("__proto__");
    expect(sanitized.normal).toBe("value");
  });

  it("should skip dangerous keys", () => {
    const obj = {
      normal: "value",
      constructor: "bad",
      prototype: "bad",
    };

    const sanitized = sanitizeDeep(obj);

    expect(sanitized).not.toHaveProperty("constructor");
    expect(sanitized).not.toHaveProperty("prototype");
    expect(sanitized.normal).toBe("value");
  });

  it("should handle nested objects", () => {
    const obj = {
      user: {
        name: "John",
        __proto__: { evil: true },
      },
    };

    const sanitized = sanitizeDeep(obj);

    expect(sanitized.user.name).toBe("John");
    expect(sanitized.user).not.toHaveProperty("__proto__");
  });
});

describe("sanitizeJson", () => {
  it("should parse and sanitize valid JSON", () => {
    const json = '{"name":"John","__proto__":{"evil":true}}';
    const result = sanitizeJson(json);

    expect(result).toHaveProperty("name");
    expect(result).not.toHaveProperty("__proto__");
  });

  it("should return default for invalid JSON", () => {
    expect(sanitizeJson("invalid json")).toBe(null);
    expect(sanitizeJson("invalid json", {})).toEqual({});
  });

  it("should handle non-string input", () => {
    expect(sanitizeJson(123 as any)).toBe(null);
  });
});

describe("SanitizationProfiles", () => {
  it("should have basic profile", () => {
    const result = SanitizationProfiles.basic("  <b>Test</b>  ");
    expect(result).not.toContain("<b>");
    expect(result.trim()).toBe(result);
  });

  it("should have strict profile", () => {
    const result = SanitizationProfiles.strict("<p>Multiple   spaces</p>");
    expect(result).not.toContain("<p>");
    expect(result).not.toContain("   ");
  });

  it("should have username profile", () => {
    const result = SanitizationProfiles.username("John_Doe-123!");
    expect(result).toBe("john_doe-123");
  });

  it("should have slug profile", () => {
    const result = SanitizationProfiles.slug("My Great Article!");
    expect(result).toBe("my-great-article");
  });

  it("should have searchQuery profile", () => {
    const result = SanitizationProfiles.searchQuery("<script>Multiple   spaces</script>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("   ");
  });

  it("should have richText profile", () => {
    const html = '<p>Hello</p><script>alert("xss")</script><a href="javascript:void(0)">Link</a>';
    const result = SanitizationProfiles.richText(html);

    expect(result).toContain("<p>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("javascript:");
  });
});
