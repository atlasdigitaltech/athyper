"use client";

import { useState, useEffect } from "react";

/**
 * SLA Metrics Type
 */
interface SLAMetrics {
  entityType: string;
  entityId: string;
  firstCommentAt: string;
  firstResponseAt?: string;
  firstResponseTimeSeconds?: number;
  totalComments: number;
  totalResponses: number;
  avgResponseTimeSeconds?: number;
  maxResponseTimeSeconds?: number;
  slaTargetSeconds?: number;
  isSLABreached: boolean;
}

/**
 * SLA Indicator Props
 */
interface CommentSLAIndicatorProps {
  entityType: string;
  entityId: string;
  compact?: boolean;
}

/**
 * Format seconds to human-readable time
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Comment SLA Indicator Component
 *
 * Displays SLA metrics and status for comment response times.
 */
export function CommentSLAIndicator({
  entityType,
  entityId,
  compact = false,
}: CommentSLAIndicatorProps) {
  const [metrics, setMetrics] = useState<SLAMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/collab/sla/metrics?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
          { credentials: 'same-origin' }
        );

        if (!res.ok) {
          throw new Error('Failed to fetch SLA metrics');
        }

        const data = await res.json();
        setMetrics(data.data || null);
      } catch (err) {
        console.error('Error fetching SLA metrics:', err);
        setError(err instanceof Error ? err.message : 'Failed to load SLA metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [entityType, entityId]);

  if (loading) {
    return compact ? (
      <div className="text-xs text-gray-400 animate-pulse">Loading SLA...</div>
    ) : (
      <div className="p-4 bg-gray-50 rounded-lg animate-pulse">
        <div className="text-sm text-gray-500">Loading SLA metrics...</div>
      </div>
    );
  }

  if (error || !metrics) {
    return null; // Silently fail if no SLA data
  }

  // Calculate time since first comment (for pending responses)
  const timeSinceFirstComment = metrics.firstResponseAt
    ? null
    : Math.floor((Date.now() - new Date(metrics.firstCommentAt).getTime()) / 1000);

  // Determine SLA status
  const getSLAStatus = () => {
    if (!metrics.slaTargetSeconds) return 'no-target';
    if (metrics.isSLABreached) return 'breached';
    if (metrics.firstResponseAt) return 'met';
    if (timeSinceFirstComment && timeSinceFirstComment > metrics.slaTargetSeconds * 0.8) return 'at-risk';
    return 'on-track';
  };

  const status = getSLAStatus();

  // Compact view (single line badge)
  if (compact) {
    return (
      <div className="inline-flex items-center gap-2">
        {status === 'breached' && (
          <span className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-800 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            SLA Breached
          </span>
        )}
        {status === 'at-risk' && (
          <span className="px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            SLA At Risk
          </span>
        )}
        {status === 'met' && metrics.firstResponseTimeSeconds && (
          <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Responded in {formatDuration(metrics.firstResponseTimeSeconds)}
          </span>
        )}
      </div>
    );
  }

  // Full view (detailed card)
  return (
    <div className={`p-4 rounded-lg border-l-4 ${
      status === 'breached' ? 'bg-red-50 border-red-500' :
      status === 'at-risk' ? 'bg-yellow-50 border-yellow-500' :
      status === 'met' ? 'bg-green-50 border-green-500' :
      'bg-gray-50 border-gray-300'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">
            Response Time SLA
          </h4>
          {metrics.slaTargetSeconds && (
            <p className="text-xs text-gray-600">
              Target: {formatDuration(metrics.slaTargetSeconds)}
            </p>
          )}
        </div>
        <div className="text-right">
          {status === 'breached' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-red-600 text-white rounded-full">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              BREACHED
            </span>
          )}
          {status === 'at-risk' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-yellow-600 text-white rounded-full">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              AT RISK
            </span>
          )}
          {status === 'met' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-green-600 text-white rounded-full">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              MET
            </span>
          )}
          {status === 'on-track' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-blue-600 text-white rounded-full">
              ON TRACK
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-gray-600 mb-1">First Response</div>
          <div className="text-sm font-semibold text-gray-900">
            {metrics.firstResponseAt ? (
              <span className="text-green-700">
                {formatDuration(metrics.firstResponseTimeSeconds || 0)}
              </span>
            ) : (
              <span className="text-yellow-700">
                Pending ({formatDuration(timeSinceFirstComment || 0)})
              </span>
            )}
          </div>
        </div>

        {metrics.avgResponseTimeSeconds && (
          <div>
            <div className="text-xs text-gray-600 mb-1">Avg Response</div>
            <div className="text-sm font-semibold text-gray-900">
              {formatDuration(metrics.avgResponseTimeSeconds)}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs text-gray-600 mb-1">Total Comments</div>
          <div className="text-sm font-semibold text-gray-900">
            {metrics.totalComments}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-600 mb-1">Total Responses</div>
          <div className="text-sm font-semibold text-gray-900">
            {metrics.totalResponses}
          </div>
        </div>
      </div>
    </div>
  );
}
