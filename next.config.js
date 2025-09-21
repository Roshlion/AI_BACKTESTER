/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Safeguard so webpack never tries to resolve native codecs
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
