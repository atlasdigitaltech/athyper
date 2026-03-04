import type { Meta, StoryObj } from "@storybook/react";

import { Card } from "./Card";

const meta = {
  title: "Primitives/Card",
  component: Card,
  tags: ["autodocs"],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Card content",
  },
};

export const WithContent: Story = {
  render: () => (
    <Card>
      <h3 style={{ margin: 0, fontWeight: 600, fontSize: "1.125rem" }}>
        Card Title
      </h3>
      <p style={{ margin: "0.5rem 0 0", color: "var(--muted-foreground)" }}>
        This is an example card with a title and description content inside it.
      </p>
    </Card>
  ),
};
