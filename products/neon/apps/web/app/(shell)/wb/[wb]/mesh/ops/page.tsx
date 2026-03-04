"use client";

import { Database, Globe, HardDrive, KeyRound, ListTodo } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface OpsCard {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
}

const OPS_SECTIONS: OpsCard[] = [
  {
    title: "Gateway",
    description:
      "Configure Traefik routes, middleware chains, TLS certificates, rate limiting, and load balancing.",
    icon: Globe,
    href: "/gateway",
  },
  {
    title: "Identity & Access",
    description:
      "Manage Keycloak realms, clients, identity providers, user federation, and auth flows.",
    icon: KeyRound,
    href: "/iam",
  },
  {
    title: "Cache",
    description:
      "Monitor Redis instances, inspect cache keys, manage eviction policies, and view memory utilization.",
    icon: Database,
    href: "/cache",
  },
  {
    title: "Object Storage",
    description:
      "Manage MinIO buckets, object lifecycle policies, storage quotas, and access configurations.",
    icon: HardDrive,
    href: "/storage",
  },
  {
    title: "Job Queues",
    description:
      "Monitor background job queues, inspect job status, retry failed jobs, and pause/resume processing.",
    icon: ListTodo,
    href: "/jobs",
  },
];

export default function OpsPage() {
  const { wb } = useParams<{ wb: string }>();
  const basePath = `/wb/${wb}/mesh/ops`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Infrastructure Ops
        </h2>
        <p className="text-sm text-muted-foreground">
          Monitor and manage platform infrastructure services.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {OPS_SECTIONS.map((section) => (
          <Link key={section.href} href={`${basePath}${section.href}`}>
            <Card className="group h-full transition-all hover:shadow-md hover:border-foreground/20">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="rounded-lg bg-muted p-2.5 transition-colors group-hover:bg-primary/10">
                    <section.icon className="size-5 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Planned
                  </Badge>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{section.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {section.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
