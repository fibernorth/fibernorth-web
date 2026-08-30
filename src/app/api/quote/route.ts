import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  sendQuoteNotificationEmail,
  sendQuoteSlack,
  sendQuoteSMS,
} from "@/services/notifications";
import { z } from "zod";

// Site plans / prints homeowners attach to a quote. Kept tight: common photo
// formats plus PDF, 10MB decoded.
const ALLOWED_ATTACHMENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

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
  attachment: z
    .object({
      name: z.string().trim().min(1).max(200),
      type: z.string().trim().max(100),
      dataBase64: z.string().max(14_500_000), // ~10MB decoded
    })
    .optional()
    .nullable(),
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

async function uploadAttachment(attachment: {
  name: string;
  type: string;
  dataBase64: string;
}): Promise<string> {
  const ext = ALLOWED_ATTACHMENT_TYPES[attachment.type];
  if (!ext) throw new Error("unsupported_type");

  const buffer = Buffer.from(attachment.dataBase64, "base64");
  if (buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error("bad_size");
  }

  const app = initializeAdminApp();
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const bucket = bucketName ? getStorage(app).bucket(bucketName) : getStorage(app).bucket();

  // A Firebase download token makes the file linkable from the notification
  // email/Slack without public bucket rules or IAM signing permissions.
  const token = randomUUID();
  const path = `quoteUploads/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  await bucket.file(path).save(buffer, {
    contentType: attachment.type,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    resumable: false,
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (rateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const raw = await request.json();
    const hasAttachment =
      raw && typeof raw === "object" && (raw as Record<string, unknown>).attachment;
    if (JSON.stringify(raw).length > (hasAttachment ? 15_000_000 : 100_000)) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }
    const parsed = quoteSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }
    const {
      name,
      phone,
      email,
      address,
      serviceType,
      description,
      urgency,
      mapAnnotation,
      howHeard,
      attachment,
    } = parsed.data;

    let attachmentUrl = "";
    if (attachment) {
      try {
        attachmentUrl = await uploadAttachment(attachment);
      } catch {
        return NextResponse.json(
          { error: "Attachment must be a JPG, PNG, WEBP, HEIC, or PDF under 10MB" },
          { status: 400 }
        );
      }
    }

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
      propertyPhotos: attachmentUrl ? [attachmentUrl] : [],
      howHeard: howHeard || "",
      status: "new",
      notes: "",
      createdAt: new Date().toISOString(),
    });

    // Send notifications (fire and forget — don't block the response)
    sendQuoteNotificationEmail({
      name,
      phone,
      email,
      address,
      serviceType,
      description,
      attachmentUrl,
    }).catch(() => {});
    sendQuoteSlack({
      name,
      phone,
      email,
      address,
      serviceType,
      description,
      urgency,
      attachmentUrl,
    }).catch(() => {});
    sendQuoteSMS({ name, phone, serviceType }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Quote submission error:", error);
    return NextResponse.json({ error: "Failed to submit quote" }, { status: 500 });
  }
}
