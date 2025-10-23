// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [64, 96, 128, 160, 180, 196, 256],
    remotePatterns: [
      // S3 já utilizado
      {
        protocol: "https",
        hostname: "rp-master3-prod.s3.us-east-1.amazonaws.com",
      },
      // Domínio principal (uploads/public do PHP)
      {
        protocol: "https",
        hostname: "planoassistencialintegrado.com.br",
        pathname: "/images/**",
      },
      // (Opcional) subdomínio club
      {
        protocol: "https",
        hostname: "club.planoassistencialintegrado.com.br",
        pathname: "/**",
      },
      // Unsplash (prévias)
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy:
      "default-src 'self'; img-src * blob: data:; media-src 'none'; script-src 'none'; sandbox;",
  },

  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/i,
      oneOf: [
        {
          issuer: /\.[jt]sx?$/,
          use: [{ loader: "@svgr/webpack", options: { svgo: true } }],
        },
        { type: "asset" },
      ],
    });
    return config;
  },
};

export default nextConfig;
