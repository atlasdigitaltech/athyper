"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckSquare, Clock, User } from "lucide-react";
import { Skeleton, Badge } from "@athyper/ui/primitives";

interface RecordTask {
  id: string;
  title: string;
  status: string;
  assignee_name?: string;
  due_date?: string;
  priority?: string;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <CheckSquare className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No tasks assigned to this record</p>
    </div>
  );
}

export interface TasksPanelProps {
  entityCode: string;
  recordId: string;
}

export function TasksPanel({ entityCode, recordId }: TasksPanelProps) {
  const { data, isLoading } = useQuery<{ data: RecordTask[] }>({
    queryKey: ["record-tasks", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/tasks`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: RecordTask[] }>;
    },
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  const tasks = data?.data ?? [];
  if (tasks.length === 0) return <EmptyState />;

  return (
    <div className="divide-y">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center gap-3 py-3">
          <CheckSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-sm">{task.title}</span>
          {task.assignee_name && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              {task.assignee_name}
            </span>
          )}
          {task.due_date && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {task.due_date}
            </span>
          )}
          <Badge variant="outline" className="text-xs">{task.status}</Badge>
        </div>
      ))}
    </div>
  );
}
