"use client";

/**
 * Associados — janela "Criar / Atualizar acesso ao app" (27/10/2026).
 * Mesmas regras de antes (CPF com 11 dígitos, e-mail válido, telefone com DDD, senha de 6+),
 * agora com os erros embaixo de cada campo, senha gerada/mostrar/copiar e sem alert().
 */

import React, { useEffect, useMemo, useState } from "react";
import { IconCheck, IconCopy, IconEye, IconEyeOff, IconLock } from "@tabler/icons-react";
import { fmtCpf, isValidEmail, isValidTelefoneBR, onlyDigits } from "./logica";
import { BTN_PRI, BTN_SEC, CAMPO, Janela, ROTULO, SUAVE } from "./ui";

function gerarSenha() {
    const letras = "abcdefghjkmnpqrstuvwxyz";
    const numeros = "23456789";
    const r = (s: string) => s[Math.floor(((window.crypto?.getRandomValues?.(new Uint32Array(1))[0] ?? Math.random() * 1e9) as number) % s.length)];
    let out = "";
    for (let i = 0; i < 5; i++) out += r(letras);
    out = out.charAt(0).toUpperCase() + out.slice(1);
    for (let i = 0; i < 3; i++) out += r(numeros);
    return out;
}

function mascaraFone(v: string) {
    const d = onlyDigits(v).slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function JanelaAcesso({
    aberta,
    onFechar,
    nome,
    tipo,
    jaTemAcesso,
    cpfInicial,
    emailInicial,
    telefoneInicial,
    cpfEditavel,
    onSalvar,
}: {
    aberta: boolean;
    onFechar: () => void;
    nome: string;
    tipo: string;
    jaTemAcesso: boolean;
    cpfInicial: string;
    emailInicial?: string;
    telefoneInicial?: string;
    cpfEditavel: boolean;
    /** Devolve true quando salvou (a janela fecha). */
    onSalvar: (p: { cpf: string; senha: string; email: string; telefone: string }) => Promise<boolean>;
}) {
    const [cpf, setCpf] = useState(cpfInicial);
    const [email, setEmail] = useState(emailInicial || "");
    const [telefone, setTelefone] = useState(telefoneInicial || "");
    const [senha, setSenha] = useState("");
    const [ver, setVer] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [tentou, setTentou] = useState(false);
    const [copiado, setCopiado] = useState(false);

    useEffect(() => {
        if (!aberta) return;
        setCpf(cpfInicial);
        setEmail(emailInicial || "");
        setTelefone(mascaraFone(telefoneInicial || ""));
        setSenha(gerarSenha());
        setVer(true);
        setTentou(false);
    }, [aberta, cpfInicial, emailInicial, telefoneInicial]);

    const cpfOk = onlyDigits(cpf).length === 11;
    const emailOk = isValidEmail(email);
    const telOk = isValidTelefoneBR(telefone);
    const senhaOk = senha.trim().length >= 6;
    const tudoOk = cpfOk && emailOk && telOk && senhaOk;

    const salvar = async () => {
        setTentou(true);
        if (!tudoOk) return;
        setSalvando(true);
        try {
            const ok = await onSalvar({ cpf: onlyDigits(cpf), senha: senha.trim(), email: email.trim(), telefone: onlyDigits(telefone) });
            if (ok) onFechar();
        } finally {
            setSalvando(false);
        }
    };

    const erro = useMemo(
        () => ({
            cpf: tentou && !cpfOk ? "O CPF precisa ter 11 dígitos." : "",
            email: (tentou || email.trim()) && !emailOk ? "Informe um e-mail válido." : "",
            tel: (tentou || onlyDigits(telefone).length > 0) && !telOk ? "Informe o telefone com DDD (10 ou 11 números)." : "",
            senha: tentou && !senhaOk ? "A senha precisa ter pelo menos 6 caracteres." : "",
        }),
        [tentou, cpfOk, emailOk, telOk, senhaOk, email, telefone],
    );

    const msgErro = (t: string) => (t ? <span className="mt-1.5 block text-[13px] font-bold text-[#B42318] dark:text-[#FF9C92]">{t}</span> : null);

    return (
        <Janela
            aberta={aberta}
            onFechar={() => !salvando && onFechar()}
            z="z-[80]"
            titulo={jaTemAcesso ? "Atualizar acesso ao app" : "Criar acesso ao app"}
            subtitulo={`${tipo} · ${nome}`}
            topo={
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">
                    <IconLock size={20} />
                </span>
            }
            rodape={
                <>
                    <button type="button" onClick={onFechar} disabled={salvando} className={`${BTN_SEC} flex-1 lg:flex-none`}>
                        Cancelar
                    </button>
                    <button type="button" onClick={() => void salvar()} disabled={salvando} className={`${BTN_PRI} flex-1 lg:flex-none`}>
                        {salvando ? "Salvando…" : jaTemAcesso ? "Salvar acesso" : "Criar acesso"}
                    </button>
                </>
            }
        >
            <div className="space-y-4 px-5 py-4">
                <label className="block">
                    <span className={ROTULO}>CPF</span>
                    <input
                        className={`${CAMPO} tabular-nums`}
                        value={cpfEditavel ? cpf : fmtCpf(cpf)}
                        onChange={(e) => setCpf(e.target.value)}
                        inputMode="numeric"
                        disabled={!cpfEditavel}
                        autoComplete="off"
                    />
                    {msgErro(erro.cpf) || <span className={`mt-1.5 block text-[13px] ${SUAVE}`}>É o login da pessoa no app. Vem do cadastro da Unypax.</span>}
                </label>
                <label className="block">
                    <span className={ROTULO}>E-mail</span>
                    <input
                        className={CAMPO}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nome@exemplo.com"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                    />
                    {msgErro(erro.email)}
                </label>
                <label className="block">
                    <span className={ROTULO}>Telefone com DDD</span>
                    <input
                        className={`${CAMPO} tabular-nums`}
                        value={telefone}
                        onChange={(e) => setTelefone(mascaraFone(e.target.value))}
                        placeholder="(77) 99999-9999"
                        inputMode="tel"
                        autoComplete="tel"
                    />
                    {msgErro(erro.tel)}
                </label>
                <div>
                    <span className={ROTULO}>{jaTemAcesso ? "Nova senha" : "Senha"}</span>
                    <div className="flex gap-2">
                        <div className="relative min-w-0 flex-1">
                            <input
                                type={ver ? "text" : "password"}
                                value={senha}
                                onChange={(e) => setSenha(e.target.value)}
                                className={`${CAMPO} pr-12 font-mono`}
                                autoComplete="new-password"
                                autoCapitalize="none"
                                spellCheck={false}
                            />
                            <button
                                type="button"
                                onClick={() => setVer((v) => !v)}
                                aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
                                className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-[#5B6478] hover:bg-[#E3E8F0] dark:text-[#AEB9CF] dark:hover:bg-white/[0.08]"
                            >
                                {ver ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(senha);
                                    setCopiado(true);
                                    window.setTimeout(() => setCopiado(false), 1600);
                                } catch {
                                    /* sem área de transferência */
                                }
                            }}
                            disabled={!senha}
                            className={`${BTN_SEC} w-12 px-0`}
                            aria-label="Copiar senha"
                            title="Copiar senha"
                        >
                            {copiado ? <IconCheck size={18} /> : <IconCopy size={18} />}
                        </button>
                    </div>
                    {msgErro(erro.senha)}
                    <button
                        type="button"
                        onClick={() => {
                            setSenha(gerarSenha());
                            setVer(true);
                        }}
                        className="mt-1 min-h-11 text-[13px] font-bold text-[#3D6A99] underline underline-offset-4 dark:text-[#A9BED6]"
                    >
                        Gerar outra senha
                    </button>
                    <p className={`text-[13px] ${SUAVE}`}>
                        {jaTemAcesso ? "Ao salvar, a senha antiga deixa de valer. " : ""}Copie e passe a senha para o associado; depois de salvar ela não aparece de novo.
                    </p>
                </div>
            </div>
        </Janela>
    );
}
