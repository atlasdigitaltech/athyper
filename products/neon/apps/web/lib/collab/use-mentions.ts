"use client";

/**
 * useMentions - debounced user search for @mention autocomplete.
 */

import { useState, useEffect, useRef } from "react";

import { collabFetcher } from "./fetcher";

export interface MentionUser {
    id: string;
    username: string;
    displayName: string;
}

interface PrincipalSearchResponse {
    ok: boolean;
    data: MentionUser[];
}

export function useMentions(query: string) {
    const [users, setUsers] = useState<MentionUser[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const abortRef = useRef<AbortController>(undefined);

    useEffect(() => {
        // Clear previous debounce
        if (timerRef.current) clearTimeout(timerRef.current);

        if (!query || query.length < 2) {
            setUsers([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        timerRef.current = setTimeout(async () => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const params = new URLSearchParams({
                    search: query,
                    limit: "10",
                });
                const result = await collabFetcher<PrincipalSearchResponse>(
                    `/api/iam/principals?${params}`,
                );

                if (!controller.signal.aborted) {
                    setUsers(result.data ?? []);
                }
            } catch {
                if (!controller.signal.aborted) {
                    setUsers([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        }, 300);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            abortRef.current?.abort();
        };
    }, [query]);

    return { users, isLoading };
}

/**
 * Parse @mentions from text and return match positions.
 */
export interface MentionMatch {
    text: string;
    startIndex: number;
    endIndex: number;
}

export function parseMentions(text: string): MentionMatch[] {
    const regex = /@(\w+)/g;
    const matches: MentionMatch[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        matches.push({
            text: match[1],
            startIndex: match.index,
            endIndex: match.index + match[0].length,
        });
    }

    return matches;
}
