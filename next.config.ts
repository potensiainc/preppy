import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/commute",
        destination: "/schoolmap",
        permanent: true,
      },
      {
        source: "/commute/index.html",
        destination: "/schoolmap",
        permanent: true,
      },
      {
        source: "/schoolmap/index.html",
        destination: "/schoolmap",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [{ source: "/schoolmap", destination: "/commute/index.html" }];
  },
};

export default nextConfig;
