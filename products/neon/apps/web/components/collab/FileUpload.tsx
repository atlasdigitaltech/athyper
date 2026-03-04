"use client";

import { Paperclip, X, FileIcon, Loader2 } from "lucide-react";
import { useRef, useState, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";
import { cn } from "@/lib/utils";

export interface UploadedFile {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
}

interface FileUploadProps {
    onUpload?: (file: UploadedFile) => void;
    onRemove?: (fileId: string) => void;
    files?: UploadedFile[];
    disabled?: boolean;
    maxSizeMb?: number;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({
    onUpload,
    onRemove,
    files = [],
    disabled,
    maxSizeMb = 10,
}: FileUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSelect = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            if (file.size > maxSizeMb * 1024 * 1024) {
                setError(`File exceeds ${maxSizeMb}MB limit`);
                return;
            }

            setError(null);
            setUploading(true);

            try {
                const formData = new FormData();
                formData.append("file", file);

                const res = await fetch("/api/content/upload", {
                    method: "POST",
                    headers: buildHeaders(),
                    credentials: "same-origin",
                    body: formData,
                });

                if (!res.ok) throw new Error("Upload failed");

                const result = (await res.json()) as { data: UploadedFile };
                onUpload?.(result.data);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Upload failed");
            } finally {
                setUploading(false);
                // Reset input
                if (inputRef.current) inputRef.current.value = "";
            }
        },
        [maxSizeMb, onUpload],
    );

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <input
                    ref={inputRef}
                    type="file"
                    onChange={handleSelect}
                    className="hidden"
                    disabled={disabled || uploading}
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => inputRef.current?.click()}
                    disabled={disabled || uploading}
                >
                    {uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <Paperclip className="size-4" />
                    )}
                    {uploading ? "Uploading..." : "Attach file"}
                </Button>
                {error && <span className="text-xs text-destructive">{error}</span>}
            </div>

            {files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {files.map((f) => (
                        <div
                            key={f.id}
                            className={cn(
                                "flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs",
                            )}
                        >
                            <FileIcon className="size-3 text-muted-foreground" />
                            <span className="max-w-[120px] truncate">{f.fileName}</span>
                            <span className="text-muted-foreground">
                                ({formatSize(f.fileSize)})
                            </span>
                            {onRemove && (
                                <button
                                    type="button"
                                    onClick={() => onRemove(f.id)}
                                    className="text-muted-foreground hover:text-destructive"
                                >
                                    <X className="size-3" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
