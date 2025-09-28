"use client";

/**
 * Feedback primitives: Toast system + Error Boundary
 *
 * - ToastProvider: supplies addToast/dismiss and stores a small queue of toasts
 * - useToast: hook to trigger success/error/info toasts from anywhere under the provider
 * - Toaster: a portal-based UI that renders the active toasts
 * - ErrorBoundary: simple boundary that shows a friendly fallback with reset capability
 *
 * Why this design:
 * - Keep logic and presentation decoupled via a headless provider and a small UI component
 * - Predictable lifecycle: add -> auto-dismiss (or manual) -> unmount
 * - Resilient boundary to avoid white screens and offer a reset path
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { createPortal } from "react-dom";
import { Alert, Button, cn } from "../components/ui";

/* ============================
 * Constants Over Magic Numbers
 * ============================ */

const DEFAULT_TOAST_DURATION_MS = 3500;
const MAX_TOASTS = 5;
const ANIMATION_MS = 200; // enter/exit transitions

/* ============================
 * Types
 * ============================ */

export type ToastKind = "info" | "success" | "warning" | "error";

export type ToastInput = {
  title?: string;
  description?: string;
  kind?: ToastKind;
  durationMs?: number;
};

export type ToastItem = Required<
  Pick<ToastInput, "title" | "description" | "kind"> & {
    id: string;
    durationMs: number;
  }
>;

/* ============================
 * Toast Context
 * ============================ */

type ToastContextValue = {
  toasts: ToastItem[];
  addToast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clearAll: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * ToastProvider - provides toast state & actions
 */
export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeTimer = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) clearTimeout(t);
    timersRef.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      removeTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [removeTimer],
  );

  const scheduleAutoDismiss = useCallback(
    (toast: ToastItem) => {
      removeTimer(toast.id);
      const timer = setTimeout(() => dismiss(toast.id), toast.durationMs);
      timersRef.current.set(toast.id, timer);
    },
    [dismiss, removeTimer],
  );

  const addToast = useCallback(
    (input: ToastInput) => {
      const id = genId("toast");
      const toast: ToastItem = {
        id,
        title: input.title ?? "",
        description: input.description ?? "",
        kind: input.kind ?? "info",
        durationMs:
          typeof input.durationMs === "number" && input.durationMs > 0
            ? input.durationMs
            : DEFAULT_TOAST_DURATION_MS,
      };

      setToasts((prev) => {
        const next = [toast, ...prev];
        return next.slice(0, MAX_TOASTS);
      });

      scheduleAutoDismiss(toast);
      return id;
    },
    [scheduleAutoDismiss],
  );

  const clearAll = useCallback(() => {
    timersRef.current.forEach((t) => { clearTimeout(t); });
    timersRef.current.clear();
    setToasts([]);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => { clearTimeout(t); });
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, addToast, dismiss, clearAll }),
    [toasts, addToast, dismiss, clearAll],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/**
 * useToast - access toast actions and state
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

/* ============================
 * Toaster UI
 * ============================ */

type ToasterProps = {
  position?:
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left"
  | "bottom-center"
  | "top-center";
  containerClassName?: string;
};

