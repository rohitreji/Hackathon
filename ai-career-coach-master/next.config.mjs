/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Avoid failing the build due to ESLint parser serialization issues on CI
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "randomuser.me",
      },
    ],
  },
};

export default nextConfig;
