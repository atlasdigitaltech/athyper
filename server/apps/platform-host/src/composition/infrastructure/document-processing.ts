import { qualifyPreviewRenderer } from "@athyper/server-adapter-preview-renderer";
import { createClamAvMalwareScanner } from "@athyper/server-adapter-malware-clamav";
import { createTikaContentExtractor } from "@athyper/server-adapter-document-parser-tika";
import { createMeilisearchIndex } from "@athyper/server-adapter-search-meilisearch";
import { createGotenbergRenderer } from "@athyper/server-adapter-rendering";
import { createPreviewRendererAdapter } from "@athyper/server-adapter-preview-renderer";
import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import type { HostConfig } from "../../config/environment.js";
import type { Container } from "../../kernel/container.js";
import type { AdapterRegistrationDependencies } from "./adapter-contract.js";

export type DocumentProcessingRegistrationDependencies = Pick<
  AdapterRegistrationDependencies,
  | "createMalwareScanner"
  | "createContentExtractor"
  | "createSearchIndex"
  | "createPdfRenderer"
  | "createPreviewRenderer"
>;

const DEFAULT_DEPENDENCIES: DocumentProcessingRegistrationDependencies = {
  createMalwareScanner: createClamAvMalwareScanner,
  createContentExtractor: createTikaContentExtractor,
  createSearchIndex: createMeilisearchIndex,
  createPdfRenderer: createGotenbergRenderer,
  createPreviewRenderer: createPreviewRendererAdapter,
};

export function registerDocumentProcessing(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  overrides: Partial<DocumentProcessingRegistrationDependencies> = {},
) {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  if (config.malwareScanning.host) {
    const malwareScanner = dependencies.createMalwareScanner({
      host: config.malwareScanning.host,
      port: config.malwareScanning.port,
      timeoutMs: config.malwareScanning.timeoutMs,
      maxBytes: config.malwareScanning.maxBytes,
      signatureMaxAgeMs: config.malwareScanning.signatureMaxAgeMs,
      signatureCheckIntervalMs: config.malwareScanning.signatureCheckIntervalMs,
    });
    container.adapters.malwareScanner = malwareScanner;
    lifecycle.onReady(async () => {
      const health = await malwareScanner.health();
      if (health.status === "unhealthy")
        throw new Error(
          health.message ?? "Configured malware scanner is unhealthy",
        );
    });
    lifecycle.onShutdown(() => malwareScanner.close());
  }

  if (config.contentExtraction.baseUrl) {
    const contentExtractor = dependencies.createContentExtractor({
      baseUrl: config.contentExtraction.baseUrl,
      timeoutMs: config.contentExtraction.timeoutMs,
      maxInputBytes: config.contentExtraction.maxInputBytes,
      maxTextChars: config.contentExtraction.maxTextChars,
    });
    container.adapters.contentExtractor = contentExtractor;
    lifecycle.onReady(async () => {
      try {
        const health = await contentExtractor.health();
        if (health.status === "unhealthy")
          console.warn(
            "[extraction] Provider unavailable; original-file access remains available",
          );
      } catch {
        console.warn(
          "[extraction] Provider unavailable; original-file access remains available",
        );
      }
    });
    lifecycle.onShutdown(() => contentExtractor.close());
  }

  if (config.search.baseUrl && config.search.apiKey) {
    const searchIndex = dependencies.createSearchIndex({
      baseUrl: config.search.baseUrl,
      apiKey: config.search.apiKey,
      indexUid: config.search.indexUid,
      timeoutMs: config.search.timeoutMs,
    });
    container.adapters.searchIndex = searchIndex;
    lifecycle.onReady(async () => {
      // An index outage must not stop file scanning or durable text extraction.
      // Jobs retain extracted text and retry indexing without rerunning the parser.
      try {
        if (config.mode === "api") await searchIndex.initialize();
      } catch {
        console.warn(
          "[search] Index initialization deferred; extraction remains available",
        );
      }
    });
    lifecycle.onShutdown(() => searchIndex.close());
  }

  if (config.rendering.baseUrl) {
    const pdfRenderer = dependencies.createPdfRenderer({
      baseUrl: config.rendering.baseUrl,
      timeoutMs: config.rendering.timeoutMs,
      maxHtmlBytes: config.rendering.maxHtmlBytes,
      maxPdfBytes: config.rendering.maxPdfBytes,
    });
    container.adapters.pdfRenderer = pdfRenderer;
    lifecycle.onReady(async () => {
      const health = await pdfRenderer.health();
      if (health.status === "unhealthy") {
        throw new Error(
          health.message ?? "Configured PDF renderer is unhealthy",
        );
      }
    });
  }

  // Gotenberg serves restricted HTML-to-PDF only. Derivatives require a separate
  // compatible endpoint and real conversion qualification, never just /health.
  if (config.rendering.previewBaseUrl) {
    const renderer = dependencies.createPreviewRenderer({
      baseUrl: config.rendering.previewBaseUrl,
      timeoutMs: 30_000,
      maxSourceBytes: 20 * 1024 * 1024,
      maxOutputBytes: 10 * 1024 * 1024,
    });
    let qualification: Promise<void> | undefined;
    const qualify = () =>
      (qualification ??= qualifyPreviewRenderer(renderer).catch((error) => {
        qualification = undefined; // A transient outage can recover on the next job.
        throw error;
      }));
    const startup = qualify().catch(() => {
      console.warn(
        "[preview] Real conversion qualification failed; derivative rendering is unavailable",
      );
    });
    container.adapters.previewRenderer = {
      render: async (input) => {
        await qualify();
        return renderer.render(input);
      },
      health: () => renderer.health(),
    };
    lifecycle.onReady(async () => {
      await startup;
    });
  }
}
