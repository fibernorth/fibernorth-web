import { NextResponse } from "next/server";
import { initializeAdminApp } from "@/services/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { sendApplicationNotificationEmail } from "@/services/notifications";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { name, phone, email, positionsInterested, hasCDL, equipmentExperience, howHeard } = body;

    if (!name || !phone || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

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
