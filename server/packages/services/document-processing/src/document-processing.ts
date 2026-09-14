import { createHash } from "node:crypto";
import { downloadForExtraction } from "./bounded-download.js";
import { extname } from "node:path";
import type {
  ContentExtractor,
  DocumentExtractionRequest,
  DocumentExtractionScheduler,
} from "@athyper/server-contract-content-extraction";
import type {
  JobExecutionContext,
  JobExecutionResult,
  JobHandler,
  JobPublisher,
} from "@athyper/server-contract-jobs";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type {
  SearchDocument,
  SearchIndex,
} from "@athyper/server-contract-search";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

export const DOCUMENT_PROCESSING_QUEUE = "documents.processing";
export const EXTRACT_AND_INDEX_JOB = "documents.extract-index";
export interface DocumentProcessingCandidate {
  readonly attachmentId: string;
  readonly tenantId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly storageKey: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly extractionStatus: string | null;
  readonly extractedText: string | null;
  readonly piiTypes: readonly string[];
  readonly updatedAt: string;
}
export interface ExtractedDocumentUpdate {
  readonly attachmentId: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly text: string;
  readonly piiTypes: readonly string[];
  readonly provider: string;
  readonly durationMs: number;
  readonly metadata: Readonly<Record<string, string>>;
}
export interface DocumentProcessingRepository<Transaction> {
  load(
    tenantId: string,
    attachmentId: string,
    transaction: Transaction,
  ): Promise<DocumentProcessingCandidate | null>;
  saveExtracted(
    input: ExtractedDocumentUpdate,
    transaction: Transaction,
  ): Promise<void>;
  markSkipped(
    tenantId: string,
    attachmentId: string,
    principalId: string,
    reason: string,
    transaction: Transaction,
  ): Promise<void>;
  markFailed(
    tenantId: string,
    attachmentId: string,
    principalId: string,
    reason: string,
    transaction: Transaction,
  ): Promise<void>;
}
export interface PiiDetector {
  classify(text: string): readonly string[];
}
export interface DocumentProcessingOptions<Transaction> {
  readonly repository: DocumentProcessingRepository<Transaction>;
  readonly transactions: PlaneTransactionCoordinator<Transaction>;
  readonly storage: ObjectStorage;
  readonly extractor: ContentExtractor;
  readonly searchIndex: SearchIndex;
  readonly maxExtractBytes?: number;
  readonly piiDetector?: PiiDetector;
}

