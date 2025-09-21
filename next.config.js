/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // keep your API keys exactly as you had them
  env: {
    POLYGON_API_KEY: process.env.POLYGON_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },

  // tiny safeguard so webpack never tries to resolve native codecs
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
