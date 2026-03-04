import { Select } from "./Select";

import type { Meta, StoryObj } from "@storybook/react";


const meta = {
  title: "Primitives/Select",
  component: Select,
  tags: ["autodocs"],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Select>
      <option value="">Select an option</option>
    </Select>
  ),
};

export const WithOptions: Story = {
  render: () => (
    <Select>
      <option value="">Choose a fruit...</option>
      <option value="apple">Apple</option>
      <option value="banana">Banana</option>
      <option value="cherry">Cherry</option>
      <option value="date">Date</option>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled>
      <option value="">Disabled select</option>
      <option value="a">Option A</option>
    </Select>
  ),
};
