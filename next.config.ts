import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  outputFileTracingIncludes: {
    '/*': [
      './local-services/**/*',
      './prisma/schema.prisma',
      './prisma/migrations/**/*',
      './node_modules/.prisma/client/**/*',
      './node_modules/@prisma/client/**/*',
    ],
  },
  reactStrictMode: false,
};

export default nextConfig;
