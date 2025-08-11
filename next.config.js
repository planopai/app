// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',                 // gera sw.js em /public
  register: true,                 // registra SW automaticamente
  skipWaiting: false,             // vamos controlar via botão
  disable: process.env.NODE_ENV === 'development',
  fallbacks: {
    document: '/offline',         // fallback de navegação offline
    image: '/icons/icon-192.png', // imagem fallback
    font: '/fonts/nunito-regular.woff2'
  },
  runtimeCaching: [
    // Navegações de página
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
    // APIs do seu proxy (/api/php/**)
    {
      urlPattern: /^https?:\/\/[^/]+\/api\/php\/.*$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 6,
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    // imagens
    {
      urlPattern: ({ request }) => request.destination === 'image',
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'images-cache',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 14 },
      },
    },
    // fontes externas (Google)
    {
      urlPattern: /^https:\/\/fonts\.(gstatic|googleapis)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'fonts-cache',
        expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
    // estáticos gerados pelo Next
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/_next/static/'),
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
  ],
});

module.exports = withPWA({
  reactStrictMode: true,
});
