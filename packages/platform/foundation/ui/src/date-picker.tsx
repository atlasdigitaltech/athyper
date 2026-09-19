"use client";

import {
  forwardRef,
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";

const Calendar = lazy(() => import("./date-picker-calendar"));
export interface DatePickerProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  error?: boolean;
  calendarLabel?: string;
}

/** Keeps native date editing, constraint validation, refs and ISO form values. */
export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  function DatePicker(
    {
      className,
      error,
      calendarLabel = "Choose date",
      onChange,
      onKeyDown,
      ...props
    },
    forwardedRef,
  ) {
    const input = useRef<HTMLInputElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const id = useId();
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState("");
    const close = (restore = true) => {
      panel.current?.hidePopover();
      setOpen(false);
      if (restore) trigger.current?.focus();
    };
    const show = () => {
      if (props.disabled || props.readOnly) return;
      setSelected(input.current?.value ?? "");
      setOpen(true);
      panel.current?.showPopover();
    };
    useEffect(() => {
      if (!open) return;
      const position = () => {
        const anchor = input.current?.getBoundingClientRect(),
          popup = panel.current;
        if (!anchor || !popup) return;
        const bounds = popup.getBoundingClientRect();
        popup.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - bounds.width - 8))}px`;
        popup.style.top = `${anchor.bottom + bounds.height + 6 <= window.innerHeight - 8 ? anchor.bottom + 6 : Math.max(8, anchor.top - bounds.height - 6)}px`;
      };
      position();
      const observer = new ResizeObserver(position);
      if (panel.current) observer.observe(panel.current);
      window.addEventListener("resize", position);
      window.addEventListener("scroll", position, true);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", position);
        window.removeEventListener("scroll", position, true);
      };
    }, [open]);
    useEffect(() => {
      if (props.disabled || props.readOnly) {
        panel.current?.hidePopover();
        setOpen(false);
      }
    }, [props.disabled, props.readOnly]);
    const choose = (value: string) => {
      const element = input.current;
      if (!element) return;
      // The native setter lets React dispatch a real change event to existing consumers.
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      close();
    };
    return (
      <span className="a-date-picker">
        <input
          {...props}
          type="date"
          ref={(element) => {
            input.current = element;
            if (typeof forwardedRef === "function") forwardedRef(element);
            else if (forwardedRef) forwardedRef.current = element;
          }}
          className={["a-input", "a-date-picker__input", className]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={props["aria-invalid"] ?? (error || undefined)}
          onChange={onChange}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (
              !event.defaultPrevented &&
              event.altKey &&
              event.key === "ArrowDown"
            ) {
              event.preventDefault();
              show();
            }
          }}
        />
        <button
          ref={trigger}
          type="button"
          className="a-date-picker__trigger"
          aria-label={calendarLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={id}
          disabled={props.disabled || props.readOnly}
          onClick={() => (open ? close() : show())}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
        </button>
        <div
          id={id}
          ref={panel}
          popover="auto"
          role="dialog"
          // Keep focus inside when padding or other non-interactive content is clicked.
          tabIndex={-1}
          aria-label={calendarLabel}
          className="a-date-picker__popover"
          onToggle={(event) => setOpen(event.newState === "open")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
          onBlur={(event) => {
            if (
              event.relatedTarget &&
              !event.currentTarget.contains(event.relatedTarget as Node) &&
              event.relatedTarget !== trigger.current
            )
              close(false);
          }}
        >
          {open ? (
            <Suspense fallback={<span role="status">Loading calendar…</span>}>
              <Calendar
                value={selected}
                min={typeof props.min === "string" ? props.min : undefined}
                max={typeof props.max === "string" ? props.max : undefined}
                required={props.required}
                onSelect={choose}
              />
            </Suspense>
          ) : null}
        </div>
      </span>
    );
  },
);
