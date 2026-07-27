/**
 * FieldRow contract tests.
 *
 * Per the Phase 9 plan, REAL pixel/layout assertions live in Phase 12
 * (Playwright E2E) — jsdom doesn't run layout, so offsetHeight is
 * unreliable. These tests instead verify the contract:
 *   - the right structural attributes render
 *   - the height token (via style.minHeight) is set per density
 *   - locked reasons surface as expected affordances
 *   - dirty / invalid attrs render correctly
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FieldRow, FIELD_ROW_SPACING } from "../../field-row";

describe("field-row", () => {
  it("renders the row container with data-density attribute matching the prop", () => {
    const { container } = render(
      <FieldRow density="compact">
        <FieldRow.Label>Field</FieldRow.Label>
        <FieldRow.Read>value</FieldRow.Read>
      </FieldRow>,
    );
    const root = container.querySelector("[data-field-row]");
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute("data-density", "compact");
  });

  it("applies the density-mapped minHeight as an inline style token", () => {
    const { container } = render(
      <FieldRow density="comfortable">
        <FieldRow.Label>Field</FieldRow.Label>
        <FieldRow.Read>x</FieldRow.Read>
      </FieldRow>,
    );
    const root = container.querySelector("[data-field-row]") as HTMLElement;
    // Layout pixels are not asserted (jsdom doesn't lay out). The contract
    // is that the CSS variable token from FIELD_ROW_SPACING is applied.
    expect(root.style.minHeight).toBe(FIELD_ROW_SPACING.comfortable.minHeight);
  });

  it("FieldRow.Read renders children and a lucide Lock icon when reason is set", () => {
    const { container, getByText } = render(
      <FieldRow>
        <FieldRow.Label>Status</FieldRow.Label>
        <FieldRow.Read reason="status_locked" reasonMessage="Cannot edit in current status">
          submitted
        </FieldRow.Read>
      </FieldRow>,
    );
    expect(getByText("submitted")).toBeInTheDocument();
    const readSlot = container.querySelector("[data-field-read]") as HTMLElement;
    expect(readSlot).toHaveAttribute("data-reason", "status_locked");
    expect(readSlot.getAttribute("title")).toBe("Cannot edit in current status");
    // The Lock icon renders as an SVG element from lucide.
    expect(readSlot.querySelector("svg")).not.toBeNull();
  });

  it("FieldRow.Edit renders children + inline error message when error prop is set", () => {
    const { container, getByText } = render(
      <FieldRow invalid>
        <FieldRow.Label>Amount</FieldRow.Label>
        <FieldRow.Edit error="Must be positive">
          <input data-testid="amount-input" />
        </FieldRow.Edit>
      </FieldRow>,
    );
    expect(container.querySelector("[data-testid='amount-input']")).not.toBeNull();
    expect(getByText("Must be positive")).toBeInTheDocument();
    const editSlot = container.querySelector("[data-field-edit]") as HTMLElement;
    expect(editSlot).toHaveAttribute("data-error");
  });

  it("dirty + invalid data-attributes render on the row container", () => {
    const { container } = render(
      <FieldRow dirty invalid>
        <FieldRow.Label>F</FieldRow.Label>
        <FieldRow.Edit error="x"><input /></FieldRow.Edit>
      </FieldRow>,
    );
    const root = container.querySelector("[data-field-row]") as HTMLElement;
    expect(root).toHaveAttribute("data-dirty");
    expect(root).toHaveAttribute("data-invalid");
  });

  it("exposes help, inheritance, source, audit, and stable loading metadata", () => {
    const { container, getByText } = render(
      <FieldRow>
        <FieldRow.Label helpText="Configured by purchasing policy">Terms</FieldRow.Label>
        <FieldRow.Read
          inherited
          sourceLabel="Purchasing organization"
          auditLabel="Updated by Ada"
        >
          Net 30
        </FieldRow.Read>
      </FieldRow>,
    );
    expect(getByText("Inherited")).toBeInTheDocument();
    expect(getByText("Source: Purchasing organization")).toBeInTheDocument();
    expect(getByText("Updated by Ada")).toBeInTheDocument();
    expect(container.querySelector("[data-field-read]")).toHaveAttribute("data-inherited");

    const skeleton = render(
      <FieldRow>
        <FieldRow.Label>Terms</FieldRow.Label>
        <FieldRow.Skeleton />
      </FieldRow>,
    );
    expect(skeleton.container.querySelector("[data-field-skeleton]")).not.toBeNull();
  });
});
