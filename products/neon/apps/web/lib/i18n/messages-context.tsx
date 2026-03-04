"use client";

import { createContext, useContext, useMemo } from "react";

interface MessagesContextValue {
    messages: Record<string, string>;
    locale: string;
    /** Resolve a translation key. Falls back to `fallback` or the key itself. */
    t: (key: string, fallback?: string) => string;
}

const MessagesContext = createContext<MessagesContextValue>({
    messages: {},
    locale: "en",
    t: (key, fallback) => fallback ?? key,
});

export function MessagesProvider({
    messages,
    locale,
    children,
}: {
    messages: Record<string, string>;
    locale: string;
    children: React.ReactNode;
}) {
    const value = useMemo<MessagesContextValue>(() => ({
        messages,
        locale,
        t: (key: string, fallback?: string) => messages[key] ?? fallback ?? key,
    }), [messages, locale]);

    return (
        <MessagesContext.Provider value={value}>
            {children}
        </MessagesContext.Provider>
    );
}

export function useMessages() {
    return useContext(MessagesContext);
}
