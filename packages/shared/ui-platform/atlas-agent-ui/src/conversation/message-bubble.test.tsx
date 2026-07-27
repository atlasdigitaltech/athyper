import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AtlasMessage } from "@athyper/atlas-agent-runtime";
import { MessageBubble } from "./message-bubble";

const completedAssistantMessage: AtlasMessage = {
  id: "message-42",
  role: "assistant",
  content: "The invoice total is 1,250.",
  status: "complete",
  createdAt: "2026-07-23T00:00:00.000Z",
  runId: "run-84",
};

describe("MessageBubble feedback", () => {
  it("renders a certified record card and safely falls back for unknown versions", () => {
    render(
      <MessageBubble
        message={{
          ...completedAssistantMessage,
          resultCards: [
            {
              kind: "record_summary",
              version: 1,
              entityType: "company_code",
              entityId: "CC-100",
              title: "Malaysia",
              fields: [{ label: "Code", displayValue: "CC-100" }],
              evidence: [{
                sourceId: "CC-100",
                revisionId: "revision-1",
                checksum: "sha256:abcdef123456",
              }],
            },
            { kind: "record_summary", version: 99 },
          ],
        }}
        feedbackEnabled={false}
        onFeedback={vi.fn(async () => {})}
      />,
    );

    expect(screen.getByRole("region", {
      name: "Record summary: Malaysia",
    })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "This Atlas result uses a newer card format.",
    );
  });

  it("submits feedback for a completed run and shows the success state", async () => {
    const onFeedback = vi.fn(async () => {});
    render(
      <MessageBubble
        message={completedAssistantMessage}
        feedbackEnabled
        onFeedback={onFeedback}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Helpful response" }));

    await waitFor(() => {
      expect(onFeedback).toHaveBeenCalledWith("message-42", "run-84", "correct");
    });
    expect(await screen.findByText("Feedback received")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Helpful response" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unhelpful response" })).toBeDisabled();
  });

  it("shows a recoverable failure state when feedback cannot be sent", async () => {
    const onFeedback = vi.fn(async () => {
      throw new Error("feedback endpoint unavailable");
    });
    render(
      <MessageBubble
        message={completedAssistantMessage}
        feedbackEnabled
        onFeedback={onFeedback}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unhelpful response" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Feedback could not be sent",
    );
    expect(onFeedback).toHaveBeenCalledWith("message-42", "run-84", "wrong");
    expect(screen.getByRole("button", { name: "Helpful response" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Unhelpful response" })).toBeEnabled();
  });

  it.each([
    {
      reason: "the assistant run is still streaming",
      message: { ...completedAssistantMessage, status: "streaming" as const },
      feedbackEnabled: true,
    },
    {
      reason: "the completed message has no authoritative run ID",
      message: { ...completedAssistantMessage, runId: undefined },
      feedbackEnabled: true,
    },
    {
      reason: "feedback is disabled for the plane",
      message: completedAssistantMessage,
      feedbackEnabled: false,
    },
    {
      reason: "the message belongs to the user",
      message: { ...completedAssistantMessage, role: "user" as const },
      feedbackEnabled: true,
    },
  ])("does not offer feedback when $reason", ({ message, feedbackEnabled }) => {
    render(
      <MessageBubble
        message={message}
        feedbackEnabled={feedbackEnabled}
        onFeedback={vi.fn(async () => {})}
      />,
    );

    expect(screen.queryByLabelText("Rate this Atlas response")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Helpful response" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unhelpful response" })).not.toBeInTheDocument();
  });
});
