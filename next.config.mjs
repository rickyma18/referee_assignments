/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**", // ✅ permite cualquier dominio HTTPS
        pathname: "/**",
      },
    ],
  },

  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/assignments",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
