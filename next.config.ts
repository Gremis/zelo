import type { NextConfig } from "next";

const evidenceInspectorFiles = [
  "./scripts/inspect-attachment.mjs",
  "./node_modules/file-type/**/*",
  "./node_modules/strtok3/**/*",
  "./node_modules/token-types/**/*",
  "./node_modules/@tokenizer/**/*",
  "./node_modules/@borewit/**/*",
  "./node_modules/debug/**/*",
  "./node_modules/ms/**/*",
  "./node_modules/uint8array-extras/**/*",
  "./node_modules/peek-readable/**/*",
  "./node_modules/ieee754/**/*",
  "./node_modules/sharp/**/*",
  "./node_modules/@img/**/*",
  "./node_modules/detect-libc/**/*",
  "./node_modules/semver/**/*",
  "./node_modules/mp4box/**/*",
  "./node_modules/pdf-lib/**/*",
  "./node_modules/@pdf-lib/**/*",
  "./node_modules/pako/**/*",
  "./node_modules/tslib/**/*",
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/occurrences/*/uploads/*": evidenceInspectorFiles,
    "/api/public/tasks/*/uploads/*": evidenceInspectorFiles,
    "/api/public/tasks/*/message-uploads/*": evidenceInspectorFiles,
    "/api/public/condominiums/*/upload-attempts/*/files/*/*":
      evidenceInspectorFiles,
  },
  async headers() {
    return [
      {
        source: "/t/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; script-src 'self'; connect-src 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/offline.html",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
