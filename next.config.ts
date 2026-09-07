import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/commute",
        destination: "/commute/index.html",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
