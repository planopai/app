// next.config.js
const withPWA = require("next-pwa")({
  dest: "public",
  register: false,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",

  // Não deixe o SW do PWA interceptar o OneSignal e sua API PHP
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/push/"),
      handler: "NetworkOnly",
      method: "GET",
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/api/php/"),
      handler: "NetworkOnly",
      method: "GET",
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/api/php/"),
      handler: "NetworkOnly",
      method: "POST",
    },
  ],

  // 👇 exclui o arquivo problemático do precache
  buildExcludes: [/app-build-manifest\.json$/],
});

const nextConfig = {
  async rewrites() {
    return [
      { source: "/push/OneSignalSDKWorker.js", destination: "/_osw" },
      { source: "/push/OneSignalSDK.sw.js", destination: "/_osw" },
    ];
  },
};

module.exports = withPWA(nextConfig);
