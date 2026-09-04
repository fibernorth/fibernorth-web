// Firebase App Hosting injects the web app's config as FIREBASE_WEBAPP_CONFIG
// at build time — use it to fill any NEXT_PUBLIC_FIREBASE_* vars that aren't
// set explicitly (e.g. via .env.local in local dev).
function firebaseEnvFallback() {
  let cfg = {};
  try {
    cfg = JSON.parse(process.env.FIREBASE_WEBAPP_CONFIG || "{}");
  } catch {
    cfg = {};
  }
  const mapping = {
    NEXT_PUBLIC_FIREBASE_API_KEY: cfg.apiKey,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: cfg.authDomain,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: cfg.projectId,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: cfg.storageBucket,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: cfg.messagingSenderId,
    NEXT_PUBLIC_FIREBASE_APP_ID: cfg.appId,
  };
  const env = {};
  for (const [key, fallback] of Object.entries(mapping)) {
    const value = process.env[key] ?? fallback;
    if (value) env[key] = value;
  }
  return env;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: firebaseEnvFallback(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=()" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/careers", destination: "/employment", permanent: true },
      { source: "/jobs", destination: "/employment", permanent: true },
      // Thin, orphaned page whose proof points live on /fiber-construction.
      { source: "/major-projects", destination: "/fiber-construction", permanent: true },
      // Print-only vanity URL for the campground letter campaign. Published
      // nowhere on the web, so any hit is someone typing it off paper —
      // the UTM tags make those sessions countable in GA4. Temporary (307)
      // so future campaigns can retag or repoint it.
      {
        source: "/camp",
        destination:
          "/campgrounds?utm_source=direct-mail&utm_medium=letter&utm_campaign=campground-fall-2026",
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
