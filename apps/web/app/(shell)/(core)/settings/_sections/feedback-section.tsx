"use client";

import { useState } from "react";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { ToggleGroup } from "@/components/settings/shared";
import { useIntl } from "@/components/providers/IntlProvider";

export function FeedbackSection() {
  const { formatMessage } = useIntl();
  const [type,      setType]      = useState("suggestion");
  const [msg,       setMsg]       = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="w-full">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CheckCircle2 className="mb-3 h-10 w-10 text-success" />
            <p className="text-sm font-semibold text-foreground">{formatMessage({ id: "settings.feedback.thanks" })}</p>
            <p className="text-xs text-muted-foreground">{formatMessage({ id: "settings.feedback.submitted" })}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Card className="w-full">
        <CardHeader className="pb-0 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            {formatMessage({ id: "settings.feedback.title" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-3">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">{formatMessage({ id: "settings.feedback.typeLabel" })}</p>
            <ToggleGroup
              value={type}
              onChange={setType}
              options={[
                { value: "bug",        label: formatMessage({ id: "settings.feedback.type.bug" }) as string        },
                { value: "suggestion", label: formatMessage({ id: "settings.feedback.type.suggestion" }) as string },
                { value: "question",   label: formatMessage({ id: "settings.feedback.type.question" }) as string   },
              ]}
            />
          </div>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder={formatMessage({ id: "settings.feedback.placeholder" }) as string}
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
              {formatMessage({ id: "settings.feedback.submit" })}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
