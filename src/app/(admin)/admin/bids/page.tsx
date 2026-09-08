"use client";

import { CrudPage } from "@/components/admin/crud-page";
import { Gavel, ExternalLink } from "lucide-react";
import { orderBy } from "firebase/firestore";

interface Bid {
  id: string;
  title: string;
  agency: string;
  county: string;
  role: string;
  source: string;
  docsUrl: string;
  dueDate: string;
  status: string;
  amount: string;
  notes: string;
  createdAt?: string;
}

const STATUS_STYLES: Record<string, string> = {
  tracking: "bg-muted text-muted-foreground",
  bidding: "bg-secondary/15 text-secondary",
  submitted: "bg-primary/15 text-primary",
  won: "bg-accent/15 text-accent",
  lost: "bg-destructive/10 text-destructive",
  "no-bid": "bg-muted text-muted-foreground line-through",
};

const OPEN_STATUSES = ["tracking", "bidding", "submitted"];

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const due = new Date(`${dateStr}T23:59:59`);
  if (isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - Date.now()) / 86400000);
}

function DueCell({ bid }: { bid: Bid }) {
  const days = daysUntil(bid.dueDate);
  if (days === null) return <span className="text-muted-foreground">—</span>;
  const closed = !OPEN_STATUSES.includes(bid.status);
  const cls = closed
    ? "text-muted-foreground"
    : days < 0
      ? "text-muted-foreground"
      : days <= 5
        ? "text-destructive font-semibold"
        : days <= 10
          ? "text-secondary font-medium"
          : "";
  const suffix = closed
    ? ""
    : days < 0
      ? " (past)"
      : days === 0
        ? " (TODAY)"
        : days <= 10
          ? ` (${days}d)`
          : "";
  return (
    <span className={cls}>
      {bid.dueDate}
      {suffix}
    </span>
  );
}

const columns = [
  {
    key: "title" as const,
    label: "Bid",
    render: (item: Bid) => (
      <div>
        <span className="font-medium">{item.title}</span>
        <span className="block text-xs text-muted-foreground">
          {item.agency}
          {item.role ? ` · ${item.role}` : ""}
        </span>
      </div>
    ),
  },
  { key: "county" as const, label: "County" },
  {
    key: "dueDate" as const,
    label: "Due",
    render: (item: Bid) => <DueCell bid={item} />,
  },
  {
    key: "status" as const,
    label: "Status",
    render: (item: Bid) => (
      <span
        className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[item.status] ?? "bg-muted text-muted-foreground"}`}
      >
        {item.status}
      </span>
    ),
  },
  { key: "amount" as const, label: "Our Number" },
  {
    key: "docsUrl" as const,
    label: "Docs",
    render: (item: Bid) =>
      item.docsUrl ? (
        <a
          href={item.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
        >
          Open <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

const defaultValues = {
  title: "",
  agency: "",
  county: "",
  role: "prime",
  source: "",
  docsUrl: "",
  dueDate: "",
  status: "tracking",
  amount: "",
  notes: "",
};

const inputCls =
  "w-full px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary";

export default function AdminBidsPage() {
  return (
    <CrudPage<Bid>
      title="Bid Board"
      itemLabel="Bid"
      collection="bids"
      columns={columns}
      icon={<Gavel className="h-6 w-6 text-primary" />}
      defaultValues={defaultValues}
      constraints={[orderBy("dueDate", "asc")]}
      renderForm={(_, onChange, formData) => (
        <>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Project / Bid Title *</label>
              <input
                value={(formData.title as string) || ""}
                onChange={(e) => onChange("title", e.target.value)}
                className={inputCls}
                placeholder="Elk Rapids water main replacement"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Owner / Agency / Prime</label>
              <input
                value={(formData.agency as string) || ""}
                onChange={(e) => onChange("agency", e.target.value)}
                className={inputCls}
                placeholder="Village of Elk Rapids, GLE Truestream, Team Elmer's..."
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">County</label>
              <input
                value={(formData.county as string) || ""}
                onChange={(e) => onChange("county", e.target.value)}
                className={inputCls}
                placeholder="Antrim"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Our Role</label>
              <select
                value={(formData.role as string) || "prime"}
                onChange={(e) => onChange("role", e.target.value)}
                className={inputCls}
              >
                <option value="prime">Prime — we bid the owner</option>
                <option value="sub">Sub — drilling for a prime</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Bid Due Date</label>
              <input
                type="date"
                value={(formData.dueDate as string) || ""}
                onChange={(e) => onChange("dueDate", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Where It Was Posted</label>
              <input
                value={(formData.source as string) || ""}
                onChange={(e) => onChange("source", e.target.value)}
                className={inputCls}
                placeholder="BidNet, Builders Exchange, phone call from prime..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Link to Bid Docs</label>
              <input
                value={(formData.docsUrl as string) || ""}
                onChange={(e) => onChange("docsUrl", e.target.value)}
                className={inputCls}
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select
                value={(formData.status as string) || "tracking"}
                onChange={(e) => onChange("status", e.target.value)}
                className={inputCls}
              >
                <option value="tracking">Tracking — watching it</option>
                <option value="bidding">Bidding — working the number</option>
                <option value="submitted">Submitted — waiting to hear</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="no-bid">No-bid — passed on it</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Our Number</label>
              <input
                value={(formData.amount as string) || ""}
                onChange={(e) => onChange("amount", e.target.value)}
                className={inputCls}
                placeholder="$18,500"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              value={(formData.notes as string) || ""}
              onChange={(e) => onChange("notes", e.target.value)}
              rows={4}
              className={`${inputCls} resize-none`}
              placeholder="Prebid meeting, engineer contact, why we won or lost, addendums..."
            />
          </div>
        </>
      )}
    />
  );
}
