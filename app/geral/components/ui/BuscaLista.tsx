"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ic } from "./Icones";

// Escolha de dado no padrão do app: escrever + lista que filtra (decidido em 06/10/2026).
// Ao tocar, mostra a lista inteira; ao digitar, filtra; ao escolher, fecha.

export type OpcaoBusca = { id: string | number; n: string; info?: string; busca?: string };

export function normalizar(t: unknown): string {
    return String(t ?? "")
        .toUpperCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
}

export type BuscaLista = ReturnType<typeof useBuscaLista>;

export function useBuscaLista(itens: OpcaoBusca[], selId: string | number | null | undefined, aoEscolher: (id: string | number | null) => void, max = 30) {
    const sel = useMemo(() => itens.find((i) => String(i.id) === String(selId ?? "")), [itens, selId]);
    const [q, setQ] = useState<string | null>(null);
    const [aberto, setAberto] = useState(false);
    const timer = useRef<number | null>(null);
    const mudouAqui = useRef(false);

    // Quando a escolha muda por fora (ex.: depois de adicionar o item), o texto volta a acompanhar.
    // Se a mudança veio de quem está digitando, o texto digitado fica.
    useEffect(() => {
        if (mudouAqui.current) {
            mudouAqui.current = false;
            return;
        }
        setQ(null);
    }, [selId]);

    const texto = q ?? (sel ? sel.n : "");
    const termo = sel && texto === sel.n ? "" : normalizar(texto).trim();
    const opcoes = aberto
        ? itens.filter((i) => !termo || normalizar(`${i.n} ${i.busca ?? ""}`).includes(termo)).slice(0, max)
        : [];

    return {
        q: texto,
        lista: aberto,
        semRes: aberto && opcoes.length === 0,
        opcoes: opcoes.map((i) => ({
            n: i.n,
            info: i.info ?? "",
            pick: () => {
                if (timer.current) window.clearTimeout(timer.current);
                setQ(null);
                setAberto(false);
                aoEscolher(i.id);
            },
        })),
        onQ: (e: React.ChangeEvent<HTMLInputElement>) => {
            if (timer.current) window.clearTimeout(timer.current);
            setQ(e.target.value);
            setAberto(true);
            if (selId != null && selId !== "") {
                mudouAqui.current = true;
                aoEscolher(null);
            }
        },
        onFoco: () => {
            if (timer.current) window.clearTimeout(timer.current);
            setAberto(true);
        },
        onSai: () => {
            timer.current = window.setTimeout(() => setAberto(false), 180);
        },
        limpar: () => {
            setQ("");
            setAberto(false);
            aoEscolher(null);
        },
    };
}

/** Campo de busca com a lista (mesmo desenho no computador e no celular). */
export function CampoBusca({
    b,
    rotulo,
    placeholder = "Digite para buscar",
    m,
    aoLer,
    style,
}: {
    b: BuscaLista;
    rotulo: string;
    placeholder?: string;
    m?: boolean;
    aoLer?: () => void;
    style?: React.CSSProperties;
}) {
    return (
        <div className="cb" style={style}>
            <label className="cbin">
                <Ic n="busca" />
                <input
                    value={b.q}
                    onChange={b.onQ}
                    onFocus={b.onFoco}
                    onBlur={b.onSai}
                    placeholder={placeholder}
                    aria-label={rotulo}
                    autoComplete="off"
                    style={{ fontSize: m ? "16px" : "14px" }}
                />
            </label>
            {aoLer ? (
                <button type="button" className="cbsc" onClick={aoLer} aria-label="Ler código de barras">
                    <Ic n="leitor" />
                </button>
            ) : null}
            {b.lista ? (
                <div className="cbl" role="listbox" aria-label={rotulo}>
                    {b.opcoes.map((o, i) => (
                        <button type="button" key={i} className="cbo" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={o.pick}>
                            <span className="pn">{o.n}</span>
                            <span className="cbx">{o.info}</span>
                        </button>
                    ))}
                    {b.semRes ? (
                        <div className="sm" style={{ padding: "10px 12px" }}>
                            Nada encontrado.
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
