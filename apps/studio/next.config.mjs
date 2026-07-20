/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Keep the dev-tools launcher from covering the sidebar status note
  // during demos and UI screenshots; production builds are unaffected.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/apps/:appId/compare",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-src http://127.0.0.1:3000 http://127.0.0.1:3002 http://localhost:3000 http://localhost:3002; object-src 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
