/**
 * MessageSearchResults - Display search results with highlighted snippets
 *
 * Features:
 * - Grouped by conversation
 * - Highlighted search terms in snippets
 * - Click to navigate to message
 * - Empty state
 * - Loading state
 */

"use client";

import { formatDistanceToNow } from "date-fns";
import { Search, Loader2, MessageSquare } from "lucide-react";

import { cn } from "../lib/utils";
import { ScrollArea } from "../scroll-area";

export interface SearchResult {
    message: {
        id: string;
        conversationId: string;
        senderId: string;
        body: string;
        createdAt: string;
    };
    rank: number;
    headline: string;
}

export interface MessageSearchResultsProps {
    results: SearchResult[];
    query: string;
    isSearching?: boolean;
    onResultClick?: (result: SearchResult) => void;
    conversationNames?: Map<string, string>; // conversationId -> name
    senderNames?: Map<string, string>; // senderId -> name
    className?: string;
}

export function MessageSearchResults({
    results,
    query,
    isSearching = false,
    onResultClick,
    conversationNames = new Map(),
    senderNames = new Map(),
    className,
}: MessageSearchResultsProps) {
    // Group results by conversation
    const groupedResults = results.reduce((acc, result) => {
        const convId = result.message.conversationId;
        if (!acc.has(convId)) {
            acc.set(convId, []);
        }
        acc.get(convId)!.push(result);
        return acc;
    }, new Map<string, SearchResult[]>());

    return (
        <div className={cn("flex flex-col h-full bg-background", className)}>
            {isSearching ? (
                <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : results.length === 0 && query ? (
                <div className="flex flex-col items-center justify-center h-full px-4 text-center">
                    <Search className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-1">No results found</h3>
                    <p className="text-sm text-muted-foreground">
                        Try different keywords or check your spelling
                    </p>
                </div>
            ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full px-4 text-center">
                    <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-1">Search messages</h3>
                    <p className="text-sm text-muted-foreground">
                        Enter keywords to search across your conversations
                    </p>
                </div>
            ) : (
                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                        {/* Search summary */}
                        <div className="text-sm text-muted-foreground">
                            Found {results.length} {results.length === 1 ? "result" : "results"}
                            {groupedResults.size > 1 &&
                                ` in ${groupedResults.size} conversations`}
                        </div>

                        {/* Grouped results */}
                        {Array.from(groupedResults.entries()).map(([conversationId, convResults]) => (
                            <div key={conversationId} className="space-y-2">
                                {/* Conversation header */}
                                <div className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded-md">
                                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">
                                        {conversationNames.get(conversationId) ?? "Conversation"}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        ({convResults.length}{" "}
                                        {convResults.length === 1 ? "result" : "results"})
                                    </span>
                                </div>

                                {/* Results for this conversation */}
                                {convResults.map((result) => {
                                    const senderName =
                                        senderNames.get(result.message.senderId) ?? "Unknown";
                                    const timeAgo = formatDistanceToNow(
                                        new Date(result.message.createdAt),
                                        { addSuffix: true }
                                    );

                                    return (
                                        <button
                                            key={result.message.id}
                                            onClick={() => onResultClick?.(result)}
                                            className={cn(
                                                "w-full flex flex-col gap-1 p-3 rounded-lg border transition-colors text-left",
                                                "hover:bg-muted/50 hover:border-primary/50"
                                            )}
                                        >
                                            {/* Sender and time */}
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-medium">
                                                    {senderName}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {timeAgo}
                                                </span>
                                            </div>

                                            {/* Highlighted snippet */}
                                            <div
                                                className="text-sm text-muted-foreground"
                                                dangerouslySetInnerHTML={{ __html: result.headline }}
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
}
