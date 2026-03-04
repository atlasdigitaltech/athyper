/**
 * Tests for Content API Client
 */

import { describe, it, expect } from "vitest";

import { computeFileHash, ContentApiError } from "./contentClient.js";

describe("contentClient", () => {
  describe("computeFileHash", () => {
    it("should compute SHA-256 hash of file content", async () => {
      // Create a simple text file
      const content = "Hello, World!";
      const blob = new Blob([content], { type: "text/plain" });
      const file = new File([blob], "test.txt", { type: "text/plain" });

      const hash = await computeFileHash(file);

      // SHA-256 of "Hello, World!" is:
      // dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f
      expect(hash).toBe("dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f");
    });

    it("should produce consistent hashes for same content", async () => {
      const content = "Test content";
      const file1 = new File([content], "file1.txt");
      const file2 = new File([content], "file2.txt");

      const hash1 = await computeFileHash(file1);
      const hash2 = await computeFileHash(file2);

      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different content", async () => {
      const file1 = new File(["Content A"], "file1.txt");
      const file2 = new File(["Content B"], "file2.txt");

      const hash1 = await computeFileHash(file1);
      const hash2 = await computeFileHash(file2);

      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty file", async () => {
      const file = new File([], "empty.txt");
      const hash = await computeFileHash(file);

      // SHA-256 of empty string
      expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("should handle binary data", async () => {
      // Create binary data (simple byte sequence)
      const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 255]);
      const file = new File([bytes], "binary.dat");

      const hash = await computeFileHash(file);

      // Should produce a valid hex string
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should return lowercase hex string", async () => {
      const file = new File(["test"], "test.txt");
      const hash = await computeFileHash(file);

      // Check all characters are lowercase hex
      expect(hash).toMatch(/^[0-9a-f]+$/);
      expect(hash.length).toBe(64); // SHA-256 produces 32 bytes = 64 hex chars
    });

    it("should handle large files (chunking not needed for SHA-256)", async () => {
      // Create a 1MB file
      const size = 1024 * 1024;
      const buffer = new ArrayBuffer(size);
      const view = new Uint8Array(buffer);

      // Fill with pattern
      for (let i = 0; i < size; i++) {
        view[i] = i % 256;
      }

      const file = new File([buffer], "large.bin");
      const hash = await computeFileHash(file);

      // Should successfully hash without errors
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("ContentApiError", () => {
    it("should create error with all properties", () => {
      const error = new ContentApiError(
        "VALIDATION_ERROR",
        "Invalid file size",
        400,
      );

      expect(error.name).toBe("ContentApiError");
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.message).toBe("Invalid file size");
      expect(error.status).toBe(400);
      expect(error instanceof Error).toBe(true);
    });

    it("should create error without status code", () => {
      const error = new ContentApiError("UNKNOWN", "Something went wrong");

      expect(error.code).toBe("UNKNOWN");
      expect(error.message).toBe("Something went wrong");
      expect(error.status).toBeUndefined();
    });

    it("should be catchable as Error", () => {
      const throwError = () => {
        throw new ContentApiError("TEST", "Test error");
      };

      expect(throwError).toThrow(Error);
      expect(throwError).toThrow(ContentApiError);
    });

    it("should preserve error message in stack trace", () => {
      const error = new ContentApiError("TEST", "Test error message");

      expect(error.stack).toContain("Test error message");
    });
  });
});
