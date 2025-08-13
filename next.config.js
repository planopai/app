const withPWA = require("next-pwa")({
  dest: "public",
  register: false,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    { urlPattern: ({ url }) => url.pathname.startsWith("/push/"), handler: "NetworkOnly" },
  ],
});
module.exports = withPWA({});
