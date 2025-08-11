// app/head.tsx
export default function Head() {
    return (
        <>
            {/* exemplos — substitua pelos nomes/medias que o gerador imprimiu */}
            <link
                rel="apple-touch-startup-image"
                href="/splash/apple-splash-1170-2532.png"
                media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
            />
            <link
                rel="apple-touch-startup-image"
                href="/splash/apple-splash-1290-2796.png"
                media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
            />
            {/* ...cole aqui TODAS as linhas que o pwa-asset-generator gerou */}
        </>
    );
}
