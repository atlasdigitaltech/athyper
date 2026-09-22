"use client";
import { useEffect, useRef } from "react";
type Audience = "public" | "internal" | "private";
const labels = { public: "Public", internal: "Internal", private: "Private" };
const descriptions = {
  public: "People authorized to view this record",
  internal: "Authorized internal participants",
  private: "Only you",
};

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
  const root = useRef<HTMLDetailsElement>(null);
  const close = () => {
    root.current?.removeAttribute("open");
    root.current?.querySelector("summary")?.focus();
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        root.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <details
      ref={root}
      className="a-comment-audience-picker"
      onToggle={() => {
        if (root.current?.open)
          root.current
            .querySelector<HTMLElement>('[aria-checked="true"]')
            ?.focus();
      }}
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
          items[next]?.focus();
        }
      }}
    >
      <summary
        role="button"
        aria-label={`Audience: ${labels[value]}`}
        aria-haspopup="menu"
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        {labels[value]} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </summary>
      <div role="menu" aria-label="Comment audience">
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
