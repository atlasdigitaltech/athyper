import { Input } from "./Input";

import type { Meta, StoryObj } from "@storybook/react";


const meta = {
  title: "Primitives/Input",
  component: Input,
  tags: ["autodocs"],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Placeholder: Story = {
  args: {
    placeholder: "Enter your name...",
  },
};

export const Disabled: Story = {
  args: {
    placeholder: "Disabled input",
    disabled: true,
  },
};

export const WithType: Story = {
  args: {
    type: "email",
    placeholder: "email@example.com",
  },
};
