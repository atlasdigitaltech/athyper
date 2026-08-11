export interface ContentExtractionInput {
  readonly content: Uint8Array;
  readonly contentType: string;
  readonly fileName?: string;
  readonly signal?: AbortSignal;
}

export interface ContentExtractionResult {
  readonly text: string;
  readonly detectedContentType?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly provider: string;
  readonly durationMs: number;
}

export interface ContentExtractor {
  extract(input: ContentExtractionInput): Promise<ContentExtractionResult>;
}

export interface DocumentExtractionRequest {
  readonly planeKey: "studio" | "neon" | "mesh";
  readonly tenantId: string;
  readonly attachmentId: string;
  readonly principalId: string;
}

export interface DocumentExtractionScheduler {
  schedule(request: DocumentExtractionRequest): Promise<void>;
}