// The job-level timeout bounds how long the runner waits before declaring the job failed/retried; it
// does not itself cancel in-flight work — that happens because context.signal (aborted once this timer
// fires) is threaded into extractor.extract() below. The overhead covers download + checksum + PII
// classify + index upsert, on top of the adapter's own request timeout.
export function documentExtractionTimeoutMs(adapterTimeoutMs: number): number {
  const overheadMs = 60_000;
  return adapterTimeoutMs + overheadMs;
}
export function createDocumentExtractionScheduler(
  jobs: JobPublisher,
  adapterTimeoutMs: number,
): DocumentExtractionScheduler {
  const timeoutMs = documentExtractionTimeoutMs(adapterTimeoutMs);
  return {
    async schedule(request) {
      await jobs.enqueue(
        DOCUMENT_PROCESSING_QUEUE,
        EXTRACT_AND_INDEX_JOB,
        request,
        {
          jobId: `extract-${request.planeKey}-${request.tenantId}-${request.attachmentId}`,
          maxAttempts: 5,
          timeoutMs,
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    },
  };
}
export function createDocumentProcessingHandler<Transaction>(
  options: DocumentProcessingOptions<Transaction>,
): JobHandler<typeof EXTRACT_AND_INDEX_JOB, DocumentExtractionRequest> {
  const maxBytes = options.maxExtractBytes ?? 50 * 1_024 * 1_024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    throw new Error("maxExtractBytes must be a positive safe integer");
  return {
    async handle(job, context): Promise<JobExecutionResult> {
      const request = valid(job.data);
      const actor = {
        tenantId: request.tenantId,
        principalId: request.principalId,
      };
      throwIfAborted(context.signal);
      const candidate = await options.transactions.run(
        request.planeKey,
        actor,
        (tx) =>
          options.repository.load(request.tenantId, request.attachmentId, tx),
      );
      if (!candidate) {
        await options.searchIndex.remove(searchId(request));
        return {
          status: "discarded",
          reason: "attachment_not_found_or_not_eligible",
        };
      }
      if (
        candidate.extractionStatus === "extracted" &&
        candidate.extractedText !== null
      ) {
        await options.searchIndex.upsert(
          searchDocument(
            request,
            candidate,
            candidate.extractedText,
            candidate.piiTypes,
          ),
        );
        return {
          status: "completed",
          output: {
            attachmentId: candidate.attachmentId,
            indexed: true,
            reusedExtraction: true,
          },
        };
      }
      if (
        !supported(candidate.contentType, candidate.fileName) ||
        candidate.sizeBytes > maxBytes
      ) {
        const reason =
          candidate.sizeBytes > maxBytes
            ? "size_limit"
            : "unsupported_media_type";
        await options.transactions.run(request.planeKey, actor, (tx) =>
          options.repository.markSkipped(
            request.tenantId,
            request.attachmentId,
            request.principalId,
            reason,
            tx,
          ),
        );
        await options.searchIndex.remove(searchId(request));
        return { status: "discarded", reason };
      }
      await context.reportProgress({ stage: "download" });
      throwIfAborted(context.signal);
      const bytes = await downloadForExtraction(
        options.storage,
        candidate.storageKey,
        maxBytes,
        context.signal,
      );
      if (bytes.byteLength > maxBytes)
        throw new Error("Downloaded attachment exceeds extraction limit");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== candidate.sha256)
        throw new Error("Attachment checksum mismatch before extraction");
      let extracted;
      try {
        await context.reportProgress({ stage: "extract" });
        extracted = await options.extractor.extract({
          content: bytes,
          contentType: candidate.contentType,
          fileName: candidate.fileName,
          signal: context.signal,
        });
      } catch (error) {
        await options.transactions
          .run(request.planeKey, actor, (tx) =>
            options.repository.markFailed(
              request.tenantId,
              request.attachmentId,
              request.principalId,
              error instanceof Error ? error.message : "extraction failed",
              tx,
            ),
          )
          .catch(() => undefined);
        throw error;
      }
      throwIfAborted(context.signal);
      const piiTypes = (options.piiDetector ?? defaultPiiDetector).classify(
        extracted.text,
      );
      await options.transactions.run(request.planeKey, actor, (tx) =>
        options.repository.saveExtracted(
          {
            attachmentId: request.attachmentId,
            tenantId: request.tenantId,
            principalId: request.principalId,
            text: extracted.text,
            piiTypes,
            provider: extracted.provider,
            durationMs: extracted.durationMs,
            metadata: extracted.metadata,
          },
          tx,
        ),
      );
      await context.reportProgress({ stage: "index" });
      await options.searchIndex.upsert(
        searchDocument(request, candidate, extracted.text, piiTypes),
      );
      return {
        status: "completed",
        output: {
          attachmentId: request.attachmentId,
          characters: extracted.text.length,
          piiTypes,
          indexed: true,
        },
      };
    },
  };
}
function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted)
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Document extraction job aborted");
}
function valid(value: DocumentExtractionRequest) {
  if (
    !["studio", "neon", "mesh"].includes(value.planeKey) ||
    !uuid(value.tenantId) ||
    !uuid(value.attachmentId) ||
    !uuid(value.principalId)
  )
    throw new Error("Invalid document extraction job payload");
  return value;
}
function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
const prefixes = [
  "text/",
  "application/pdf",
  "application/msword",
  "application/vnd.ms-",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.oasis.opendocument",
  "application/rtf",
  "application/xml",
  "application/json",
  "application/xhtml+xml",
  "image/",
];
const blocked = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".vbs",
  ".js",
  ".ps1",
  ".jar",
  ".sh",
  ".msi",
]);
function supported(contentType: string, fileName: string) {
  return (
    prefixes.some((prefix) => contentType.toLowerCase().startsWith(prefix)) &&
    !blocked.has(extname(fileName.toLowerCase()))
  );
}
const patterns = [
  { type: "ssn", rx: /\b\d{3}-\d{2}-\d{4}\b/ },
  { type: "email", rx: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { type: "iban", rx: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/ },
  {
    type: "phone",
    rx: /\b(?:\+\d{1,3}[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}\b/,
  },
  {
    type: "ip_address",
    rx: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})\b/,
  },
];
export const defaultPiiDetector: PiiDetector = {
  classify(text) {
    const found = patterns
      .filter(({ rx }) => rx.test(text))
      .map(({ type }) => type);
    if (
      [...text.matchAll(/\b(?:\d[ -]?){12,18}\d\b/g)].some((match) =>
        luhn(match[0].replace(/\D/g, "")),
      )
    )
      found.push("credit_card");
    return [...new Set(found)].sort();
  },
};
export function classifyPii(text: string): readonly string[] {
  return defaultPiiDetector.classify(text);
}
function luhn(value: string): boolean {
  let sum = 0,
    alternate = false;
  for (let index = value.length - 1; index >= 0; index--) {
    let digit = Number(value[index]);
    if (alternate && (digit *= 2) > 9) digit -= 9;
    sum += digit;
    alternate = !alternate;
  }
  return value.length >= 13 && sum % 10 === 0;
}
function searchId(request: DocumentExtractionRequest) {
  return `${request.planeKey}:${request.tenantId}:${request.attachmentId}`;
}
function searchDocument(
  request: DocumentExtractionRequest,
  candidate: DocumentProcessingCandidate,
  text: string,
  piiTypes: readonly string[],
): SearchDocument {
  return {
    id: searchId(request),
    planeKey: request.planeKey,
    tenantId: request.tenantId,
    attachmentId: request.attachmentId,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    title: candidate.fileName,
    text,
    contentType: candidate.contentType,
    fileName: candidate.fileName,
    piiTypes,
    updatedAt: candidate.updatedAt,
  };
}
