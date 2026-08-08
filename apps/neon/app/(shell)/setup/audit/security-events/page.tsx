"use client";

import { useEffect, useState, useCallback } from "react";
import { bffFetch } from "@/lib/bff-fetch";

interface SecurityEvent {
  id: string;
  planeCode: string;
  eventCode: string;
  category: string;
  severity: string;
  outcome: string;
  principalId: string | null;
  sessionId: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  detectionRule: string | null;
  riskScore: number | null;
  sourceService: string;
  correlationId: string | null;
  context: Record<string, unknown>;
  occurredAt: string;
}

const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  warning:  "bg-yellow-100 text-yellow-800",
  error:    "bg-orange-100 text-orange-800",
  info:     "bg-blue-100 text-blue-800",
};

const OUTCOME_CLASS: Record<string, string> = {
  success: "text-green-700",
  failure: "text-red-700",
  denied:  "text-orange-700",
  error:   "text-red-700",
  partial: "text-yellow-700",
  unknown: "text-gray-500",
};

function Badge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${className ?? "bg-gray-100 text-gray-700"}`}>
      {label}
    </span>
  );
}

export default function SecurityEventsPage() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState("");
  const [outcome, setOutcome] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (category) params.set("category", category);
      if (outcome)  params.set("outcome", outcome);
      const json = await bffFetch<{ ok: boolean; data: SecurityEvent[]; hasMore: boolean }>(
        `/api/relay/audit/security-events?${params.toString()}`,
      );
      setEvents(json.data);
      setHasMore(json.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load security events");
    } finally {
      setLoading(false);
    }
  }, [from, to, category, outcome]);

  useEffect(() => { void load(); }, [load]);

  const CATEGORIES = [
    "authentication", "authorization", "data_access", "credential",
    "configuration", "integration", "malware", "privacy",
    "threat", "integrity", "availability", "other",
  ];
  const OUTCOMES = ["success", "failure", "denied", "error", "partial", "unknown"];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Security Events</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Authentication, authorization, and security-critical events from all planes.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          Outcome
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Time</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Event</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Category</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Severity</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Outcome</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Plane</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Source IP</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Principal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && events.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td>
              </tr>
            )}
            {!loading && events.length === 0 && !error && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No security events in the selected window.
                </td>
              </tr>
            )}
            {events.map((ev) => (
              <tr key={ev.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap font-mono">
                  {new Date(ev.occurredAt).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-800">{ev.eventCode}</td>
                <td className="px-4 py-2.5">
                  <Badge label={ev.category} />
                </td>
                <td className="px-4 py-2.5">
                  <Badge label={ev.severity} className={SEVERITY_CLASS[ev.severity]} />
                </td>
                <td className={`px-4 py-2.5 text-xs font-medium ${OUTCOME_CLASS[ev.outcome] ?? "text-gray-700"}`}>
                  {ev.outcome}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{ev.planeCode}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{ev.sourceIp ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-gray-500 font-mono max-w-[120px] truncate" title={ev.principalId ?? ""}>
                  {ev.principalId ? ev.principalId.slice(0, 8) + "…" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {hasMore && (
          <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
            More results available — narrow the date range or add filters to see them.
          </div>
        )}
      </div>
    </div>
  );
}
