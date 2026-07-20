/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Keep the dev-tools launcher from covering the sidebar status note
  // during demos and UI screenshots; production builds are unaffected.
  devIndicators: false,
};

export default nextConfig;
