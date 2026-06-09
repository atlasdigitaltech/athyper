"use client";

import { useState } from "react";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { ToggleGroup } from "../_shared";

export function FeedbackSection() {
  const [type,      setType]      = useState("suggestion");
  const [msg,       setMsg]       = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="w-full">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CheckCircle2 className="mb-3 h-10 w-10 text-success" />
            <p className="text-sm font-medium text-foreground">Thanks for your feedback!</p>
            <p className="text-xs text-muted-foreground">Your message has been submitted.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Card className="w-full">
        <CardHeader className="pb-0 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Share feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-3">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Type</p>
            <ToggleGroup
              value={type}
              onChange={setType}
              options={[
                { value: "bug",        label: "Bug" },
                { value: "suggestion", label: "Suggestion" },
                { value: "question",   label: "Question" },
              ]}
            />
          </div>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Describe what you've found or what would help..."
            rows={5}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex justify-end">
            <Button
              disabled={!msg.trim()}
              onClick={() => {
                setSubmitted(true);
                setTimeout(() => { setSubmitted(false); setMsg(""); }, 3000);
              }}
              className="text-sm"
            >
              Submit
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
