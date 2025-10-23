import Link from "next/link";

export const metadata = {
    title: "Em desenvolvimento",
};

export default function EmDesenvolvimentoPage() {
    return (
        <main className="min-h-[70vh] grid place-items-center px-4">
            <div className="text-center">
                <div className="mb-4 inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-gray-300 border-t-emerald-600" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Em desenvolvimento
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-300">
                    Por favor, aguarde. Estamos trabalhando nesta página. 🙏
                </p>

                <div className="mt-6">
                    <Link
                        href="/"
                        className="inline-block rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        Voltar ao início
                    </Link>
                </div>
            </div>
        </main>
    );
}