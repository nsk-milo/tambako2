import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // ✅ put it here
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
