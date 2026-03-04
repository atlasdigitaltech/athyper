import { ScrollArea } from "./ScrollArea";

import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Primitives/ScrollArea",
  component: ScrollArea,
  tags: ["autodocs"],
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ScrollArea
      style={{
        height: 200,
        width: 350,
        borderRadius: 8,
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16, fontWeight: 500, lineHeight: 1 }}>
          Tags
        </h4>
        {Array.from({ length: 50 }, (_, i) => (
          <div
            key={i}
            style={{
              fontSize: 14,
              borderBottom: "1px solid var(--border)",
              padding: "8px 0",
            }}
          >
            Item {i + 1}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};
