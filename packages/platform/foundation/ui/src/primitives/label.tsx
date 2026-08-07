import { forwardRef, type ComponentPropsWithoutRef } from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@athyper/platform-theme/utils";

const Label = forwardRef<
  HTMLLabelElement,
  ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { error?: boolean }
>(({ className, error, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-sm font-medium leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      error && "text-destructive",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

export { Label };
