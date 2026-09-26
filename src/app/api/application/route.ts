import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { sendApplicationNotificationEmail, sendSubmissionConfirmation } from "@/services/notifications";
import { recordNotice } from "@/services/notice-delivery";
import { honeypotTripped } from "@/lib/honeypot";
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
    // A bot filled the hidden field: say thanks and drop it.
    if (honeypotTripped(raw)) return NextResponse.json({ success: true });
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

    const ref = await db.collection("jobApplications").add({
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

    // Awaited: on serverless, work left running after the response can be
    // dropped. Checked and retried; the result is kept on the application
    // (notifiedOk, notifyError) and in notices/, and a failure shows on the
    // dashboard.
    const failed = (err: unknown) => ({ ok: false as const, attempts: 0, error: String(err) });
    const [office, confirmation] = await Promise.all([
      sendApplicationNotificationEmail({
        name,
        phone,
        email,
        positionsInterested: positionsInterested || [],
        idempotencyKey: `application-${ref.id}`,
      }).catch(failed),
      sendSubmissionConfirmation({ kind: "application", to: email, name, idempotencyKey: `application-confirm-${ref.id}` }).catch(
        failed
      ),
    ]);
    const officeResult = await recordNotice({
      id: `application-${ref.id}`,
      kind: "application",
      summary: `Job application from ${name}`,
      application: ref.id,
      email: office,
    });
    const confirmed = await recordNotice({
      id: `application-${ref.id}-confirmation`,
      kind: "application-confirmation",
      summary: `"We got your application" email to ${email}`,
      application: ref.id,
      email: confirmation,
    });
    await ref
      .update({ notifiedOk: officeResult.ok, notifyError: officeResult.error, confirmationOk: confirmed.ok })
      .catch((err: unknown) => console.error("Saving the notice result failed:", err));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Application submission error:", error);
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
  }
}
