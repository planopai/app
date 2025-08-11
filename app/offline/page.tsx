export const dynamic = 'force-static';

export default function OfflinePage() {
    return (
        <main className="mx-auto max-w-lg p-6 text-center">
            <h1 className="text-2xl font-extrabold">Você está offline</h1>
            <p className="mt-2 text-sm opacity-80">
                Sem conexão no momento. Assim que a internet voltar, o app sincroniza novamente.
            </p>
        </main>
    );
}
