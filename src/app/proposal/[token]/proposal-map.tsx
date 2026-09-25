"use client";

import { QuoteMapViewer } from "@/components/admin/quote-map-viewer";

export function ProposalMap({ annotation }: { annotation: unknown }) {
  return <QuoteMapViewer annotation={annotation} defaultOpen title="Where we'll drill" />;
}
