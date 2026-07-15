import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldUiHintSchema } from "@athyper/api-contracts/metadata";
import {
  SegmentedToggle,
  readSegmentedFieldOptions,
  type SegmentedFieldContract,
} from "../_shared";

const applyToField: SegmentedFieldContract = {
  name: "apply_to",
  label: "Apply to",
  ui_type: "segmented",
  enum_config: {
    values: [
      { value: "all_items", label: "All lines", description: "Spread across lines" },
      { value: "one_item", label: "One line", description: "Apply to one selected line" },
    ],
  },
  ui_hint: {
    variant: "compact",
    size: "sm",
    layout: "content",
    show_option_descriptions: false,
  },
};

describe("metadata-driven segmented fields", () => {
  it("formally validates the supported UI hints", () => {
    expect(FieldUiHintSchema.parse(applyToField.ui_hint)).toMatchObject({
      size: "sm",
      layout: "content",
      show_option_descriptions: false,
    });
  });

  it("resolves canonical options and domain aliases", () => {
    expect(readSegmentedFieldOptions(applyToField, { all_items: "whole_invoice" })).toEqual([
      { value: "whole_invoice", label: "All lines", sublabel: "Spread across lines", disabled: false },
      { value: "one_item", label: "One line", sublabel: "Apply to one selected line", disabled: false },
    ]);
  });

  it("uses metadata labels, compact density, and description visibility", () => {
    const onChange = vi.fn();
    render(
      <SegmentedToggle
        value="all_items"
        options={[]}
        field={applyToField}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("group")).toHaveClass("w-fit");
    expect(screen.getByRole("group")).toHaveClass("h-9", "overflow-hidden", "rounded-md", "bg-card");
    expect(screen.getByRole("button", { name: "All lines" })).toHaveClass(
      "min-w-20",
      "bg-foreground",
      "text-background",
      "font-medium",
    );
    expect(screen.queryByText("Spread across lines")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "One line" }));
    expect(onChange).toHaveBeenCalledWith("one_item");
  });
});
