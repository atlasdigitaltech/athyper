/**
 * IAM (Identity and Access Management) Module
 *
 * Provides comprehensive identity and access management including:
 * - Persona Model: 7 personas with capability matrix
 * - IAM Routes: REST API endpoints for IAM administration
 * - MFA: Multi-Factor Authentication (TOTP, backup codes, trusted devices)
 *
 * Part of the Platform Foundation services.
 */

export const moduleCode = "platform-iam";
export const moduleName = "Identity and Access Management";

// MFA (Multi-Factor Authentication)
export * from "./mfa/index.js";

// Persona Model (Permission Action Model)
export * from "./persona-model/index.js";

// IAM Management Routes
export * from "./routes/index.js";
