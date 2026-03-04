/**
 * FilePicker Component
 *
 * Drag & drop + browse file picker with client-side validation
 * and upload pipeline integration.
 */

"use client";

import {
  initiateUpload,
  completeUpload,
  computeFileHash,
  type Attachment,
  type DocumentKind,
  type UploadProgress,
} from "@athyper/api-client/content";
import {
  useRef,
  useState,
  useCallback,
  type ChangeEvent,
  type DragEvent,
} from "react";

export interface FilePickerProps {
  entityType: string;
  entityId: string;
  kind?: DocumentKind;
  multiple?: boolean;
  maxSizeMb?: number;
  accept?: string;
  onUploaded?: (items: Attachment[]) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

export function FilePicker({
  entityType,
  entityId,
  kind = "attachment",
  multiple = true,
  maxSizeMb = 25,
  accept = "*/*",
  onUploaded,
  onError,
  disabled = false,
}: FilePickerProps) {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMb * 1024 * 1024;

  /**
   * Validate file before upload
   */
  const validateFile = (file: File): string | null => {
    if (file.size > maxSizeBytes) {
      return `File size exceeds ${maxSizeMb} MB limit`;
    }
    if (file.size === 0) {
      return "File is empty";
    }
    return null;
  };

  /**
   * Upload a single file through the full pipeline
   */
  const uploadFile = useCallback(
    async (file: File) => {
      const fileId = crypto.randomUUID();

      // Add to progress tracking
      setUploads((prev) => [
        ...prev,
        {
          fileId,
          fileName: file.name,
          status: "queued",
          progress: 0,
        },
      ]);

      try {
        // Step 1: Initiate upload
        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === fileId
              ? { ...u, status: "initiating", progress: 10 }
              : u,
          ),
        );

        const initResult = await initiateUpload({
          entityType,
          entityId,
          kind,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });

        // Step 2: Upload to S3
        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === fileId
              ? { ...u, status: "uploading", progress: 30 }
              : u,
          ),
        );

        const uploadRes = await fetch(initResult.presignedUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });

        if (!uploadRes.ok) {
          throw new Error(`S3 upload failed: ${uploadRes.status}`);
        }

        // Step 3: Compute checksum
        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === fileId
              ? { ...u, status: "completing", progress: 70 }
              : u,
          ),
        );

        const sha256 = await computeFileHash(file);

        // Step 4: Complete upload
        await completeUpload({
          uploadId: initResult.uploadId,
          sha256,
        });

        // Success!
        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === fileId ? { ...u, status: "done", progress: 100 } : u,
          ),
        );

        // Create attachment object for callback
        const attachment: Attachment = {
          id: initResult.uploadId,
          fileName: file.name,
          sizeBytes: file.size,
          contentType: file.type,
          kind,
          createdAt: new Date().toISOString(),
        };

        return attachment;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setUploads((prev) =>
          prev.map((u) =>
            u.fileId === fileId
              ? { ...u, status: "failed", progress: 0, error: message }
              : u,
          ),
        );
        throw err;
      }
    },
    [entityType, entityId, kind],
  );

  /**
   * Handle file selection (from browse or drop)
   */
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);

      // Validate all files first
      const errors: string[] = [];
      const validFiles: File[] = [];

      for (const file of fileArray) {
        const error = validateFile(file);
        if (error) {
          errors.push(`${file.name}: ${error}`);
        } else {
          validFiles.push(file);
        }
      }

      if (errors.length > 0) {
        onError?.(errors.join("\n"));
      }

      if (validFiles.length === 0) return;

      // Upload all valid files
      try {
        const uploadedAttachments = await Promise.all(
          validFiles.map(uploadFile),
        );
        onUploaded?.(uploadedAttachments.filter(Boolean) as Attachment[]);

        // Clear completed uploads after callback
        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.status !== "done"));
        }, 2000);
      } catch (err: unknown) {
        onError?.(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [uploadFile, onUploaded, onError, maxSizeBytes],
  );

  /**
   * Browse button click handler
   */
  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * File input change handler
   */
  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  /**
   * Drag & drop handlers
   */
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    handleFiles(e.dataTransfer.files);
  };

  const hasActiveUploads = uploads.some(
    (u) => u.status !== "done" && u.status !== "failed",
  );

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!disabled ? handleBrowseClick : undefined}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={disabled}
        />

        <div className="space-y-2">
          <div className="text-gray-600">
            {isDragging ? (
              <p className="text-blue-600 font-medium">Drop files here</p>
            ) : (
              <>
                <p className="font-medium">Drag & drop files here</p>
                <p className="text-sm text-gray-500">or click to browse</p>
              </>
            )}
          </div>
          <p className="text-xs text-gray-400">Max {maxSizeMb} MB per file</p>
        </div>
      </div>

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((upload) => (
            <div
              key={upload.fileId}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded border"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {upload.fileName}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        upload.status === "failed"
                          ? "bg-red-500"
                          : "bg-blue-500"
                      }`}
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{upload.status}</span>
                </div>
                {upload.error && (
                  <p className="text-xs text-red-600 mt-1">{upload.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
