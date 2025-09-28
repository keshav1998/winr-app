"use client";

import * as React from "react";

/**
 * Utility: Concatenate class names safely
 */
export function cn(
  ...classes: Array<string | undefined | null | false>
): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Spinner - minimal loading indicator
 */
export function Spinner({
  className,
  size = 16,
  strokeWidth = 2,
}: {
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={cn("animate-spin text-current", className)}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="status"
      aria-label="Loading"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}

/**
 * Button
 */
type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-foreground text-background hover:opacity-90 focus-visible:ring-foreground/30",
  secondary:
    "border border-black/10 dark:border-white/15 bg-transparent hover:bg-black/5 dark:hover:bg-white/10",
  ghost:
    "bg-transparent hover:bg-black/5 dark:hover:bg-white/10",
  destructive:
    "bg-red-600 text-white hover:bg-red-600/90 focus-visible:ring-red-500/30",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      fullWidth,
      isLoading,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          BUTTON_BASE,
          BUTTON_SIZES[size],
          BUTTON_VARIANTS[variant],
          fullWidth && "w-full",
          className,
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Spinner className="mr-2" size={16} />
            <span>Processing...</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="mr-2">{leftIcon}</span>}
            <span>{children}</span>
            {rightIcon && <span className="ml-2">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  },
);
Button.displayName = "Button";

/**
 * Input
 */
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  error?: string;
  rightAddon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, description, error, rightAddon, id, ...props }, ref) => {
    const inputId = React.useId();
    const resolvedId = id ?? inputId;
    const describedBy = error
      ? `${resolvedId}-error`
      : description
        ? `${resolvedId}-description`
        : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={resolvedId}
            className="mb-1 block text-sm font-medium text-foreground/80"
          >
            {label}
          </label>
        )}

        <div className={cn("relative flex items-stretch")}>
          <input
            id={resolvedId}
            ref={ref}
            className={cn(
              "w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-foreground/40",
              "border-black/10 focus-visible:ring-2 focus-visible:ring-foreground/20 dark:border-white/15",
              error && "border-red-500 focus-visible:ring-red-500/20",
              rightAddon && "pr-10",
              className,
            )}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            {...props}
          />
          {rightAddon && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-foreground/60">
              {rightAddon}
            </div>
          )}
        </div>

        {description && !error && (
          <p
            id={`${resolvedId}-description`}
            className="mt-1 text-xs text-foreground/60"
          >
            {description}
          </p>
        )}
        {error && (
          <p id={`${resolvedId}-error`} className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

/**
 * Badge
 */
type BadgeVariant = "neutral" | "success" | "warning" | "error";

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  neutral:
    "bg-foreground/10 text-foreground",
  success:
    "bg-green-500/10 text-green-700 dark:text-green-300",
  warning:
    "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  error:
    "bg-red-500/10 text-red-700 dark:text-red-300",
};

export function Badge({
  children,
  className,
  variant = "neutral",
  dot = true,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: BadgeVariant;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs",
        BADGE_VARIANTS[variant],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "size-2 rounded-full",
            variant === "success" && "bg-green-500",
            variant === "warning" && "bg-yellow-500",
            variant === "error" && "bg-red-500",
            variant === "neutral" && "bg-foreground/50",
          )}
        />
      )}
      {children}
    </span>
  );
}

/**
 * Card primitives
 */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-black/10 p-4 dark:border-white/10",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mb-3", className)}>{children}</div>;
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <h3 className={cn("text-base font-medium", className)}>{children}</h3>;
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={cn("mt-1 text-sm text-foreground/70", className)}>{children}</p>
  );
}

export function CardContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mt-3 space-y-3", className)}>{children}</div>;
}

export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mt-4 flex items-center justify-end gap-2", className)}>
      {children}
    </div>
  );
}

/**
 * Alert
 */
type AlertVariant = "info" | "success" | "warning" | "error";

const ALERT_STYLES: Record<
  AlertVariant,
  { wrapper: string; title: string; icon: string }
> = {
  info: {
    wrapper: "bg-blue-500/10 border-blue-500/30",
    title: "text-blue-700 dark:text-blue-300",
    icon: "text-blue-600",
  },
  success: {
    wrapper: "bg-green-500/10 border-green-500/30",
    title: "text-green-700 dark:text-green-300",
    icon: "text-green-600",
  },
  warning: {
    wrapper: "bg-yellow-500/10 border-yellow-500/30",
    title: "text-yellow-700 dark:text-yellow-300",
    icon: "text-yellow-600",
  },
  error: {
    wrapper: "bg-red-500/10 border-red-500/30",
    title: "text-red-700 dark:text-red-300",
    icon: "text-red-600",
  },
};

export function Alert({
  title,
  children,
  variant = "info",
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  variant?: AlertVariant;
  className?: string;
}) {
  const styles = ALERT_STYLES[variant];
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-lg border px-3 py-2 text-sm",
        styles.wrapper,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 inline-flex h-5 w-5 items-center justify-center",
          styles.icon,
        )}
      >
        {/* simple dot icon */}
        <span className="h-2.5 w-2.5 rounded-full bg-current" />
      </span>
      <div className="flex-1">
        {title && <div className={cn("font-medium", styles.title)}>{title}</div>}
        {children && <div className="mt-0.5 text-foreground/80">{children}</div>}
      </div>
    </div>
  );
}
