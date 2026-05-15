/** @type {import('next').NextConfig} */
const nextConfig = {};

// Enable Cloudflare bindings (D1, Vectorize, AI) in local dev mode.
// In production, bindings are provided by the Cloudflare Pages runtime.
if (process.env.NODE_ENV === "development") {
  const { setupDevPlatform } =
    require("@cloudflare/next-on-pages/next-dev");
  setupDevPlatform();
}

module.exports = nextConfig;
