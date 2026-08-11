import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PdfRenderOptions } from "@athyper/server-contract-rendering";

export interface PublishedDocumentTemplate {
  readonly bindingId: string;
  readonly templateId: string;
  readonly templateVersionId: string;
  readonly version: number;
  readonly checksum: string;
  readonly name: string;
  readonly engine: "handlebars";
  readonly locale: string;
  readonly variant: string;
  readonly html: string;
  readonly stylesCss?: string;
  readonly variablesSchema?: Readonly<Record<string, unknown>>;
  readonly renderOptions: PdfRenderOptions;
}

export interface RenderDocumentCommand {
  readonly context: VerifiedRequestContext;
  readonly entityType: string;
  readonly entityId: string;
  readonly operationCode: string;
  readonly variant?: string;
  readonly locale?: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly fileName?: string;
  readonly idempotencyKey?: string;
}

export interface GeneratedDocument {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly fileName: string;
  readonly contentType: "application/pdf";
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly templateId: string;
  readonly templateVersionId: string;
  readonly templateVersion: number;
  readonly createdAt: string;
}

export interface DownloadDocumentCommand { readonly context: VerifiedRequestContext; readonly documentId: string; }
export interface DocumentDownload { readonly document: GeneratedDocument; readonly url: string; readonly expiresInSeconds: number; }

export interface DocumentService {
  render(command: RenderDocumentCommand): Promise<GeneratedDocument>;
  createDownload(command: DownloadDocumentCommand): Promise<DocumentDownload>;
}
