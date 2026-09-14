import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { MalwareScanner } from "@athyper/server-contract-malware-scanning";
import { descriptorFor } from "../query-service.js";
import {
  mergeFieldViolations,
  validateFieldWriteAuthorization,
  validateRecordInput,
} from "../field-validation.js";
import type {
  ImportErrorReportStore,
  ImportRowValidator,
  ImportWorkbookIntake,
} from "./transfer-service.js";
import type { RecordExportArtifactStore } from "./transfer-jobs.js";
import {
  createXlsxTemplate,
  parseXlsxWorkbook,
  xlsxArtifact,
} from "./xlsx-workbook-codec.js";
import {
  parseCsvImport,
  parseJsonImport,
  structuredImportContentType,
  structuredImportFormat,
} from "./structured-import-file-codec.js";

export function createMetadataImportRowValidator(
  metadata: MetadataReader,
  authorizer: Authorizer,
): ImportRowValidator {
  return {
    async validate(
      context: VerifiedRequestContext,
      entityCode,
      row,
      rowNumber,
      requestedOperation,
    ) {
      const operation = requestedOperation ?? "create",
        descriptor = await descriptorFor(metadata, context, entityCode);
      if (descriptor.listPresentation?.dataOperations?.draftOnly)
        return { rowNumber, valid: true, errors: [] };
      const identity =
          descriptor.listPresentation?.identityField ??
          descriptor.fields.find(
            (field) => field.storagePath === descriptor.storage.idField,
          )?.key,
        governed = Boolean(
          descriptor.listPresentation?.dataOperations?.importAdapterKey,
        ),
        knownFields = new Set(descriptor.fields.map((field) => field.key)),
        candidate = governed
          ? Object.fromEntries(
              Object.entries(row).filter(([key]) => knownFields.has(key)),
            )
          : row,
        mutationRow =
          operation === "create"
            ? candidate
            : Object.fromEntries(
                Object.entries(candidate).filter(([key]) => key !== identity),
              ),
        missingIdentity =
          !governed &&
          operation !== "create" &&
          (!identity ||
            row[identity] === undefined ||
            row[identity] === null ||
            row[identity] === "")
            ? {
                [identity ?? "identity"]: [
                  {
                    code: "IMPORT_IDENTITY_REQUIRED",
                    message:
                      "The entity identity field is required for update and upsert",
                  },
                ],
              }
            : {};
      const violations = mergeFieldViolations(
        validateRecordInput(
          descriptor,
          governed || operation !== "create" ? "patch" : "create",
          mutationRow,
        ),
        await validateFieldWriteAuthorization(
          authorizer,
          context,
          descriptor,
          mutationRow,
        ),
        missingIdentity,
      );
      const errors = Object.entries(violations).flatMap(([field, items]) =>
        items.map((item) => `${item.code}:${field}:${item.message}`),
      );
      return { rowNumber, valid: errors.length === 0, errors };
    },
  };
}

export function createObjectStorageRecordTransferArtifactStore(
  storage: ObjectStorage,
  input: { maxBytes?: number; downloadTtlSeconds?: number } = {},
): RecordExportArtifactStore {
  const maxBytes = input.maxBytes ?? 256 * 1024 * 1024,
    ttl = input.downloadTtlSeconds ?? 300;
  const write = async (
    key: string,
    content: AsyncIterable<Uint8Array>,
    contentType: string,
  ) => {
    if (storage.putStream) {
      await storage.putStream(key, content, { contentType });
      return key;
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of content) {
      size += chunk.byteLength;
      if (size > maxBytes)
        throw new Error(`Record transfer artifact exceeds ${maxBytes} bytes`);
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    await storage.put(key, bytes, { contentType });
    return key;
  };
  return {
    write: ({ planeKey, tenantId, sessionId, content, contentType }) =>
      write(
        `record-transfers/${planeKey}/${tenantId}/imports/${sessionId}/errors.ndjson`,
        content,
        contentType,
      ),
    writeExport: ({
      planeKey,
      tenantId,
      exportRequestId,
      content,
      contentType,
      extension,
      fileName,
    }) =>
      write(
        `record-transfers/${planeKey}/${tenantId}/exports/${exportRequestId}/${safeArtifactName(fileName ?? "records", extension)}`,
        content,
        contentType,
      ),
    createDownloadUrl: (key, expirySeconds) =>
      storage.createDownloadUrl(key, Math.min(expirySeconds, ttl)),
  };
}

function safeArtifactName(value: string, extension: string) {
  const base =
    value
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^[-_.]+|[-_.]+$/g, "")
      .slice(0, 120) || "records";
  return `${base}.${extension}`;
}

