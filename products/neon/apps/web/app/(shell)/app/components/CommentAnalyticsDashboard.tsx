"use client";

import { useState, useEffect } from "react";

/**
 * Daily Analytics Type
 */
interface DailyAnalytics {
  date: string;
  entityType?: string;
  totalComments: number;
  totalReplies: number;
  uniqueCommenters: number;
  totalReactions: number;
  totalFlags: number;
  avgCommentLength?: number;
}

/**
 * User Engagement Type
 */
interface UserEngagement {
  userId: string;
  userDisplayName?: string;
  periodStart: string;
  periodEnd: string;
  totalComments: number;
  totalReplies: number;
  totalReactionsGiven: number;
  totalReactionsReceived: number;
  totalMentionsReceived: number;
  engagementScore?: number;
}

/**
 * Thread Analytics Type
 */
interface ThreadAnalytics {
  entityType: string;
  entityId: string;
  entityDisplayName?: string;
  totalComments: number;
  uniqueParticipants: number;
  totalReactions: number;
  threadDepth: number;
  firstCommentAt: string;
  lastCommentAt: string;
  isActive: boolean;
}

/**
 * Analytics Summary Type
 */
interface AnalyticsSummary {
  totalComments: number;
  totalUsers: number;
  avgCommentsPerUser: number;
  totalThreads: number;
  activeThreads: number;
  avgResponseTimeSeconds?: number;
  topContributors: Array<{ userId: string; commentCount: number; userDisplayName?: string }>;
}

/**
 * Date Range Type
 */
type DateRange = '7d' | '30d' | '90d';

/**
 * Comment Analytics Dashboard Props
 */
interface CommentAnalyticsDashboardProps {
  tenantId?: string;
  entityType?: string;
}

/**
 * Comment Analytics Dashboard Component
 *
 * Displays engagement metrics, trends, and insights.
 */
export function CommentAnalyticsDashboard({
  tenantId,
  entityType,
}: CommentAnalyticsDashboardProps) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [dailyAnalytics, setDailyAnalytics] = useState<DailyAnalytics[]>([]);
  const [topEngagers, setTopEngagers] = useState<UserEngagement[]>([]);
  const [activeThreads, setActiveThreads] = useState<ThreadAnalytics[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getDateRange = (range: DateRange) => {
    const end = new Date();
    const start = new Date();
    switch (range) {
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
    }
    return { start: start.toISOString(), end: end.toISOString() };
  };

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        const { start, end } = getDateRange(dateRange);
        const params = new URLSearchParams({
          startDate: start,
          endDate: end,
        });

        if (entityType) {
          params.set('entityType', entityType);
        }

        // Fetch summary
        const summaryRes = await fetch(`/api/collab/analytics/summary?${params.toString()}`, {
          credentials: 'same-origin',
        });
        if (summaryRes.ok) {
          const data = await summaryRes.json();
          setSummary(data.data);
        }

        // Fetch daily analytics
        const dailyRes = await fetch(`/api/collab/analytics/daily?${params.toString()}`, {
          credentials: 'same-origin',
        });
        if (dailyRes.ok) {
          const data = await dailyRes.json();
          setDailyAnalytics(data.data || []);
        }

        // Fetch top engagers
        const engagersRes = await fetch(
          `/api/collab/analytics/leaderboard?${params.toString()}&limit=10`,
          { credentials: 'same-origin' }
        );
        if (engagersRes.ok) {
          const data = await engagersRes.json();
          setTopEngagers(data.data || []);
        }

        // Fetch active threads
        const threadsRes = await fetch(
          `/api/collab/analytics/threads?${params.toString()}&limit=10`,
          { credentials: 'same-origin' }
        );
        if (threadsRes.ok) {
          const data = await threadsRes.json();
          setActiveThreads(data.data || []);
        }
      } catch (err) {
        console.error('Error fetching analytics:', err);
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [dateRange, entityType]);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-pulse text-gray-500">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600">⚠️ {error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Comment Analytics</h1>
          <p className="text-sm text-gray-600">
            Engagement metrics and insights for collaboration activity
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as DateRange[]).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDateRange(range)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                dateRange === range
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {range === '7d' ? 'Last 7 Days' : range === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-600">Total Comments</div>
              <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-gray-900">{summary.totalComments.toLocaleString()}</div>
            {summary.avgCommentsPerUser > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {summary.avgCommentsPerUser.toFixed(1)} per user
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-600">Active Users</div>
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-gray-900">{summary.totalUsers.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Unique commenters</div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-600">Active Threads</div>
              <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {summary.activeThreads.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              of {summary.totalThreads.toLocaleString()} total
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-600">Avg Response Time</div>
              <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {summary.avgResponseTimeSeconds
                ? `${Math.floor(summary.avgResponseTimeSeconds / 60)}m`
                : 'N/A'}
            </div>
            <div className="text-xs text-gray-500 mt-1">Time to first response</div>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Activity</h3>
          {dailyAnalytics.length > 0 ? (
            <div className="space-y-2">
              {dailyAnalytics.slice(-7).map((day) => {
                const max = Math.max(...dailyAnalytics.map(d => d.totalComments));
                const barWidth = max > 0 ? (day.totalComments / max) * 100 : 0;

                return (
                  <div key={day.date} className="flex items-center gap-3">
                    <div className="text-xs text-gray-600 w-20 flex-shrink-0">
                      {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 relative">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                        {day.totalComments} comments
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">No data available</div>
          )}
        </div>

        {/* Top Contributors */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Contributors</h3>
          {summary && summary.topContributors.length > 0 ? (
            <div className="space-y-3">
              {summary.topContributors.map((contributor, index) => (
                <div key={contributor.userId} className="flex items-center gap-3">
                  <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                    index === 1 ? 'bg-gray-200 text-gray-700' :
                    index === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-gray-600">
                      {(contributor.userDisplayName || contributor.userId).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {contributor.userDisplayName || contributor.userId}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-700">
                    {contributor.commentCount} comments
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">No contributors yet</div>
          )}
        </div>
      </div>

      {/* Active Threads */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Most Active Threads</h3>
        {activeThreads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comments
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Participants
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reactions
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Activity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activeThreads.map((thread) => (
                  <tr key={`${thread.entityType}-${thread.entityId}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="font-medium">{thread.entityDisplayName || thread.entityId}</div>
                      <div className="text-xs text-gray-500">{thread.entityType}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      {thread.totalComments}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {thread.uniqueParticipants}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {thread.totalReactions}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(thread.lastCommentAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {thread.isActive ? (
                        <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-600 rounded-full">
                          Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">No active threads</div>
        )}
      </div>
    </div>
  );
}
