import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-sm hover:opacity-90",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:opacity-80",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:opacity-90",
        warning: "bg-warning text-warning-foreground shadow-sm hover:opacity-90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        compact: "h-7 px-2.5 text-sm font-medium",
        sm: "h-8 px-2.5 text-sm",
        md: "h-9 px-3.5 text-sm",
        lg: "h-10 px-4 text-sm",
        iconCompact: "size-7",
        iconSm: "size-8",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      children,
      type,
      "aria-disabled": ariaDisabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          asChild && isDisabled && "pointer-events-none opacity-50",
        )}
        ref={ref}
        disabled={asChild ? undefined : isDisabled}
        aria-disabled={ariaDisabled ?? (asChild && isDisabled ? true : undefined)}
        aria-busy={loading || undefined}
        type={asChild ? undefined : (type ?? "button")}
        {...props}
      >
        {loading && <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />}
        {asChild ? <Slottable>{children}</Slottable> : children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