export function Toaster({ position = "bottom-right", containerClassName }: ToasterProps) {
  const { toasts, dismiss } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Avoid SSR portal issues
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  const posCls = getPositionClasses(position);

  return createPortal(
    <section
      className={cn(
        "pointer-events-none fixed z-50",
        posCls,
        containerClassName,
      )}
      aria-live="polite"
      aria-label="Notifications"
    >
      <ul className="flex w-full flex-col gap-2">
        {toasts.map((t) => (
          <li
            key={t.id}
            className={cn(
              "pointer-events-auto overflow-hidden rounded-lg border shadow-sm transition-opacity",
              "border-black/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
              "dark:border-white/15",
            )}
            style={{
              animation: `fade-in ${ANIMATION_MS}ms ease-out`,
            }}
          >
            <ToastCard item={t} onClose={() => dismiss(t.id)} />
          </li>
        ))}
      </ul>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-out {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(4px); }
        }
      `}</style>
    </section>,
    document.body,
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const variant = toastKindToAlertVariant(item.kind);

  return (
    <div className="p-3">
      <Alert variant={variant} title={item.title || kindLabel(item.kind)}>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            {item.description ? (
              <p className="text-sm text-foreground/80">{item.description}</p>
            ) : null}
          </div>
          <div className="shrink-0">
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </Alert>
    </div>
  );
}

function getPositionClasses(position: NonNullable<ToasterProps["position"]>) {
  switch (position) {
    case "top-left":
      return "left-4 top-4";
    case "top-right":
      return "right-4 top-4";
    case "top-center":
      return "left-1/2 -translate-x-1/2 top-4";
    case "bottom-left":
      return "left-4 bottom-4";
    case "bottom-center":
      return "left-1/2 -translate-x-1/2 bottom-4";
    case "bottom-right":
    default:
      return "right-4 bottom-4";
  }
}

function toastKindToAlertVariant(kind: ToastKind) {
  switch (kind) {
    case "success":
      return "success" as const;
    case "warning":
      return "warning" as const;
    case "error":
      return "error" as const;
    case "info":
    default:
      return "info" as const;
  }
}

function kindLabel(kind: ToastKind) {
  switch (kind) {
    case "success":
      return "Success";
    case "warning":
      return "Warning";
    case "error":
      return "Error";
    case "info":
    default:
      return "Info";
  }
}

/* ============================
 * Error Boundary
 * ============================ */

type ErrorBoundaryProps = PropsWithChildren<{
  fallback?: React.ReactNode | ((args: { error: Error; reset: () => void }) => React.ReactNode);
  onError?: (error: Error, info: React.ErrorInfo) => void;
  onReset?: () => void;
  // Optional: connect to toasts
  toastOnError?: boolean;
}>;

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const content = this.renderFallback();
    return (
      <div className="p-4">
        {content}
      </div>
    );
  }

  private renderFallback() {
    const { fallback } = this.props;
    const err = this.state.error ?? new Error("Unknown error");

    if (typeof fallback === "function") {
      return fallback({ error: err, reset: this.reset });
    }
    if (fallback) return fallback;

    return (
      <Alert variant="error" title="Something went wrong">
        <div className="space-y-2">
          <p className="text-sm text-foreground/80">
            An unexpected error occurred. If the issue persists, try reloading the page.
          </p>
          <details className="rounded bg-black/5 p-2 text-xs text-foreground/80 dark:bg-white/10">
            <summary className="cursor-pointer select-none text-foreground">Details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">
              {err?.message ?? String(err)}
            </pre>
          </details>
          <div className="pt-2">
            <Button type="button" onClick={this.reset}>
              Try again
            </Button>
          </div>
        </div>
      </Alert>
    );
  }
}

/* ============================
 * Utilities
 * ============================ */

function genId(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

/* ============================
 * Example usage (comments only)
 * ============================ */

/**
// app/layout.tsx
"use client";
import { ThirdwebProvider } from "thirdweb/react";
import { ToastProvider } from "../(components)/feedback";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <ThirdwebProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThirdwebProvider>
      </body>
    </html>
  );
}

// app/page.tsx
"use client";
import { useToast, Toaster, ErrorBoundary } from "../(components)/feedback";

export default function Page() {
  const { addToast } = useToast();

  return (
    <>
      <ErrorBoundary
        onError={(err) => addToast({ kind: "error", title: "Runtime Error", description: err.message })}
        onReset={() => addToast({ kind: "info", title: "Reset", description: "Boundary has been reset." })}
      >
        <button
          onClick={() => addToast({ kind: "success", title: "Hello", description: "This is a toast." })}
        >
          Toast me
        </button>
      </ErrorBoundary>
      <Toaster position="bottom-right" />
    </>
  );
}
*/
