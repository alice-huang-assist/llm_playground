import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN access to Next.js HMR/dev resources (e.g. http://192.168.x.x:3000)
  allowedDevOrigins: ["192.168.101.10"],
  turbopack: {
    // Lockfiles above this directory otherwise win root inference, which breaks
    // client/server chunking for node built-ins.
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
