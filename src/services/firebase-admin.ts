import { initializeApp, getApps, cert, type App } from "firebase-admin/app";

let adminApp: App;

export function initializeAdminApp(): App {
  if (adminApp) return adminApp;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
    return adminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    adminApp = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  } else {
    // On App Hosting/Cloud Run, Application Default Credentials supply the
    // project. In local dev without FIREBASE_* env vars or ADC, Admin SDK
    // calls fail with a cryptic "Unable to detect a Project Id" — surface a
    // clearer hint once at startup.
    if (!process.env.GOOGLE_CLOUD_PROJECT && !process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_CONFIG) {
      console.warn(
        "firebase-admin: no FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY env vars and no ADC detected — server-side reads/writes will fail. Set the FIREBASE_* vars in .env.local for local development."
      );
    }
    adminApp = initializeApp();
  }

  return adminApp;
}
