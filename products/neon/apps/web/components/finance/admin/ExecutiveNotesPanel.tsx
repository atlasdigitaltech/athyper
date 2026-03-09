"use client";

// components/finance/admin/ExecutiveNotesPanel.tsx
//
// Commentary panel for CFO workspace — view & edit executive notes
// on pack instances. Uses existing fin.report_commentary table.

import { useState } from "react";
import {
  BookOpen,
  Edit3,
  Loader2,
  MessageSquare,
  Save,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import type { CommentaryDTO, CommentarySaveInput } from "@/lib/finance/use-cfo-actions";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExecutiveNotesPanelProps {
  items: CommentaryDTO[];
  loading?: boolean;
  saving?: boolean;
  onSave: (input: CommentarySaveInput) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Type labels
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  NARRATIVE: "Narrative",
  HIGHLIGHT: "Highlight",
  RISK: "Risk",
  ACTION: "Action",
  APPROVAL_NOTE: "Approval Note",
};

const TYPE_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  NARRATIVE: "default",
  HIGHLIGHT: "secondary",
  RISK: "destructive",
  ACTION: "outline",
  APPROVAL_NOTE: "secondary",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExecutiveNotesPanel({
  items,
  loading,
  saving,
  onSave,
}: ExecutiveNotesPanelProps) {
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState("NARRATIVE");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Executive Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading notes...</span>
        </CardContent>
      </Card>
    );
  }

  const handleSave = async () => {
    if (!editBody.trim()) return;
    await onSave({
      commentaryType: editType,
      title: editTitle || undefined,
      body: editBody,
    });
    setEditing(false);
    setEditTitle("");
    setEditBody("");
  };

  const handleStartEdit = (item?: CommentaryDTO) => {
    if (item) {
      setEditType(item.commentary_type);
      setEditTitle(item.title ?? "");
      setEditBody(item.body);
    } else {
      setEditType("NARRATIVE");
      setEditTitle("");
      setEditBody("");
    }
    setEditing(true);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Executive Notes
            </CardTitle>
            <CardDescription className="text-[10px] mt-0.5">
              {items.length} note{items.length !== 1 ? "s" : ""} on this pack
            </CardDescription>
          </div>
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleStartEdit()}
            >
              <Edit3 className="h-3 w-3 mr-1" />
              Add Note
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Editor */}
        {editing && (
          <div className="space-y-2 p-2 border rounded-md bg-muted/30">
            <div className="flex items-center gap-2">
              <select
                className="text-xs border rounded px-2 py-1 bg-background"
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <input
                className="flex-1 text-xs border rounded px-2 py-1 bg-background"
                placeholder="Title (optional)"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <Textarea
              className="text-xs min-h-[80px]"
              placeholder="Write your note..."
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setEditing(false)}
              >
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!editBody.trim() || saving}
                onClick={handleSave}
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Save className="h-3 w-3 mr-1" />
                )}
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Existing notes */}
        {items.length === 0 && !editing && (
          <div className="flex items-center gap-2 py-3">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">No notes yet. Add one to document key observations.</span>
          </div>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            className="p-2 border rounded-md space-y-1 hover:bg-muted/20 cursor-pointer"
            onClick={() => handleStartEdit(item)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={TYPE_COLORS[item.commentary_type] ?? "outline"} className="text-[9px]">
                  {TYPE_LABELS[item.commentary_type] ?? item.commentary_type}
                </Badge>
                {item.title && (
                  <span className="text-xs font-medium">{item.title}</span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">v{item.version}</span>
            </div>
            <p className="text-xs text-foreground/80 line-clamp-2">{item.body}</p>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {item.author_name && <span>{item.author_name}</span>}
              <span>{new Date(item.created_at).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
