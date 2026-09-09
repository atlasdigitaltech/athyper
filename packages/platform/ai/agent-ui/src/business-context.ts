"use client";
import {
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  parseAtlasBusinessContext,
  type AtlasBusinessContextV1,
} from "@athyper/platform-ai-agent-runtime";
export type AtlasBusinessContextInput = AtlasBusinessContextV1 extends infer C
  ? C extends AtlasBusinessContextV1
    ? Omit<C, "schemaVersion" | "generationId" | "locale"> & {
        readonly locale?: string;
      }
    : never
  : never;

export class AtlasBusinessContextStore {
  constructor(private readonly locale = "en") {}
  private entries = new Map<
    string,
    { signature: string; page: AtlasBusinessContextV1 }
  >();
  private threadBindings = new Map<string, string>();
  bindThread(threadId: string, generationId: string) {
    this.threadBindings.set(threadId, generationId);
  }
  isThreadBound(threadId: string, generationId: string) {
    return this.threadBindings.get(threadId) === generationId;
  }
  private listeners = new Set<() => void>();
  private current: AtlasBusinessContextV1 | undefined;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.current;
  publish(owner: string, input: AtlasBusinessContextInput | undefined) {
    if (!input) {
      this.remove(owner);
      return;
    }
    const signature = JSON.stringify(input);
    if (this.entries.get(owner)?.signature === signature) return;
    let page: AtlasBusinessContextV1;
    try {
      page = parseAtlasBusinessContext({
        ...input,
        locale: input.locale ?? this.locale,
        schemaVersion: 1,
        generationId: globalThis.crypto.randomUUID(),
      });
    } catch {
      this.remove(owner);
      return;
    }
    this.entries.set(owner, { signature, page });
    this.refresh();
  }
  remove(owner: string) {
    if (this.entries.delete(owner)) this.refresh();
  }
  private refresh() {
    const pages = [...this.entries.values()].map((entry) => entry.page);
    const next =
      pages.filter((page) => page.kind === "record").at(-1) ?? pages.at(-1);
    if (next === this.current) return;
    this.current = next;
    this.listeners.forEach((listener) => listener());
  }
  /** Explicit same-tab fullscreen handoff, bound to the shell identity and a short expiry. */
  handoff(scope: string, threadId?: string): string | undefined {
    if (!this.current) return;
    try {
      const token = globalThis.crypto.randomUUID();
      sessionStorage.setItem(
        `atlas.context.${scope}.${token}`,
        JSON.stringify({
          page: this.current,
          threadId:
            threadId && this.isThreadBound(threadId, this.current.generationId)
              ? threadId
              : undefined,
          expiresAt: Date.now() + 300000,
        }),
      );
      return token;
    } catch {
      return;
    }
  }
  restore(scope: string, token: string): string | undefined {
    if (!/^[a-f0-9-]{36}$/.test(token)) return;
    try {
      const key = `atlas.context.${scope}.${token}`,
        saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (
        !saved ||
        typeof saved.expiresAt !== "number" ||
        !Number.isFinite(saved.expiresAt) ||
        saved.expiresAt < Date.now()
      ) {
        sessionStorage.removeItem(key);
        return;
      }
      const page = parseAtlasBusinessContext(saved.page);
      this.entries.set("fullscreen", { page, signature: JSON.stringify(page) });
      this.refresh();
      if (typeof saved.threadId === "string") {
        this.bindThread(saved.threadId, page.generationId);
        return saved.threadId;
      }
      return undefined;
    } catch {
      /* Invalid/unavailable storage supplies no context. */
    }
  }
}
const Context = createContext<AtlasBusinessContextStore | undefined>(undefined);
export function AtlasBusinessContextProvider({
  children,
  store,
}: {
  readonly children: ReactNode;
  readonly store: AtlasBusinessContextStore;
}) {
  return createElement(Context.Provider, { value: store }, children);
}
export function useAtlasBusinessContext() {
  const store = useContext(Context);
  return useSyncExternalStore(
    store?.subscribe ?? noSubscribe,
    store?.snapshot ?? empty,
    empty,
  );
}
export function useAtlasBusinessContextPublisher(
  input: AtlasBusinessContextInput | undefined,
) {
  const store = useContext(Context),
    owner = useRef<string>(
      globalThis.crypto?.randomUUID?.() ?? Math.random().toString(),
    );
  const signature = JSON.stringify(input);
  useLayoutEffect(() => {
    store?.publish(owner.current, input);
  }, [store, signature]);
  useLayoutEffect(
    () => () => {
      store?.remove(owner.current);
    },
    [store],
  );
}
const empty = () => undefined;
const noSubscribe = () => () => {};

export function useAtlasContextNavigation(pathname: string) {
  const store = useContext(Context);
  useLayoutEffect(() => {
    if (pathname !== "/atlas" && pathname === window.location.pathname)
      store?.remove("fullscreen");
  }, [store, pathname]);
}
