import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { AuthFailureBridge } from "./auth-failure-bridge";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

async function publishQueryError(
  queryClient: QueryClient,
  error: Error & { code: string; requestId?: string },
): Promise<void> {
  await act(async () => {
    await queryClient.fetchQuery({
      queryKey: ["auth-failure", error.code, error.requestId],
      queryFn: async () => {
        throw error;
      },
    }).catch(() => undefined);
  });
}

describe("AuthFailureBridge", () => {
  it("replaces its wrapped application with the shared fatal presentation", async () => {
    const queryClient = createQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthFailureBridge>
          <div>Authenticated application</div>
        </AuthFailureBridge>
      </QueryClientProvider>,
    );

    await publishQueryError(
      queryClient,
      Object.assign(new Error("Session store unavailable"), {
        code: "SESSION_STORE_UNAVAILABLE",
        requestId: "request-fatal-1",
      }),
    );

    expect(await screen.findByText("Sign-in is temporarily unavailable.")).toBeInTheDocument();
    expect(screen.getByText("request-fatal-1")).toBeInTheDocument();
    expect(screen.queryByText("Authenticated application")).not.toBeInTheDocument();
  });

  it("emits functional invalidation independently from telemetry", async () => {
    const queryClient = createQueryClient();
    const onAuthFailure = vi.fn();
    const recordTelemetry = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthFailureBridge
          onAuthFailure={onAuthFailure}
          recordTelemetry={recordTelemetry}
        >
          <div>Authenticated application</div>
        </AuthFailureBridge>
      </QueryClientProvider>,
    );

    await publishQueryError(
      queryClient,
      Object.assign(new Error("CSRF validation failed"), {
        code: "CSRF_VALIDATION_FAILED",
      }),
    );

    await waitFor(() => expect(onAuthFailure).toHaveBeenCalledOnce());
    expect(recordTelemetry).toHaveBeenCalledOnce();
    expect(onAuthFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "CSRF_VALIDATION_FAILED",
        event: "auth.failure.csrf_validation_failed",
      }),
    );
    expect(recordTelemetry).toHaveBeenCalledWith(onAuthFailure.mock.calls[0]?.[0]);
    expect(screen.getByText("Authenticated application")).toBeInTheDocument();
  });
});
