// app/head.tsx
export default function Head() {
    return (
        <>
            {/* substitua pelos arquivos/tamanhos que você gerou */}
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
            {/* ...adicione todas as linhas para cada resolução */}
        </>
    );
}
