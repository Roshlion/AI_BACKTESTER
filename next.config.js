/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },     // <= skip lint in CI builds
  typescript: { ignoreBuildErrors: false }, // keep type safety
  webpack: (config) => {
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      lzo: false,
      snappy: false,
      brotli: false,
    };
    return config;
  },
};

module.exports = nextConfig;
