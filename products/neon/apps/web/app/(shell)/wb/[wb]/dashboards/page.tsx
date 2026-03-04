"use client";

import { Badge, Card } from "@neon/ui";
import { BarChart3, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";


interface DashboardEntry {
    key: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    tags: string[];
}

const DASHBOARDS: DashboardEntry[] = [
    {
        key: "messaging",
        title: "Messaging Analytics",
        description: "Conversation metrics, message trends, delivery rates, and entity quick links.",
        icon: <MessageSquare className="size-6 text-blue-600" />,
        tags: ["Messaging", "Analytics", "Real-time"],
    },
];

export default function DashboardsHubPage() {
    const params = useParams<{ wb: string }>();
    const wb = params.wb;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <BarChart3 className="size-6 text-gray-700" />
                    <h1 className="text-2xl font-bold text-gray-900">Dashboards</h1>
                </div>
                <p className="text-sm text-gray-600">
                    Browse and manage dashboards scoped to your workbench.
                </p>
            </div>

            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {DASHBOARDS.map((dashboard) => (
                    <Link key={dashboard.key} href={`/wb/${wb}/dashboards/${dashboard.key}`}>
                        <Card className="p-6 h-full hover:shadow-md transition-shadow cursor-pointer">
                            <div className="flex items-start gap-3 mb-3">
                                <div className="flex-shrink-0 p-2 rounded-lg bg-gray-50">
                                    {dashboard.icon}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">{dashboard.title}</h3>
                                </div>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">{dashboard.description}</p>
                            <div className="flex flex-wrap gap-2">
                                {dashboard.tags.map((tag) => (
                                    <Badge key={tag} variant="secondary" className="text-xs">
                                        {tag}
                                    </Badge>
                                ))}
                            </div>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
