// What Bore-ON sends us. Mirrors docs/DESIGN-IMPORT-API.md in the Bore-ON
// repo ("Reading the design back" and "Callbacks"). Fields we never read are
// left out on purpose; extra keys are ignored.

export type BoreOnStatus = "draft" | "in-review" | "approved" | "transferred" | "archived";

export type BoreOnEvent = "design.designed" | "design.approved" | "design.updated";

export interface BoreOnLatLng {
  lat: number;
  lng: number;
}

export interface BoreOnLine {
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
}

/** `result` on GET /api/v1/designs/{id}. */
export interface BoreOnReadbackResult {
  boreLengthFt: number;
  totalPlannedFt: number;
  pits: { entry: BoreOnLatLng | null; exit: BoreOnLatLng | null; depthFt: number | null };
  depthProfile: {
    distFt: number[];
    elevFt: number[];
    boreDepthFt: Array<number | null>;
    minCoverFt: number | null;
    shallowestCoverFt: number | null;
    source: "quote";
  } | null;
  rodCount: number | null;
  /** Bore-ON does not estimate drill time; always null. */
  estimatedDrillTime: null;
  estimate: {
    lines: BoreOnLine[];
    materialLines: BoreOnLine[];
    materialTax: number;
    subtotal: number;
    marginAmount: number;
    contingencyAmount: number;
    grandTotal: number;
    uncovered: Array<{ label: string; quantity: number; unit: string }>;
  } | null;
  planImageUrl: string | null;
}

export interface BoreOnReadback {
  designId: string;
  url: string;
  status: BoreOnStatus;
  externalRef: string | null;
  updatedAt: string | null;
  result: BoreOnReadbackResult;
}

/** The body of a signed callback POST from Bore-ON. */
export interface BoreOnWebhookPayload {
  event: BoreOnEvent;
  deliveryId: string;
  designId: string;
  externalRef: string;
  /** Their mapping of ours: designed | approved. */
  status: string;
  boreOnStatus: BoreOnStatus;
  url: string;
  apiUrl: string;
  updatedAt: string;
}

/** The Bore-ON error envelope; a 422 also carries `errors[]` and `warnings[]`. */
export interface BoreOnError {
  error: { code: string; message: string };
  errors?: Array<{ code: string; message: string }>;
  warnings?: Array<{ code: string; message: string }>;
}

export const EXTERNAL_REF_PREFIX = "fibernorth:quote:";

export const externalRefFor = (quoteId: string) => `${EXTERNAL_REF_PREFIX}${quoteId}`;

/** The quote id inside one of our externalRefs, or null for anybody else's. */
export function quoteIdFromExternalRef(ref: unknown): string | null {
  if (typeof ref !== "string" || !ref.startsWith(EXTERNAL_REF_PREFIX)) return null;
  const id = ref.slice(EXTERNAL_REF_PREFIX.length);
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}
