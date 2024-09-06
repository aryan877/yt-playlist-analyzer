/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("crawlee", "puppeteer", "playwright");
    }
    return config;
  },
};

export default nextConfig;
