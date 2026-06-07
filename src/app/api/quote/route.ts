import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { sendQuoteNotificationEmail, sendQuoteSMS } from "@/services/notifications";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { name, phone, email, address, serviceType, description, urgency, mapAnnotation, howHeard } = body;

    if (!name || !phone || !email || !address) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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
