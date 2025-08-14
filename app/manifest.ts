import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        id: "/",                       // ✅ fixa identidade do app
        name: "App Plano PAI 2.0",
        short_name: "Plano PAI",
        description: "Aplicação WEB Plano PAI 2.0",
        start_url: "/",                // ✅ mantenha igual ao id (e com mesma barra)
        scope: "/",                    // ✅ combine com o SW scope "/"
        display: "standalone",
        display_override: ["standalone"],
        background_color: "#ffffff",
        theme_color: "#059de0",
        orientation: "portrait",
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
            { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" }, // ✅ iOS
        ],
    };
}
