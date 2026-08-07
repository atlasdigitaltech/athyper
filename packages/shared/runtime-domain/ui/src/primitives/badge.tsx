import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@athyper/platform-theme/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        info: "border-transparent bg-info text-info-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
      size: {
        md: "px-2 py-0.5 text-xs",
        sm: "h-5 px-1.5 py-0 text-sm font-medium",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "muted";

type BadgeSize = "sm" | "md";

export interface BadgeProps extends ComponentPropsWithoutRef<"div"> {
  variant?: BadgeVariant | null;
  size?: BadgeSize | null;
  children?: ReactNode;
}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
