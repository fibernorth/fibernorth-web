import { initializeAdminApp } from "@/services/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { isAdminIdentity } from "@/lib/admin-allowlist";
import { NextResponse } from "next/server";

interface AuthResult {
  authorized: boolean;
  uid?: string;
  response?: NextResponse;
}

export async function verifyApiAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const adminApp = initializeAdminApp();
    const decoded = await getAuth(adminApp).verifyIdToken(token);
    if (!isAdminIdentity(decoded.uid, decoded.email)) {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { authorized: true, uid: decoded.uid };
  } catch {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    };
  }
}
