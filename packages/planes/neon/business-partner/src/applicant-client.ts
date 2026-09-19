import {
  createOperation,
  uploadSignedObject,
  type HttpClient,
} from "@athyper/platform-api-client";

export type SupplierApplicantStatus = Readonly<{
  requestId: string;
  requestNo: string;
  status: string;
  rowVersion: number;
  validationSummary: Readonly<Record<string, unknown>>;
  editablePayload: Readonly<Record<string, unknown>>;
  updatedAt?: string;
}>;
type Payload = Readonly<Record<string, unknown>>;
const root = "/api/neon/external/business-partner-invitations/supplier";
const requestPath = (id: string | number | undefined) => {
  if (!id) throw new TypeError("Application ID is required");
  return `${root}/requests/${encodeURIComponent(id)}`;
};
const accept = createOperation<{ request: { id: string } }, Payload>({
  method: "POST",
  path: `${root}/accept`,
});
const status = createOperation<SupplierApplicantStatus>({
  method: "GET",
  path: ({ requestId }) => `${requestPath(requestId)}/status`,
});
const correction = createOperation<unknown, Payload>({
  method: "PATCH",
  path: ({ requestId }) => `${requestPath(requestId)}/correction`,
});
const stage = createOperation<{ uploadUrl: string }, Payload>({
  method: "POST",
  path: ({ requestId }) => `${requestPath(requestId)}/evidence/stage`,
});
const complete = createOperation<unknown, Payload>({
  method: "POST",
  path: ({ requestId }) => `${requestPath(requestId)}/evidence/complete`,
});
const submit = createOperation<SupplierApplicantStatus, Payload>({
  method: "POST",
  path: ({ requestId }) => `${requestPath(requestId)}/submit`,
});

export function createSupplierApplicantClient(
  http: HttpClient,
  upload = uploadSignedObject,
) {
  return {
    accept: (body: Payload) => http.request(accept, { body }),
    status: (requestId: string) =>
      http.request(status, { params: { requestId } }),
    correction: (requestId: string, body: Payload) =>
      http.request(correction, { params: { requestId }, body }),
    submit: (requestId: string, body: Payload) =>
      http.request(submit, { params: { requestId }, body }),
    async upload(requestId: string, file: File) {
      const attachmentId = crypto.randomUUID(),
        contentType = file.type || "application/octet-stream";
      const staged = await http.request(stage, {
        params: { requestId },
        body: {
          attachmentId,
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
        },
      });
      await upload({ url: staged.uploadUrl, body: file, contentType });
      await http.request(complete, {
        params: { requestId },
        body: {
          evidenceKind: "supplier_registration",
          attachmentId,
          contentType,
          classificationCode: "confidential",
        },
      });
    },
  };
}
