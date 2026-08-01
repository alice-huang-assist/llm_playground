import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN access to Next.js HMR/dev resources (e.g. http://192.168.x.x:3000)
  allowedDevOrigins: ["192.168.101.10"],
};

export default nextConfig;
