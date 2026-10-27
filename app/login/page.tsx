"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconArrowRight, IconEye, IconEyeOff, IconLock, IconShieldCheck, IconUser } from "@tabler/icons-react";
import { usePerms } from "../_perms/PermsProvider"; // <<< importe o Provider

// Recuperação de senha: endpoint ainda a definir (deixado em aberto de propósito).
// Quando existir, troque o corpo de onEsqueciSenha() pela chamada.
const ENDPOINT_RECUPERAR_SENHA: string | null = null;

const VERSAO_APP = "2.0";

export default function LoginPage() {
    const router = useRouter();
    const search = useSearchParams();
    const next = search.get("next") || "/";

    const { reload } = usePerms(); // <<< vamos recarregar permissões antes de sair do login

    const [usuario, setUsuario] = React.useState("");
    const [senha, setSenha] = React.useState("");
    const [remember, setRemember] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [mostrarSenha, setMostrarSenha] = React.useState(false);

    // Preenche somente o usuário lembrado.
    // Senhas salvas por versões antigas são removidas do navegador.
    React.useEffect(() => {
        const u = localStorage.getItem("usuario") || "";

        setUsuario(u);
        setRemember(Boolean(u));

        localStorage.removeItem("senha");
    }, []);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!usuario || !senha) {
            setError("Preencha usuário e senha.");
            return;
        }
        setLoading(true);
        try {
            // 1) Autentica no backend (deve SETAR cookies: pai_auth=1, pai_uid, etc.)
            const r = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({ usuario, senha }),
            });

            const data = await r.json().catch(() => ({}));
            if (!r.ok || !data?.sucesso) {
                throw new Error(data?.msg || data?.error || "Dados incorretos. Tente novamente.");
            }

            // 2) Lembrar somente o usuário.
            // A senha nunca é persistida no localStorage.
            if (remember) {
                localStorage.setItem("usuario", usuario);
            } else {
                localStorage.removeItem("usuario");
            }

            // Limpeza defensiva para instalações que usaram versões antigas.
            localStorage.removeItem("senha");

            // 3) (opcional, ajuda a garantir que cookie já esteja válido no backend)
            await fetch("/api/php/pai_api.php?action=whoami", { cache: "no-store" }).catch(() => { });

            // 4) Recarrega permissões AINDA NA TELA DE LOGIN
            //    Assim, ao navegar, a Home já renderiza com os cards corretos imediatamente.
            await reload();

            // 5) Navega client-side já com permissões em memória:
            router.replace(next);

            // --- Alternativa “bala de prata” (se preferir hard reload) ---
            // window.location.replace(next);
        } catch (err: any) {
            setError(err?.message || "Erro de comunicação com o servidor.");
            setLoading(false);
            return;
        } finally {
            // Se usou router.replace, pode manter o loading true até a troca de rota.
            // Se usar window.location.replace, esse finally nem chega a aparecer.
        }
    }

    function onEsqueciSenha() {
        if (!ENDPOINT_RECUPERAR_SENHA) {
            setError("Recuperação de senha ainda não disponível. Fale com a Gestão.");
            return;
        }
        // TODO: chamar ENDPOINT_RECUPERAR_SENHA
    }

    const campo =
        "h-[52px] w-full rounded-xl border-[1.5px] border-[#D5DAE3] bg-[#F6F8FB] text-[16px] text-[#313C55] placeholder:text-[#8A93A6] outline-none transition focus:border-[#313C55] focus:bg-[#FFFFFF] focus:ring-4 focus:ring-[#313C55]/10";

    return (
        <main className="flex min-h-[100dvh] flex-col bg-[#313C55] font-[var(--font-nunito)] text-[#313C55] lg:flex-row lg:bg-[#FFFFFF]">
            {/* Marca */}
            <section className="relative flex flex-1 flex-col overflow-hidden bg-[#313C55] px-5 pb-8 pt-6 text-white lg:min-h-[100dvh] lg:basis-[560px] lg:px-16 lg:py-14">
                <img
                    src="/pai-icone-linha.svg"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute right-[-90px] top-[120px] w-[340px] opacity-[0.09] lg:bottom-[-200px] lg:right-[-220px] lg:top-auto lg:w-[820px] lg:opacity-[0.06]"
                />
                <div aria-hidden="true" className="absolute right-[-40px] top-14 h-14 w-[130px] rounded-l-[28px] bg-[#B3CE52] lg:right-[-140px] lg:top-24 lg:h-[150px] lg:w-[360px] lg:rounded-l-[75px]" />
                <div aria-hidden="true" className="absolute right-[-32px] top-16 h-14 w-[130px] rounded-l-[28px] border-[1.5px] border-white/55 lg:right-[-124px] lg:top-[112px] lg:h-[150px] lg:w-[360px] lg:rounded-l-[75px]" />
                <div aria-hidden="true" className="absolute right-[104px] top-[42px] h-7 w-7 rounded-full bg-[#F2CB3F] lg:right-[270px] lg:top-5 lg:h-16 lg:w-16" />
                <div aria-hidden="true" className="absolute bottom-[-260px] left-[-180px] hidden h-[520px] w-[520px] rounded-full bg-[#00AEEC] opacity-[0.18] lg:block" />

                <img src="/logo-pai-login.svg" alt="PAI" className="relative w-[140px] lg:w-[170px]" />

                <div className="relative flex max-w-[520px] flex-1 flex-col justify-center gap-3 py-6 lg:gap-5 lg:py-12">
                    <span className="text-[11px] font-extrabold tracking-[0.32em] text-[#B3CE52] lg:text-[13px]">SISTEMA OPERACIONAL</span>
                    <h1 className="m-0 text-[56px] font-black leading-[0.95] tracking-[-0.02em] text-white lg:text-[72px]">
                        PAI
                        <br />
                        <span className="text-[#F2CB3F]">Conecta</span>
                    </h1>
                    <span className="text-[11px] font-bold tracking-[0.36em] text-white lg:text-[13px] lg:tracking-[0.4em]">COM VOCÊ TODOS OS DIAS</span>
                </div>
            </section>

            {/* Acesso */}
            <section className="relative flex flex-col items-center rounded-t-[28px] bg-[#FFFFFF] px-6 pb-5 pt-7 lg:flex-1 lg:basis-[480px] lg:justify-center lg:rounded-none lg:px-8 lg:py-14">
                <form onSubmit={onSubmit} autoComplete="off" className="flex w-full max-w-[400px] flex-col gap-[18px] lg:gap-6">
                    <div className="flex flex-col gap-2">
                        <h2 className="m-0 text-[26px] font-extrabold text-[#313C55] lg:hidden">Entrar</h2>
                        <h2 className="m-0 hidden text-[34px] font-extrabold text-[#313C55] lg:block">Bem-vindo de volta</h2>
                        <p className="m-0 hidden text-[16px] text-[#5A6478] lg:block">Entre com seu usuário da equipe.</p>
                    </div>

                    <div className="flex flex-col gap-1.5 lg:gap-2">
                        <label htmlFor="login-usuario" className="text-[14px] font-bold text-[#313C55]">Usuário</label>
                        <div className="relative">
                            <IconUser aria-hidden="true" size={20} stroke={2} className="pointer-events-none absolute left-4 top-4 hidden text-[#5A6478] lg:block" />
                            <input
                                id="login-usuario"
                                type="text"
                                name="usuario"
                                placeholder="Usuário"
                                value={usuario}
                                onChange={(e) => setUsuario(e.target.value)}
                                required
                                autoComplete="username"
                                className={`${campo} px-4 lg:pl-12`}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5 lg:gap-2">
                        <label htmlFor="login-senha" className="text-[14px] font-bold text-[#313C55]">Senha</label>
                        <div className="relative">
                            <IconLock aria-hidden="true" size={20} stroke={2} className="pointer-events-none absolute left-4 top-4 hidden text-[#5A6478] lg:block" />
                            <input
                                id="login-senha"
                                type={mostrarSenha ? "text" : "password"}
                                name="senha"
                                placeholder="Digite sua senha"
                                value={senha}
                                onChange={(e) => setSenha(e.target.value)}
                                required
                                autoComplete="current-password"
                                className={`${campo} pl-4 pr-14 lg:pl-12`}
                            />
                            <button
                                type="button"
                                onClick={() => setMostrarSenha((v) => !v)}
                                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                                className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-[#5A6478] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#3D6A99]"
                            >
                                {mostrarSenha ? <IconEyeOff size={20} stroke={2} /> : <IconEye size={20} stroke={2} />}
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 lg:gap-3">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={remember}
                            onClick={() => setRemember((v) => !v)}
                            className="inline-flex min-h-[44px] items-center gap-2.5 text-[15px] font-semibold text-[#313C55] lg:gap-3"
                        >
                            <span className={`relative inline-block h-[26px] w-11 rounded-full transition-colors ${remember ? "bg-[#7FA02A]" : "bg-[#C3C9D4]"}`}>
                                <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-[#FFFFFF] shadow transition-all ${remember ? "left-[21px]" : "left-[3px]"}`} />
                            </span>
                            <span className="lg:hidden">Lembrar</span>
                            <span className="hidden lg:inline">Lembrar usuário</span>
                        </button>
                        <button type="button" onClick={onEsqueciSenha} className="min-h-[44px] text-[15px] font-bold text-[#313C55] hover:text-[#232B40]">
                            <span className="lg:hidden">Esqueci a senha</span>
                            <span className="hidden lg:inline">Esqueci minha senha</span>
                        </button>
                    </div>

                    {error && (
                        <div role="alert" className="rounded-xl border border-[#F3C3BE] bg-[#FDECEA] px-4 py-3 text-[14px] font-semibold text-[#B42318]">
                            {error}
                        </div>
                    )}

                    <button
                        id="btnEntrar"
                        type="submit"
                        disabled={loading}
                        className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-[14px] bg-[#313C55] text-[17px] font-extrabold text-white transition-colors hover:bg-[#232B40] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {loading ? "Entrando..." : "Entrar"}
                        <IconArrowRight aria-hidden="true" size={20} stroke={2.5} className="text-[#F2CB3F]" />
                    </button>

                    <div className="hidden items-center gap-3 rounded-xl bg-[#F6F8FB] px-4 py-3.5 lg:flex">
                        <IconShieldCheck aria-hidden="true" size={20} stroke={2} className="shrink-0 text-[#313C55]" />
                        <span className="text-[14px] text-[#5A6478]">
                            Acesso restrito à equipe PAI. Problemas para entrar? <strong className="font-bold text-[#313C55]">Fale com a Gestão</strong>
                        </span>
                    </div>

                    <span className="text-center text-[13px] text-[#5A6478] lg:hidden">PAI Conecta · versão {VERSAO_APP}</span>
                </form>

                <footer className="mt-12 hidden flex-wrap justify-center gap-4 text-[13px] text-[#5A6478] lg:flex">
                    <span className="font-bold">PAI Conecta · versão {VERSAO_APP}</span>
                    <span>© {new Date().getFullYear()} Plano Assistencial Integrado · Barreiras/BA</span>
                </footer>
            </section>
        </main>
    );
}
