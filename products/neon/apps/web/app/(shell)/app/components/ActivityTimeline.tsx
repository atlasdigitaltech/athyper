"use client";

import { useEffect, useState } from "react";

/**
 * Activity Timeline Entry
 */
interface TimelineEntry {
  id: string;
  source: string;
  eventType: string;
  severity: string;
  summary: string;
  occurredAt: string;
  actorDisplayName?: string;
  details?: Record<string, unknown>;
}

/**
 * Timeline Props
 */
interface ActivityTimelineProps {
  entityType: string;
  entityId: string;
  limit?: number;
}

/**
 * Severity Badge Component
 */
function SeverityBadge({ severity }: { severity: string }) {
  const colorMap: Record<string, string> = {
    info: "bg-blue-100 text-blue-800",
    warning: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-800",
    success: "bg-green-100 text-green-800",
  };

  const colors = colorMap[severity] || "bg-gray-100 text-gray-800";

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors}`}>
      {severity}
    </span>
  );
}

/**
 * Activity Timeline Component
 *
 * Displays a unified activity timeline for an entity showing:
 * - Workflow events
 * - Permission decisions
 * - Field access logs
 * - Security events
 * - CRUD audit logs
 */
export function ActivityTimeline({
  entityType,
  entityId,
  limit = 50,
}: ActivityTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTimeline() {
      try {
        setLoading(true);
        setError(null);

        const url = `/api/collab/timeline?entityType=${encodeURIComponent(
          entityType
        )}&entityId=${encodeURIComponent(entityId)}&limit=${limit}`;

        const res = await fetch(url, {
          credentials: "same-origin",
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch timeline: ${res.statusText}`);
        }

        const data = await res.json();
        setEntries(data.data || []);
      } catch (err) {
        console.error("Timeline fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to load timeline");
      } finally {
        setLoading(false);
      }
    }

    fetchTimeline();
  }, [entityType, entityId, limit]);

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="animate-pulse">Loading timeline...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        <p>⚠️ {error}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>No activity yet for this record.</p>
      </div>
    );
  }

  return (
    <div className="activity-timeline space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>

      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
          >
            {/* Icon/Avatar */}
            <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
              <span className="text-xs text-gray-600">
                {entry.source.charAt(0).toUpperCase()}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-900">
                  {entry.actorDisplayName || "System"}
                </span>
                <SeverityBadge severity={entry.severity} />
                <span className="text-xs text-gray-500">
                  {new Date(entry.occurredAt).toLocaleString()}
                </span>
              </div>

              {/* Summary */}
              <p className="text-sm text-gray-700">{entry.summary}</p>

              {/* Event Type */}
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {entry.source} · {entry.eventType}
                </span>
              </div>

              {/* Details (collapsible) */}
              {entry.details && Object.keys(entry.details).length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
                    View details
                  </summary>
                  <pre className="mt-1 p-2 text-xs bg-gray-50 rounded overflow-x-auto">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}
      </div>

      {entries.length === limit && (
        <div className="text-center text-sm text-gray-500">
          <p>Showing last {limit} events. Use filters to see more.</p>
        </div>
      )}
    </div>
  );
}
