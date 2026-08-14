import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { sendApplicationNotificationEmail } from "@/services/notifications";
import { z } from "zod";

const applicationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email().max(200),
  positionsInterested: z.array(z.string().trim().max(100)).max(20).optional().default([]),
  hasCDL: z.boolean().nullable().optional().default(null),
  equipmentExperience: z.string().trim().max(5000).optional().default(""),
  howHeard: z.string().trim().max(200).optional().default(""),
});

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
    if (JSON.stringify(raw).length > 50_000) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }
    const parsed = applicationSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }
    const { name, phone, email, positionsInterested, hasCDL, equipmentExperience, howHeard } = parsed.data;

    const adminApp = initializeAdminApp();
    const db = getFirestore(adminApp);

    await db.collection("jobApplications").add({
      name,
      phone,
      email,
      positionsInterested: positionsInterested || [],
      hasCDL: hasCDL ?? null,
      equipmentExperience: equipmentExperience || "",
      resumeUrl: "",
      howHeard: howHeard || "",
      status: "new",
      notes: "",
      createdAt: new Date().toISOString(),
    });

    sendApplicationNotificationEmail({ name, phone, email, positionsInterested: positionsInterested || [] }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Application submission error:", error);
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
  }
}
