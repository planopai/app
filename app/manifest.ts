// app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "App Plano PAI 2.0",
        short_name: "Plano PAI",
        description: "Aplicação WEB Plano PAI 2.0",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["standalone"], // força standalone quando possível
        background_color: "#ffffff",
        theme_color: "#059de0",
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }, // opcional, recomendado
        ],
    };
}
