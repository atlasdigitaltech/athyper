"use client";

/**
 * Registers code-resident document services that remain outside the
 * metadata-driven page chrome. Identity, status, navigation, and actions are
 * owned exclusively by the meta-entity header.
 */
import { registerPostingStrategy } from "@athyper/runtime-canvas/document-runtime";
import { apInvoicePostingStrategy } from "@athyper/content-ui";

registerPostingStrategy(apInvoicePostingStrategy);

export const DOCUMENT_RUNTIME_BOOT_COMPLETE = true;
