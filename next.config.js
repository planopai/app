const withPWA = require("next-pwa")({
  dest: "public",
  register: true, // ou false se você registrar manualmente
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/app-build-manifest\.json$/],
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/push/"),
      handler: "NetworkOnly",
      method: "GET",
    },
    // Adicione outras estratégias se quiser
  ],
});

module.exports = withPWA({
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
});