export function createObjectStorageImportWorkbookIntake(
  storage: ObjectStorage,
  scanner: MalwareScanner,
  input: { uploadTtlSeconds?: number; downloadTtlSeconds?: number } = {},
): ImportWorkbookIntake {
  const uploadTtl = input.uploadTtlSeconds ?? 300,
    downloadTtl = input.downloadTtlSeconds ?? 300;
  const sourceKey = (planeKey: string, tenantId: string, sessionId: string) =>
    `record-transfers/${planeKey}/${tenantId}/imports/${sessionId}/quarantine/source.upload`;
  return {
    async prepareUpload({
      planeKey,
      tenantId,
      sessionId,
      fileName,
      sizeBytes,
      maxBytes,
    }) {
      requireStructuredFile(fileName, sizeBytes, maxBytes);
      return {
        uploadUrl: await storage.createUploadUrl(
          sourceKey(planeKey, tenantId, sessionId),
          uploadTtl,
        ),
        expiresInSeconds: uploadTtl,
      };
    },
    async read({
      planeKey,
      tenantId,
      sessionId,
      fileName,
      sizeBytes,
      maxBytes,
      maxRows,
      allowedFields,
    }) {
      const format = requireStructuredFile(fileName, sizeBytes, maxBytes),
        key = sourceKey(planeKey, tenantId, sessionId);
      if (!(await storage.exists(key)))
        throw transferError(
          409,
          "IMPORT_FILE_UPLOAD_MISSING",
          "The import file upload has not completed.",
        );
      const bytes = await storage.get(key);
      if (bytes.byteLength !== sizeBytes || bytes.byteLength > maxBytes)
        throw transferError(
          409,
          "IMPORT_FILE_SIZE_MISMATCH",
          "The uploaded file size does not match the reservation.",
        );
      let scan;
      try {
        scan = await scanner.scan({
          content: bytes,
          fileName,
          contentType: structuredImportContentType(format),
          sizeBytes: bytes.byteLength,
        });
      } catch {
        throw transferError(
          503,
          "IMPORT_FILE_SCAN_UNAVAILABLE",
          "Import-file malware scanning is unavailable; the upload remains quarantined.",
        );
      }
      if (scan.status !== "clean")
        throw transferError(
          422,
          "IMPORT_FILE_MALWARE_DETECTED",
          "The import file failed malware scanning.",
        );
      return format === "xlsx"
        ? parseXlsxWorkbook(bytes, { maxRows, allowedFields })
        : format === "csv"
          ? parseCsvImport(bytes, { maxRows, allowedFields })
          : parseJsonImport(bytes, { maxRows, allowedFields });
    },
    async createTemplate({
      planeKey,
      tenantId,
      entityCode,
      descriptorHash,
      fields,
    }) {
      const key = `record-transfers/${planeKey}/${tenantId}/templates/${entityCode}/${descriptorHash}.xlsx`,
        bytes = await createXlsxTemplate({
          entityCode,
          descriptorHash,
          fields,
        });
      if (storage.putIfAbsent)
        await storage.putIfAbsent(key, bytes, {
          contentType: xlsxArtifact.contentType,
          metadata: { descriptorHash, entityCode },
        });
      else if (!(await storage.exists(key)))
        await storage.put(key, bytes, {
          contentType: xlsxArtifact.contentType,
          metadata: { descriptorHash, entityCode },
        });
      return {
        url: await storage.createDownloadUrl(key, downloadTtl),
        expiresInSeconds: downloadTtl,
      };
    },
  };
}

function requireStructuredFile(
  fileName: string,
  sizeBytes: number,
  maxBytes: number,
) {
  let format;
  try {
    format = structuredImportFormat(fileName);
  } catch (error) {
    if (error instanceof Error && "code" in error)
      throw transferError(400, String(error.code), error.message);
    throw error;
  }
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > maxBytes
  )
    throw transferError(
      413,
      "IMPORT_FILE_SIZE_INVALID",
      `The import file must be no larger than ${maxBytes} bytes.`,
    );
  return format;
}
function transferError(statusCode: number, code: string, message: string) {
  return Object.assign(new Error(message), { statusCode, code });
}
