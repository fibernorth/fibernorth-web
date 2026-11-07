"use client";

import Link from "next/link";
import { useMemo } from "react";
import { where } from "firebase/firestore";
import { Shovel } from "lucide-react";
import { useFirestoreCollection } from "@/hooks/use-firestore-collection";
import { missDigQueue } from "@/lib/missdig";
import type { QuoteRequest } from "@/lib/types";

// Dashboard card: accepted jobs still waiting on a MISS DIG ticket. Each one
// opens its ticket sheet (map, address, work) at /admin/missdig/<quote id>.

export function MissDigCard() {
  const constraints = useMemo(() => [where("missDigStatus", "==", "needed")], []);
  const { data, loading } = useFirestoreCollection<QuoteRequest>("quoteRequests", { constraints });
  const queue = useMemo(() => missDigQueue(data), [data]);
  if (loading || queue.length === 0) return null;
  return (
    <div className="bg-card border border-secondary/50 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <Shovel className="h-4 w-4 text-secondary" /> MISS DIG to enter ({queue.length})
        </h2>
        <Link href="/admin/missdig" className="text-xs text-primary hover:underline">
          Open the list
        </Link>
      </div>
      <ul className="space-y-1 text-sm">
        {queue.slice(0, 6).map((q) => (
          <li key={q.id} className="flex flex-wrap items-baseline gap-x-2">
            <Link href={`/admin/missdig/${q.id}`} className="text-primary hover:underline font-medium">
              {q.name || "Customer"}
            </Link>
            <span className="text-muted-foreground">{q.address || "no address"}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Accepted jobs. Each sheet has the map, address and work for the ticket.</p>
    </div>
  );
}
