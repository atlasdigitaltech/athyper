import { cva, type VariantProps } from "class-variance-authority";

export const overlayScrimVariants = cva("", {
  variants: {
    tone: {
      modal: "scrim-modal",
      command: "scrim-command",
      drawer: "scrim-drawer backdrop-blur-sm",
      context: "scrim-context backdrop-blur-[1px]",
    },
  },
  defaultVariants: {
    tone: "modal",
  },
});

export type OverlayScrimTone = NonNullable<
  VariantProps<typeof overlayScrimVariants>["tone"]
>;
