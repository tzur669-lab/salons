const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https" as const, hostname: "firebasestorage.googleapis.com" },
      { protocol: "https" as const, hostname: "lh3.googleusercontent.com" },
    ],
  },
  // iOS standalone PWA fix: reverse-proxy Firebase Auth's redirect handler through
  // our own origin so signInWithRedirect stays same-origin (ITP-safe). Paired with
  // the authDomain override in src/lib/firebase.ts.
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: "https://salons-19a2e.firebaseapp.com/__/auth/:path*",
      },
      {
        source: "/__/firebase/:path*",
        destination: "https://salons-19a2e.firebaseapp.com/__/firebase/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevents our page from being embedded in external iframes.
          // Safe in Capacitor remote URL mode: the native WebView is not an iframe.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Modern CSP equivalent — allows Firebase Auth's redirect handler domain
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://*.firebaseapp.com" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
