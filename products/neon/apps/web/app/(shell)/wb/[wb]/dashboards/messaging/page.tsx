"use client";

import { Badge, Card } from "@neon/ui";
import {
  BookOpen,
  FileText,
  MessageSquare,
  MessagesSquare,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartConfig } from "@/components/ui/chart";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DateRange = "7d" | "30d" | "90d";

interface DailyMessages {
  date: string;
  sent: number;
  read: number;
}

interface RecentActivity {
  id: string;
  conversationTitle: string;
  senderName: string;
  preview: string;
  timestamp: string;
  type: "message" | "conversation_created" | "participant_joined";
}

interface MessagingAnalytics {
  totalConversations: number;
  directConversations: number;
  groupConversations: number;
  totalMessages: number;
  activeUsers: number;
  unreadMessages: number;
  deliveryRate: number;
  readRate: number;
  messagesByDay: DailyMessages[];
  recentActivity: RecentActivity[];
}

// ---------------------------------------------------------------------------
// Chart configs
// ---------------------------------------------------------------------------

const barChartConfig: ChartConfig = {
  sent: { label: "Sent", color: "#3b82f6" },
  read: { label: "Read", color: "#10b981" },
};

const pieChartConfig: ChartConfig = {
  direct: { label: "Direct", color: "#6366f1" },
  group: { label: "Group", color: "#f59e0b" },
};

const PIE_COLORS = ["#6366f1", "#f59e0b"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MessagingDashboardPage() {
  const [analytics, setAnalytics] = useState<MessagingAnalytics | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAnalytics() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/messaging/analytics?range=${dateRange}`, {
          credentials: "same-origin",
        });
        if (!res.ok)
          throw new Error(`Failed to load analytics (${res.status})`);
        const body = (await res.json()) as { data: MessagingAnalytics };
        if (!cancelled) setAnalytics(body.data);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load analytics",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAnalytics();
    return () => {
      cancelled = true;
    };
  }, [dateRange]);

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
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  if (!analytics) return null;

  // Prepare pie data
  const pieData = [
    { name: "Direct", value: analytics.directConversations },
    { name: "Group", value: analytics.groupConversations },
  ];

  // Trim bar chart data to last N entries for display
  const barData = analytics.messagesByDay.slice(-14).map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Messaging Analytics
          </h1>
          <p className="text-sm text-gray-600">
            Conversation metrics, message trends, and entity quick links
          </p>
        </div>
        <div className="flex gap-2">
          {(["7d", "30d", "90d"] as DateRange[]).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDateRange(range)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                dateRange === range
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {range === "7d"
                ? "7 Days"
                : range === "30d"
                  ? "30 Days"
                  : "90 Days"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Conversations"
          value={analytics.totalConversations}
          subtitle={`${analytics.directConversations} direct, ${analytics.groupConversations} group`}
          icon={<MessagesSquare className="size-5 text-indigo-600" />}
        />
        <SummaryCard
          title="Total Messages"
          value={analytics.totalMessages}
          subtitle={`${(analytics.readRate * 100).toFixed(0)}% read rate`}
          icon={<MessageSquare className="size-5 text-blue-600" />}
        />
        <SummaryCard
          title="Active Users"
          value={analytics.activeUsers}
          subtitle="Unique participants"
          icon={<Users className="size-5 text-green-600" />}
        />
        <SummaryCard
          title="Delivery Rate"
          value={`${(analytics.deliveryRate * 100).toFixed(0)}%`}
          subtitle={`${analytics.unreadMessages} unread`}
          icon={<TrendingUp className="size-5 text-orange-600" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart — Message Volume */}
        <Card className="lg:col-span-2 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Message Volume
          </h3>
          <ChartContainer config={barChartConfig} className="h-[300px] w-full">
            <BarChart data={barData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="sent"
                fill="var(--color-sent)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="read"
                fill="var(--color-read)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </Card>

        {/* Pie Chart — Conversation Types */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Conversation Types
          </h3>
          <ChartContainer config={pieChartConfig} className="h-[300px] w-full">
            <PieChart accessibilityLayer>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={60}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {pieData.map((_, index) => (
                  <Cell
                    key={index}
                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="flex justify-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <div
                className="size-3 rounded-sm"
                style={{ backgroundColor: PIE_COLORS[0] }}
              />
              <span className="text-sm text-gray-600">
                Direct ({analytics.directConversations})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="size-3 rounded-sm"
                style={{ backgroundColor: PIE_COLORS[1] }}
              />
              <span className="text-sm text-gray-600">
                Group ({analytics.groupConversations})
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Entity Quick Links */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Entity Quick Links
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EntityLinkCard
            title="Accounts"
            entityClass="Master"
            description="Chart of Accounts — Finance / Core Accounting"
            href="/app/account/view/list"
            icon={<BookOpen className="size-6 text-indigo-600" />}
            recordCount={8}
          />
          <EntityLinkCard
            title="Purchase Invoices"
            entityClass="Document"
            description="Supplier invoices — Supply Chain / Customer Experience"
            href="/app/purchase-invoice/view/list"
            icon={<FileText className="size-6 text-amber-600" />}
            recordCount={8}
          />
        </div>
      </div>

      {/* Recent Activity */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Activity
        </h3>
        {analytics.recentActivity.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conversation</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.recentActivity.map((activity) => (
                <TableRow key={activity.id}>
                  <TableCell className="font-medium">
                    {activity.conversationTitle}
                  </TableCell>
                  <TableCell>{activity.senderName}</TableCell>
                  <TableCell className="max-w-xs truncate text-gray-600">
                    {activity.preview}
                  </TableCell>
                  <TableCell className="text-gray-500">
                    {formatRelativeTime(activity.timestamp)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No recent activity
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-600">{title}</div>
        {icon}
      </div>
      <div className="text-3xl font-bold text-gray-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
    </Card>
  );
}

function EntityLinkCard({
  title,
  entityClass,
  description,
  href,
  icon,
  recordCount,
}: {
  title: string;
  entityClass: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  recordCount: number;
}) {
  return (
    <Link href={href}>
      <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-3 rounded-lg bg-gray-50">{icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-gray-900">{title}</h4>
              <Badge variant="outline" className="text-xs">
                {entityClass}
              </Badge>
            </div>
            <p className="text-sm text-gray-600">{description}</p>
            <p className="text-xs text-gray-400 mt-2">{recordCount} records</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
