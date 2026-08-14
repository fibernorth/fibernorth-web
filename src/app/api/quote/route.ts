import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { sendQuoteNotificationEmail, sendQuoteSMS } from "@/services/notifications";
import { z } from "zod";

const quoteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email().max(200),
  address: z.string().trim().min(1).max(400),
  serviceType: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().max(5000).optional().default(""),
  urgency: z.string().trim().max(50).optional().default("flexible"),
  mapAnnotation: z.unknown().optional().nullable(),
  howHeard: z.string().trim().max(200).optional().default(""),
});

// Basic per-instance flood protection for a public endpoint.
const recent = new Map<string, { count: number; windowStart: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = recent.get(ip);
  if (!entry || now - entry.windowStart > 10 * 60_000) {
    recent.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (rateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const raw = await request.json();
    if (JSON.stringify(raw).length > 100_000) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }
    const parsed = quoteSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }
    const { name, phone, email, address, serviceType, description, urgency, mapAnnotation, howHeard } = parsed.data;

    const adminApp = initializeAdminApp();
    const db = getFirestore(adminApp);

    await db.collection("quoteRequests").add({
      name,
      phone,
      email,
      address,
      serviceType: serviceType || "",
      description: description || "",
      urgency: urgency || "flexible",
      mapAnnotation: mapAnnotation || null,
      mapImageUrl: "",
      propertyPhotos: [],
      howHeard: howHeard || "",
      status: "new",
      notes: "",
      createdAt: new Date().toISOString(),
    });

    // Send notifications (fire and forget — don't block the response)
    sendQuoteNotificationEmail({ name, phone, email, address, serviceType, description }).catch(() => {});
    sendQuoteSMS({ name, phone, serviceType }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Quote submission error:", error);
    return NextResponse.json({ error: "Failed to submit quote" }, { status: 500 });
  }
}
