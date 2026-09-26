import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
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

// 10 submits per IP per 10 minutes, shared across instances.
async function rateLimited(ip: string): Promise<boolean> {
  const r = await rateLimit({ bucket: "application-submit", key: ip, limit: 10, windowMs: 10 * 60_000 });
  return r.limited;
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if (await rateLimited(ip)) {
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

    // Awaited: on serverless, work left running after the response can be dropped.
    await Promise.allSettled([
      sendApplicationNotificationEmail({ name, phone, email, positionsInterested: positionsInterested || [] }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Application submission error:", error);
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
  }
}
