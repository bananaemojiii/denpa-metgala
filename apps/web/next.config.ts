import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: { serverActions: { allowedOrigins: ["*"] } },
  // Allow Mux image domain for poster frames
  images: { domains: ["image.mux.com"] },
};

export default config;
