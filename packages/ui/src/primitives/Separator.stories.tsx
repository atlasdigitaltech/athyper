import { Separator } from "./Separator";

import type { Meta, StoryObj } from "@storybook/react";


const meta = {
  title: "Primitives/Separator",
  component: Separator,
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"],
    },
  },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  args: {
    orientation: "horizontal",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%" }}>
        <p>Content above</p>
        <Story />
        <p>Content below</p>
      </div>
    ),
  ],
};

export const Vertical: Story = {
  args: {
    orientation: "vertical",
  },
  decorators: [
    (Story) => (
      <div
        style={{ display: "flex", alignItems: "center", height: 40, gap: 8 }}
      >
        <span>Left</span>
        <Story />
        <span>Right</span>
      </div>
    ),
  ],
};
