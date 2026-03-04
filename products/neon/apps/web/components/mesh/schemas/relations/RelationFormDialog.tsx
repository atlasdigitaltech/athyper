"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { RelationDefinition } from "@/lib/schema-manager/types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const relationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  relationKind: z.enum(["belongs_to", "has_many", "m2m"]),
  targetEntity: z.string().min(1, "Target entity is required"),
  fkField: z.string(),
  targetKey: z.string(),
  onDelete: z.enum(["restrict", "cascade", "set_null"]),
});

type RelationFormValues = z.infer<typeof relationSchema>;

interface RelationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  relation: RelationDefinition | null;
  onSubmit: (values: RelationFormValues) => void;
}

export function RelationFormDialog({
  open,
  onOpenChange,
  relation,
  onSubmit,
}: RelationFormDialogProps) {
  const isEditing = relation !== null;

  const form = useForm<RelationFormValues>({
    resolver: zodResolver(relationSchema as any),
    defaultValues: {
      name: relation?.name ?? "",
      relationKind: relation?.relationKind ?? "belongs_to",
      targetEntity: relation?.targetEntity ?? "",
      fkField: relation?.fkField ?? "",
      targetKey: relation?.targetKey ?? "id",
      onDelete: relation?.onDelete ?? "restrict",
    },
  });

  const handleSubmit = (values: RelationFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Relation" : "Add Relation"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Modify the "${relation.name}" relation.`
              : "Define a new relationship to another entity."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Relation Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., category"
                      {...field}
                      className="font-mono"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="relationKind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kind</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="belongs_to">Belongs To</SelectItem>
                      <SelectItem value="has_many">Has Many</SelectItem>
                      <SelectItem value="m2m">Many-to-Many</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetEntity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target Entity</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., product_category"
                      {...field}
                      className="font-mono"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 grid-cols-2">
              <FormField
                control={form.control}
                name="fkField"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>FK Field</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="category_id"
                        {...field}
                        className="font-mono"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="targetKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Key</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="id"
                        {...field}
                        className="font-mono"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="onDelete"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ON DELETE</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="restrict">RESTRICT</SelectItem>
                      <SelectItem value="cascade">CASCADE</SelectItem>
                      <SelectItem value="set_null">SET NULL</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {isEditing ? "Save Changes" : "Add Relation"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
