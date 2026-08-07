import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@athyper/platform-theme/utils";
import { overlayScrimVariants } from "./overlay";
import { Button, type ButtonProps } from "./button";

// AlertDialog is semantically a confirmation dialog — no close (X) button.
// Built on Radix Dialog; role="alertdialog" is applied explicitly on Content
// since @radix-ui/react-alert-dialog is not a declared dependency.

const AlertDialog = DialogPrimitive.Root;
const AlertDialogTrigger = DialogPrimitive.Trigger;
const AlertDialogPortal = DialogPrimitive.Portal;

const AlertDialogOverlay = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-modal data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
      overlayScrimVariants({ tone: "modal" }),
      className,
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = "AlertDialogOverlay";

const AlertDialogContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      // role="alertdialog" overrides Radix Dialog's default role="dialog"
      // so screen readers announce this as requiring immediate attention.
      role="alertdialog"
      className={cn(
        "fixed left-1/2 top-1/2 z-modal w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
        "rounded-lg border bg-background p-6 shadow-lg",
        "data-[state=open]:animate-scale-in data-[state=closed]:animate-fade-out",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </AlertDialogPortal>
));
AlertDialogContent.displayName = "AlertDialogContent";

const AlertDialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-2 text-center sm:text-left", className)} {...props} />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-base font-semibold leading-tight", className)} {...props} />
));
AlertDialogTitle.displayName = "AlertDialogTitle";

const AlertDialogDescription = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
AlertDialogDescription.displayName = "AlertDialogDescription";

// Cancel and Action compose Button so styling stays in sync with the Button primitive.

const AlertDialogCancel = forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => (
    <DialogPrimitive.Close asChild>
      <Button ref={ref} variant="outline" {...props} />
    </DialogPrimitive.Close>
  )
);
AlertDialogCancel.displayName = "AlertDialogCancel";

const AlertDialogAction = forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => (
    <DialogPrimitive.Close asChild>
      <Button ref={ref} variant="primary" {...props} />
    </DialogPrimitive.Close>
  )
);
AlertDialogAction.displayName = "AlertDialogAction";

export {
  AlertDialog, AlertDialogTrigger, AlertDialogPortal, AlertDialogOverlay,
  AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription,
  AlertDialogCancel, AlertDialogAction,
};
