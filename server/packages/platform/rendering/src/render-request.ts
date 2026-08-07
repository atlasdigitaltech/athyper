/** Input/output shapes for the durable render orchestration layer. */

export interface RenderDocumentInput {
  tenantId:           string;
  tenantCode?:        string;
  companyCode?:       string;
  entityType:         string;
  entityId:           string;
  operation:          string;
  variant?:           string;
  locale?:            string;
  html:               string;
  renderOptions?:     import("./renderer.port.js").PdfRenderOptions;
  requestedBy:        string;
  templateVersionId?: string;
}

export interface RenderDocumentResult {
  outputId:   string;
  storageKey: string | null;
  status:     "RENDERED" | "FAILED";
  error?:     string;
}
