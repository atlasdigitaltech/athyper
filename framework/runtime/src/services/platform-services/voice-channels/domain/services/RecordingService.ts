/**
 * Recording Service — manages call recordings, storage, and presigned URLs.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { TelMetrics } from "../../observability/metrics.js";
import type {
  RecordingRepo,
  CallRecording,
} from "../../persistence/RecordingRepo.js";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";

export class RecordingService {
  constructor(
    private readonly repo: RecordingRepo,
    private readonly storage: ObjectStorageAdapter,
    private readonly metrics: TelMetrics,
    private readonly logger: Logger,
    private readonly storagePrefix: string = "recordings",
  ) {}

  async registerRecording(
    tenantId: string,
    sessionId: string,
    recordingRef: string,
    createdBy: string,
  ): Promise<CallRecording> {
    this.logger.info(
      { tenantId, sessionId, recordingRef },
      "[recording] Registering recording",
    );

    return this.repo.create({
      tenantId,
      sessionId,
      recordingRef,
      createdBy,
    });
  }

  async downloadAndStore(
    tenantId: string,
    id: string,
    audioBuffer: Buffer,
    contentType: string = "audio/wav",
  ): Promise<void> {
    const recording = await this.repo.getById(tenantId, id);
    if (!recording) {
      throw new Error(`Recording not found: ${id}`);
    }

    const storageKey = `${this.storagePrefix}/${tenantId}/${recording.sessionId}/${recording.recordingRef}`;

    try {
      await this.storage.put(storageKey, audioBuffer, { contentType });

      await this.repo.markStored(tenantId, id, storageKey, audioBuffer.length);

      this.metrics.recordingStored({ tenant: tenantId });
      this.metrics.recordingSize(audioBuffer.length, { tenant: tenantId });

      this.logger.info(
        { id, storageKey, size: audioBuffer.length },
        "[recording] Stored successfully",
      );
    } catch (err) {
      await this.repo.markFailed(tenantId, id);
      this.metrics.recordingFailed({
        tenant: tenantId,
        reason: "storage_error",
      });

      this.logger.error(
        { id, error: String(err) },
        "[recording] Storage failed",
      );
      throw err;
    }
  }

  async getPresignedUrl(
    tenantId: string,
    id: string,
    expirySeconds: number = 3600,
  ): Promise<string> {
    const recording = await this.repo.getById(tenantId, id);
    if (!recording || !recording.storageKey) {
      throw new Error(`Recording not found or not stored: ${id}`);
    }

    return this.storage.getPresignedUrl(recording.storageKey, expirySeconds);
  }

  async listBySession(
    tenantId: string,
    sessionId: string,
  ): Promise<CallRecording[]> {
    return this.repo.listBySession(tenantId, sessionId);
  }
}
