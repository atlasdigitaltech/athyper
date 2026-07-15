"use client";

/**
 * Toast — lightweight portal-based notification system.
 *
 * Usage:
 *   1. Wrap the app root with <ToastProvider>.
 *   2. Call const { toast } = useToast() anywhere inside it.
 *   3. toast({ title: "Saved", intent: "success" })
 *
 * No @radix-ui/react-toast dependency — built on React portals + context
 * so it works in any React tree without separate root setup.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@athyper/theme/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ToastIntent = "success" | "warning" | "error" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  intent?: ToastIntent;
  /** Duration in ms. Pass 0 for persistent. Default: 4000. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends Required<Pick<ToastOptions, "title" | "intent">> {
  id: string;
  description?: string;
  duration: number;
  action?: ToastOptions["action"];
}

// ── Context ────────────────────────────────────────────────────────────────────

interface ToastContextValue {
  toast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const nextId = useRef(0);

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach((timer) => clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ intent = "info", duration = 4000, ...rest }: ToastOptions): string => {
      const id = `toast-${++nextId.current}`;
      setToasts((prev) => [...prev, { id, intent, duration, ...rest }]);
      if (duration > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), duration));
      }
      return id;
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastPortal toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ── Styling maps ───────────────────────────────────────────────────────────────

const INTENT_ICON: Record<ToastIntent, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const INTENT_CLS: Record<ToastIntent, string> = {
  success: "border-success/30 [&_[data-icon]]:text-success",
  warning: "border-warning/30 [&_[data-icon]]:text-warning",
  error:   "border-destructive/30 [&_[data-icon]]:text-destructive",
  info:    "border-info/30 [&_[data-icon]]:text-info",
};

// ── Individual toast card ──────────────────────────────────────────────────────

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const Icon = INTENT_ICON[item.intent];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-80 items-start gap-3 rounded-lg border bg-background p-3.5 shadow-lg",
        "animate-in slide-in-from-right-4 fade-in-0 duration-200",
        INTENT_CLS[item.intent],
      )}
    >
      <span data-icon className="mt-0.5 shrink-0">
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
        )}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action!.onClick();
              onDismiss(item.id);
            }}
            className="mt-1.5 text-xs font-medium underline-offset-2 hover:underline"
          >
            {item.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss notification"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

// ── Portal renderer ────────────────────────────────────────────────────────────

function ToastPortal({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (typeof document === "undefined" || toasts.length === 0) return null;
  return createPortal(
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}
