import { initializeAdminApp } from "@/services/firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { isAdminIdentity, isOwnerIdentity, OWNER_ONLY_MESSAGE } from "@/lib/admin-allowlist";
import { NextResponse } from "next/server";
import { roleOf, SALES_DENIED_MESSAGE, type AdminRole } from "@/lib/roles";

interface AuthResult {
  authorized: boolean;
  uid?: string;
  email?: string;
  /** A built-in owner account (src/lib/admin-allowlist.ts). */
  owner?: boolean;
  /** owner, staff or sales (the role custom claim). */
  role?: AdminRole;
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
    // checkRevoked: a removed admin's tokens stop working at once.
    const decoded = await getAuth(adminApp).verifyIdToken(token, true);
    if (!isAdminIdentity(decoded.uid, decoded.email, decoded)) {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    const owner = isOwnerIdentity(decoded.uid, decoded.email, decoded);
    return {
      authorized: true,
      uid: decoded.uid,
      email: decoded.email,
      owner,
      role: roleOf(owner, decoded),
    };
  } catch {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    };
  }
}

/** verifyApiAuth, then owner-only (403 for staff). */
export async function verifyApiOwner(request: Request): Promise<AuthResult> {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth;
  if (!auth.owner) {
    return {
      authorized: false,
      response: NextResponse.json({ error: OWNER_ONLY_MESSAGE }, { status: 403 }),
    };
  }
  return auth;
}

/** verifyApiAuth, then not a sales account (403 for sales). */
export async function verifyApiNotSales(request: Request): Promise<AuthResult> {
  const auth = await verifyApiAuth(request);
  if (!auth.authorized) return auth;
  if (auth.role === "sales") {
    return {
      authorized: false,
      response: NextResponse.json({ error: SALES_DENIED_MESSAGE }, { status: 403 }),
    };
  }
  return auth;
}
