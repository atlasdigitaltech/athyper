import {
  ApiTransportError,
  type HttpClient,
} from "@athyper/platform-api-client";
import { runAttachmentUpload } from "@athyper/platform-communications-collaboration-ui";
import {
  attachmentStage,
  attachmentStatus,
  attachmentFinalize,
} from "./collaboration-operations";

/** One record/version adapter around the shared uncertain-finalization lifecycle. */
export function uploadRecordAttachment(
  client: HttpClient,
  input: {
    attachmentId: string;
    file: File;
    contentType: string;
    entityType: string;
    entityId: string;
    parentAttachmentId?: string;
    expectedSeriesVersion?: number;
    retry?: boolean;
    signal?: AbortSignal;
    onFinalizing?: () => void;
  },
) {
  const { attachmentId, file, contentType, entityType, entityId, signal } =
    input;
  return runAttachmentUpload({
    file,
    contentType,
    signal,
    retry: input.retry,
    onFinalizing: input.onFinalizing,
    status: () =>
      client
        .request(attachmentStatus(attachmentId), { signal })
        .catch((cause) => {
          if (cause instanceof ApiTransportError && cause.status === 404)
            return undefined;
          throw cause;
        }),
    stage: () =>
      client.request(attachmentStage, {
        signal,
        idempotencyKey: attachmentId,
        body: {
          attachmentId,
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
          entityType,
          entityId,
          ...(input.parentAttachmentId
            ? {
                parentAttachmentId: input.parentAttachmentId,
                expectedSeriesVersion: input.expectedSeriesVersion,
                duplicateNameChoice: "new_version" as const,
              }
            : {}),
        },
      }),
    finalize: (signal) =>
      client.request(attachmentFinalize(attachmentId), {
        signal,
        idempotencyKey: attachmentId,
        body: { contentType },
      }),
  });
}
