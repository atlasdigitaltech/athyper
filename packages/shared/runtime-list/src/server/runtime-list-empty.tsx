interface RuntimeListEmptyProps {
  title:   string;
  message: string;
}

export function RuntimeListEmpty({ title, message }: RuntimeListEmptyProps) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-md border bg-background p-4 text-center">
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
