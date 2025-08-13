// next.config.js
const withPWA = require("next-pwa")({
  dest: "public",
  register: false,            // você registra seu PWA manualmente (evita atritos)
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",

  // Garanta que o PWA não “segure” nem cacheie nada do /push/
  runtimeCaching: [
    {
      // Não interceptar nada do escopo de push (OneSignal)
      urlPattern: ({ url }) => url.pathname.startsWith("/push/"),
      handler: "NetworkOnly",
      method: "GET",
    },
    // ... suas outras regras de cache (se quiser) ...
  ],
});

const nextConfig = {
  // Reescreve as URLs “oficiais” do OneSignal para o seu proxy em /_osw
  async rewrites() {
    return [
      { source: "/push/OneSignalSDKWorker.js", destination: "/_osw" },
      { source: "/push/OneSignalSDK.sw.js", destination: "/_osw" },
    ];
  },

  // (Opcional) Se você servir arquivos estáticos em /public/push em vez do proxy /_osw,
  // pode forçar o header abaixo. Com o proxy, o header já é enviado no route.ts.
  async headers() {
    return [
      {
        source: "/push/:path*",
        headers: [
          // permite o escopo /push/ caso você sirva estático
          { key: "Service-Worker-Allowed", value: "/push/" },
          // se usar CSP, você pode colocar aqui também (ajuste à sua política)
          // { key: "Content-Security-Policy", value: "worker-src 'self' https://cdn.onesignal.com; script-src 'self' https://cdn.onesignal.com 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://cdn.onesignal.com; ..." }
        ],
      },
    ];
  },

  // Não travar build por lint/TS (opcional)
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

module.exports = withPWA(nextConfig);
