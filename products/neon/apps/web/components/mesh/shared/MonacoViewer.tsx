"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

import type { OnMount } from "@monaco-editor/react";

import { Skeleton } from "@/components/ui/skeleton";


// Lazy-load Monaco to reduce bundle size
const Editor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full min-h-[200px]" />,
});

interface MonacoViewerProps {
    value: string;
    language?: "json" | "sql" | "typescript" | "plaintext";
    readOnly?: boolean;
    height?: string | number;
    onChange?: (value: string) => void;
}

export function MonacoViewer({
    value,
    language = "json",
    readOnly = true,
    height = "400px",
    onChange,
}: MonacoViewerProps) {
    const [mounted, setMounted] = useState(false);

    const handleMount: OnMount = useCallback((_editor) => {
        setMounted(true);
    }, []);

    return (
        <div className="overflow-hidden rounded-md border">
            <Editor
                height={height}
                language={language}
                value={value}
                theme="vs-dark"
                onMount={handleMount}
                onChange={(val) => onChange?.(val ?? "")}
                options={{
                    readOnly,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    lineNumbers: "on",
                    wordWrap: "on",
                    folding: true,
                    renderLineHighlight: "none",
                    overviewRulerLanes: 0,
                    padding: { top: 8, bottom: 8 },
                }}
                loading={<Skeleton className="h-full w-full min-h-[200px]" />}
            />
        </div>
    );
}
