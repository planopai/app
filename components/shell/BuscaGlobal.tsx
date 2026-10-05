"use client";

/**
 * Pesquisa do cabeçalho (computador): digite o nome de uma tela ou função e vá direto a ela.
 * Atalho: Ctrl+K (Windows) ou ⌘K (Mac). Setas escolhem, Enter abre, Esc fecha.
 * Mostra só o que o usuário pode abrir (permissões) e que existe em app/ (sem link para 404).
 * Ainda NÃO procura registros (atendimento, associado, produto): isso depende dos endereços de busca de cada módulo.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch } from "@tabler/icons-react";
import { usePerms } from "@/app/_perms/PermsProvider";
import { FIXOS, MODULOS, destinoDoModulo, hrefDoItem, itemVisivel, itensVisiveis, moduloVisivel } from "./modulos";

type Resultado = { chave: string; titulo: string; onde: string; desc: string; href: string; texto: string };

const normaliza = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function BuscaGlobal({ className = "" }: { className?: string }) {
    const router = useRouter();
    const { perms, has } = usePerms();
    const entrada = useRef<HTMLInputElement | null>(null);
    const [q, setQ] = useState("");
    const [aberto, setAberto] = useState(false);
    const [sel, setSel] = useState(0);
    const [mac, setMac] = useState(false);

    useEffect(() => {
        setMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
        const aoTecla = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                entrada.current?.focus();
                entrada.current?.select();
                setAberto(true);
            }
        };
        window.addEventListener("keydown", aoTecla);
        return () => window.removeEventListener("keydown", aoTecla);
    }, []);

    const todos = useMemo<Resultado[]>(() => {
        if (perms === null) return [];
        const lista: Resultado[] = [];
        for (const f of FIXOS) {
            if (!itemVisivel(f, has)) continue;
            const href = hrefDoItem(f, has);
            lista.push({ chave: "f:" + href, titulo: f.titulo, onde: "Atalhos", desc: f.desc, href, texto: normaliza(`${f.titulo} ${f.desc}`) });
        }
        for (const m of MODULOS) {
            if (!moduloVisivel(m, has)) continue;
            lista.push({ chave: "m:" + m.id, titulo: `Visão geral de ${m.titulo}`, onde: m.titulo, desc: m.desc, href: destinoDoModulo(m, has), texto: normaliza(`${m.titulo} ${m.desc} visao geral`) });
            for (const i of itensVisiveis(m, has)) {
                const href = hrefDoItem(i, has);
                lista.push({ chave: `i:${m.id}:${i.titulo}`, titulo: i.titulo, onde: m.titulo, desc: i.desc, href, texto: normaliza(`${i.titulo} ${i.desc} ${m.titulo} ${i.secao || ""}`) });
            }
        }
        return lista;
    }, [perms, has]);

    const resultados = useMemo(() => {
        const termos = normaliza(q).split(/\s+/).filter(Boolean);
        if (!termos.length) return [];
        return todos.filter((r) => termos.every((t) => r.texto.includes(t))).slice(0, 8);
    }, [q, todos]);

    useEffect(() => setSel(0), [q]);

    const ir = (r: Resultado) => {
        setAberto(false);
        setQ("");
        entrada.current?.blur();
        router.push(r.href);
    };

    return (
        <div className={`relative w-full max-w-[520px] ${className}`}>
            <label className="flex h-11 items-center gap-2.5 rounded-xl bg-[#F1F4F8] px-3.5 text-[#5B6478] focus-within:ring-2 focus-within:ring-[#00AEEC] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                <IconSearch size={18} className="shrink-0" />
                <input
                    ref={entrada}
                    type="search"
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setAberto(true);
                    }}
                    onFocus={() => setAberto(true)}
                    onBlur={() => setTimeout(() => setAberto(false), 120)}
                    onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setSel((s) => Math.min(s + 1, Math.max(resultados.length - 1, 0)));
                        } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setSel((s) => Math.max(s - 1, 0));
                        } else if (e.key === "Enter" && resultados[sel]) {
                            e.preventDefault();
                            ir(resultados[sel]);
                        } else if (e.key === "Escape") {
                            setAberto(false);
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                    placeholder="Pesquisar tela ou função"
                    aria-label="Pesquisa global"
                    aria-expanded={aberto && q.trim().length > 0}
                    aria-controls="busca-global-lista"
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#313C55] outline-none placeholder:text-[#5B6478] dark:text-white dark:placeholder:text-[#AEB9CF]"
                    style={{ WebkitAppearance: "none" }}
                />
                <kbd className="hidden rounded-lg border border-[#E3E8F0] bg-white px-2 py-0.5 text-xs font-bold text-[#5B6478] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#AEB9CF] lg:block">
                    {mac ? "⌘K" : "Ctrl K"}
                </kbd>
            </label>

            {aberto && q.trim().length > 0 && (
                <ul
                    id="busca-global-lista"
                    role="listbox"
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-[#E3E8F0] bg-white p-1.5 shadow-lg dark:border-white/[0.12] dark:bg-[#232B3F]"
                >
                    {resultados.length === 0 ? (
                        <li className="px-3 py-3 text-sm font-semibold text-[#5B6478] dark:text-[#AEB9CF]">Nenhuma tela encontrada.</li>
                    ) : (
                        resultados.map((r, i) => (
                            <li key={r.chave} role="option" aria-selected={i === sel}>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => ir(r)}
                                    onMouseEnter={() => setSel(i)}
                                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${i === sel ? "bg-[#EEF2F7] dark:bg-white/10" : ""}`}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-extrabold text-[#313C55] dark:text-white">{r.titulo}</span>
                                        <span className="block truncate text-xs text-[#5B6478] dark:text-[#AEB9CF]">{r.desc}</span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-[#E6F7FE] px-2.5 py-0.5 text-[11px] font-extrabold text-[#313C55] dark:bg-[#00AEEC]/20 dark:text-white">{r.onde}</span>
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
}
