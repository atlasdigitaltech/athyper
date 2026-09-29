"use client";
import { useRef } from "react";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { useComposerPopover } from "./use-composer-popover";
type Audience = "public" | "internal" | "private";

/** Only the audiences admitted by the capability are offered. */
export function CommentAudiencePicker({
  value,
  options,
  disabled,
  onChange,
}: {
  readonly value: Audience;
  readonly options: readonly Audience[];
  readonly disabled: boolean;
  readonly onChange: (value: Audience) => void;
}) {
  const intl = useEntityI18n();
  const labels = { public: intl.message("comments.public"), internal: intl.message("comments.internal"), private: intl.message("comments.private") };
  const descriptions = { public: intl.message("comments.publicHelp"), internal: intl.message("comments.internalHelp"), private: intl.message("comments.privateHelp") };
  const root = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = useComposerPopover(root, panel, () => panel.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({preventScroll:true}));
  const close = () => {
    panel.current?.hidePopover();
    root.current?.removeAttribute("open");
    root.current?.querySelector("summary")?.focus({preventScroll:true});
  };
  return (
    <details
      ref={root}
      className="a-comment-audience-picker"
      onKeyDown={(event) => {
        if (event.key === "Escape" && root.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        if (
          root.current?.open &&
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          const items = Array.from(
            root.current.querySelectorAll<HTMLButtonElement>(
              '[role="menuitemradio"]',
            ),
          );
          const current = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (current +
                    (event.key === "ArrowDown" ? 1 : items.length - 1)) %
                  items.length;
          items[next]?.focus({preventScroll:true});
        }
      }}
    >
      <summary
        role="button"
        aria-label={intl.message("comments.audienceLabel", { audience: labels[value] })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        {labels[value]} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </summary>
      <div ref={panel} popover="auto" className="a-composer-popover" role="menu" aria-label={intl.message("comments.audience")}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="menuitemradio"
            aria-checked={option === value}
            disabled={disabled}
            onClick={() => {
              onChange(option);
              close();
            }}
          >
            <span>
              {labels[option]}
              {option === value ? <span aria-hidden="true"> ✓</span> : null}
            </span>
            <small>{descriptions[option]}</small>
          </button>
        ))}
      </div>
    </details>
  );
}
