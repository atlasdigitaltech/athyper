/**
 * Tests for Content Taxonomy
 */

import { describe, it, expect } from "vitest";

import {
  DocumentKind,
  MAX_SIZE_BY_KIND,
  ALLOWED_CONTENT_TYPES,
  validateFileSize,
  validateContentType,
} from "./content-taxonomy.js";

describe("content-taxonomy", () => {
  describe("DocumentKind enum", () => {
    it("should validate valid document kinds", () => {
      const validKinds = [
        "attachment",
        "generated",
        "export",
        "template",
        "letterhead",
        "avatar",
        "signature",
        "certificate",
        "invoice",
        "receipt",
        "contract",
        "report",
      ];

      validKinds.forEach((kind) => {
        const result = DocumentKind.safeParse(kind);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid document kinds", () => {
      const invalidKinds = ["invalid", "photo", "video", ""];

      invalidKinds.forEach((kind) => {
        const result = DocumentKind.safeParse(kind);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("validateFileSize", () => {
    it("should accept files within size limit", () => {
      // Avatar max is 2 MB
      const result = validateFileSize("avatar", 1 * 1024 * 1024); // 1 MB
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject files exceeding size limit", () => {
      // Avatar max is 2 MB
      const result = validateFileSize("avatar", 3 * 1024 * 1024); // 3 MB
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds limit");
      expect(result.error).toContain("avatar");
    });

    it("should enforce different limits for different kinds", () => {
      const attachmentMax = MAX_SIZE_BY_KIND.attachment; // 100 MB
      const avatarMax = MAX_SIZE_BY_KIND.avatar; // 2 MB

      // 50 MB should be valid for attachment but invalid for avatar
      const size = 50 * 1024 * 1024;

      const attachmentResult = validateFileSize("attachment", size);
      expect(attachmentResult.valid).toBe(true);

      const avatarResult = validateFileSize("avatar", size);
      expect(avatarResult.valid).toBe(false);
    });

    it("should accept file at exact size limit", () => {
      const avatarMax = MAX_SIZE_BY_KIND.avatar;
      const result = validateFileSize("avatar", avatarMax);
      expect(result.valid).toBe(true); // Exact limit is allowed (implementation uses >)
    });

    it("should accept file one byte under limit", () => {
      const avatarMax = MAX_SIZE_BY_KIND.avatar;
      const result = validateFileSize("avatar", avatarMax - 1);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateContentType", () => {
    it("should accept any content type for unrestricted kinds", () => {
      // "attachment" allows any content type
      const result1 = validateContentType("attachment", "application/pdf");
      expect(result1.valid).toBe(true);

      const result2 = validateContentType("attachment", "image/jpeg");
      expect(result2.valid).toBe(true);

      const result3 = validateContentType("attachment", "video/mp4");
      expect(result3.valid).toBe(true);

      const result4 = validateContentType(
        "attachment",
        "application/octet-stream",
      );
      expect(result4.valid).toBe(true);
    });

    it("should enforce content type restrictions for restricted kinds", () => {
      // Avatar only allows PNG and JPEG
      const validResult1 = validateContentType("avatar", "image/png");
      expect(validResult1.valid).toBe(true);

      const validResult2 = validateContentType("avatar", "image/jpeg");
      expect(validResult2.valid).toBe(true);

      const invalidResult = validateContentType("avatar", "image/svg+xml");
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toContain("not allowed");
      expect(invalidResult.error).toContain("avatar");
    });

    it("should validate generated documents (PDF only)", () => {
      const validResult = validateContentType("generated", "application/pdf");
      expect(validResult.valid).toBe(true);

      const invalidResult1 = validateContentType("generated", "image/png");
      expect(invalidResult1.valid).toBe(false);

      const invalidResult2 = validateContentType("generated", "text/plain");
      expect(invalidResult2.valid).toBe(false);
    });

    it("should validate letterhead (PNG, JPEG, SVG)", () => {
      const validPng = validateContentType("letterhead", "image/png");
      expect(validPng.valid).toBe(true);

      const validJpeg = validateContentType("letterhead", "image/jpeg");
      expect(validJpeg.valid).toBe(true);

      const validSvg = validateContentType("letterhead", "image/svg+xml");
      expect(validSvg.valid).toBe(true);

      const invalidPdf = validateContentType("letterhead", "application/pdf");
      expect(invalidPdf.valid).toBe(false);
    });

    it("should validate invoice (PDF only)", () => {
      const validResult = validateContentType("invoice", "application/pdf");
      expect(validResult.valid).toBe(true);

      const invalidResult = validateContentType("invoice", "image/png");
      expect(invalidResult.valid).toBe(false);
    });

    it("should validate export files (CSV and Excel)", () => {
      const validCsv = validateContentType("export", "text/csv");
      expect(validCsv.valid).toBe(true);

      const validExcel = validateContentType(
        "export",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(validExcel.valid).toBe(true);

      const invalidPdf = validateContentType("export", "application/pdf");
      expect(invalidPdf.valid).toBe(false);
    });

    it("should validate receipt (PDF, PNG, JPEG)", () => {
      const validPdf = validateContentType("receipt", "application/pdf");
      expect(validPdf.valid).toBe(true);

      const validPng = validateContentType("receipt", "image/png");
      expect(validPng.valid).toBe(true);

      const validJpeg = validateContentType("receipt", "image/jpeg");
      expect(validJpeg.valid).toBe(true);

      const invalidSvg = validateContentType("receipt", "image/svg+xml");
      expect(invalidSvg.valid).toBe(false);
    });
  });

  describe("size limits", () => {
    it("should have correct size limits defined", () => {
      expect(MAX_SIZE_BY_KIND.attachment).toBe(100 * 1024 * 1024); // 100 MB
      expect(MAX_SIZE_BY_KIND.avatar).toBe(2 * 1024 * 1024); // 2 MB
      expect(MAX_SIZE_BY_KIND.signature).toBe(1 * 1024 * 1024); // 1 MB
      expect(MAX_SIZE_BY_KIND.export).toBe(200 * 1024 * 1024); // 200 MB
    });

    it("should have size limits for all document kinds", () => {
      const kinds = DocumentKind.options;

      kinds.forEach((kind) => {
        expect(MAX_SIZE_BY_KIND[kind]).toBeDefined();
        expect(MAX_SIZE_BY_KIND[kind]).toBeGreaterThan(0);
      });
    });
  });

  describe("content type restrictions", () => {
    it("should have content type rules for all document kinds", () => {
      const kinds = DocumentKind.options;

      kinds.forEach((kind) => {
        expect(ALLOWED_CONTENT_TYPES[kind]).toBeDefined();
      });
    });

    it("should allow unrestricted content types for attachment kind", () => {
      expect(ALLOWED_CONTENT_TYPES.attachment).toBeNull();
    });

    it("should restrict content types for security-sensitive kinds", () => {
      // Generated documents should be PDF only (prevent code execution)
      expect(ALLOWED_CONTENT_TYPES.generated).toEqual(["application/pdf"]);

      // Invoices should be PDF only (prevent tampering)
      expect(ALLOWED_CONTENT_TYPES.invoice).toEqual(["application/pdf"]);

      // Contracts should be PDF only (prevent tampering)
      expect(ALLOWED_CONTENT_TYPES.contract).toEqual(["application/pdf"]);
    });
  });

  describe("integration: validate upload", () => {
    it("should validate a valid avatar upload", () => {
      const sizeValidation = validateFileSize("avatar", 500_000); // 500 KB
      const typeValidation = validateContentType("avatar", "image/png");

      expect(sizeValidation.valid).toBe(true);
      expect(typeValidation.valid).toBe(true);
    });

    it("should reject oversized avatar", () => {
      const sizeValidation = validateFileSize("avatar", 3_000_000); // 3 MB
      const typeValidation = validateContentType("avatar", "image/png");

      expect(sizeValidation.valid).toBe(false);
      expect(typeValidation.valid).toBe(true);
    });

    it("should reject wrong content type for invoice", () => {
      const sizeValidation = validateFileSize("invoice", 1_000_000); // 1 MB
      const typeValidation = validateContentType("invoice", "image/jpeg");

      expect(sizeValidation.valid).toBe(true);
      expect(typeValidation.valid).toBe(false);
    });

    it("should accept valid contract upload", () => {
      const sizeValidation = validateFileSize("contract", 10_000_000); // 10 MB
      const typeValidation = validateContentType("contract", "application/pdf");

      expect(sizeValidation.valid).toBe(true);
      expect(typeValidation.valid).toBe(true);
    });

    it("should accept unrestricted attachment", () => {
      const sizeValidation = validateFileSize("attachment", 50_000_000); // 50 MB
      const typeValidation = validateContentType("attachment", "video/mp4");

      expect(sizeValidation.valid).toBe(true);
      expect(typeValidation.valid).toBe(true);
    });
  });
});
