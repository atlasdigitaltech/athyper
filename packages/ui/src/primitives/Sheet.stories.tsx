
import { Button } from "./Button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./Sheet";

import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Primitives/Sheet",
  component: Sheet,
  tags: ["autodocs"],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sheet Title</SheetTitle>
          <SheetDescription>
            This is a sheet panel that slides in from the side.
          </SheetDescription>
        </SheetHeader>
        <div style={{ padding: "0 16px" }}>
          <p>Sheet body content goes here.</p>
        </div>
        <SheetFooter>
          <Button variant="primary">Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
