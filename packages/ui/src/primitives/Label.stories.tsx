import { Label } from "./Label";

import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Primitives/Label",
  component: Label,
  tags: ["autodocs"],
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Email address",
    htmlFor: "email",
  },
};
