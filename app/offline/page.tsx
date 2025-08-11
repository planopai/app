// app/offline/page.tsx
export const metadata = { title: "Offline" };

export default function OfflinePage() {
    return (
        <main className="min-h-dvh grid place-items-center p-6 text-center">
            <div className="max-w-md space-y-3">
                <h1 className="text-2xl font-semibold">Você está offline</h1>
                <p className="text-muted-foreground">
                    Não foi possível carregar esta página sem conexão. Tente novamente quando estiver online.
                </p>
            </div>
        </main>
    );
}
