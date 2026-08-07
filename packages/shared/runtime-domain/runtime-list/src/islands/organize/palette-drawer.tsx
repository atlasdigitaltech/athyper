"use client";

import { useEffect, useState } from "react";
import type React from "react";
import type { ComponentType, SVGProps } from "react";
import { X } from "lucide-react";
import {
  DrawerShell,
  DrawerHeaderTitle,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@athyper/platform-ui";

interface PaletteDrawerProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  title:     string;
  icon?:     ComponentType<SVGProps<SVGSVGElement>>;
  onClose:   () => void;
  children:  React.ReactNode;
  footer?:   React.ReactNode;
  /** Backdrop styling behind the drawer. */
  backdrop?: "dim" | "transparent";
  /** Use the responsive two-pane workspace treatment (currently filters). */
  workspace?: boolean;
  /** Optional wider workspace treatment for content-heavy two-pane drawers. */
  workspaceWidth?: "default" | "wide";
}

/**
 * Responsive list surface drawer.
 *
 * Desktop uses the shared resizable DrawerShell. Mobile uses the shared Sheet
 * primitive, so focus restoration, escape handling, outside interaction, and
 * available-height behavior stay with Radix instead of being duplicated here.
 */
export function PaletteDrawer({
  anchorRef,
  title,
  icon: Icon,
  onClose,
  children,
  footer,
  backdrop = "dim",
  workspace = false,
  workspaceWidth = "default",
}: PaletteDrawerProps) {
  const isDesktop = useDesktopMediaQuery();
  const overlayClassName = backdrop === "transparent" ? "bg-transparent backdrop-blur-0" : undefined;
  const titleNode = <DrawerHeaderTitle title={title} icon={Icon} />;
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    anchorRef.current?.focus();
  };
  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  if (isDesktop) {
    return (
      <DrawerShell
        open
        onOpenChange={handleOpenChange}
        intent={backdrop === "transparent" ? "context" : "transactional"}
        defaultWidth={workspace ? workspaceWidth === "wide" ? 860 : 640 : 520}
        minWidth={workspace ? 480 : 380}
        maxWidth={workspace ? workspaceWidth === "wide" ? "92vw" : "85vw" : "760px"}
        expandable={workspace}
        overlayClassName={overlayClassName}
        bodyClassName={workspace ? "overflow-hidden" : "p-4"}
        onCloseAutoFocus={restoreFocus}
        title={titleNode}
        footerStart={footer}
        footerClassName={footer ? "!block p-4" : undefined}
      >
        {children}
      </DrawerShell>
    );
  }

  return (
    <Sheet open onOpenChange={handleOpenChange}>
      <SheetContent
        side={workspace ? "right" : "bottom"}
        showClose={false}
        overlayClassName={overlayClassName}
        onCloseAutoFocus={restoreFocus}
        aria-describedby={undefined}
        className={workspace
          ? "h-full w-full gap-0 p-0"
          : "h-[75dvh] max-h-[75dvh] gap-0 rounded-t-xl p-0"}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
          <SheetTitle className="min-w-0">
            {titleNode}
          </SheetTitle>
          <SheetClose asChild>
            <button
              type="button"
              aria-label={`Close ${title}`}
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </SheetClose>
        </div>
        <div className={workspace ? "min-h-0 flex-1 overflow-hidden bg-muted/20" : "min-h-0 flex-1 overflow-y-auto bg-muted/20 p-4"}>
          {children}
        </div>
        {footer && <div className="shrink-0 border-t bg-background p-4">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}

function useDesktopMediaQuery(): boolean {
  const [matches, setMatches] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  ));

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return matches;
}
