"use client";

import React from "react";
import { FalecidoItem } from "./TiposHistorico";
import { formataDataHora } from "./UtilDatas";

interface Props {
    registros: FalecidoItem[];
    loading: boolean;
    pagina: number;
    totalPaginas: number;
    onPaginaAnterior: () => void;
    onPaginaProxima: () => void;
    selecionadoId?: string;
    onSelecionar: (item: FalecidoItem) => void;
    criacaoMap: Record<string, string>;
}

/* =========================
   Helpers: ID e Datas
   ========================= */

function getRegistroId(item: FalecidoItem): string {
    // fallback para registros que não têm sepultamento_id (ex.: "terceiro")
    const anyItem = item as any;
    return String(item?.sepultamento_id ?? anyItem?.id ?? "").trim();
}

// dd/mm/aaaa[, HH:MM:SS]
function parseBrDate(s: string): Date | null {
    const m = s
        ?.trim()
        .match(
            /^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
        );
    if (!m) return null;
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
    const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
    return isNaN(d.getTime()) ? null : d;
}

// ISO — se não houver timezone, considerar LOCAL
function parseIsoDate(s: string): Date | null {
    const t = s?.trim().replace(" ", "T");
    if (!t) return null;

    // aaaa-mm-dd
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
        const [, yyyy, mm, dd] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, 0, 0, 0);
        return isNaN(d.getTime()) ? null : d;
    }

    // aaaa-mm-ddTHH:MM[:SS]
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
        const [, yyyy, mm, dd, hh, mi, ss = "00"] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
        return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
}

function parseDateFlex(s?: string | null): Date | null {
    if (!s) return null;
    return parseBrDate(s) || parseIsoDate(s) || null;
}

/* pega a melhor data de exibição/ordenação:
   1) criacaoMap[id]
   2) item.created_at
   3) item.data / data_inicio_velorio / etc (quando existir)
*/
function getItemDate(
    item: FalecidoItem,
    criacaoMap: Record<string, string>
): Date | null {
    const id = getRegistroId(item);
    const candidatos = [
        id ? criacaoMap[id] : undefined,
        (item as any).created_at,
        (item as any).data,
        (item as any).data_inicio_velorio,
        (item as any).data_fim_velorio,
    ];

    for (const c of candidatos) {
        const d = parseDateFlex(String(c || ""));
        if (d) return d;
    }
    return null;
}

export default function ListaRegistros({
    registros,
    loading,
    pagina,
    totalPaginas,
    onPaginaAnterior,
    onPaginaProxima,
    selecionadoId,
    onSelecionar,
    criacaoMap,
}: Props) {
    /**
     * 1) Deduplica de forma segura:
     * - NÃO descarta itens sem ID (cria ID sintético)
     * - se houver duplicados com mesmo ID, mantém o mais recente pela melhor data
     */
    const semDuplicados = React.useMemo(() => {
        const map = new Map<string, FalecidoItem>();

        for (let i = 0; i < (registros || []).length; i++) {
            const it = registros[i];
            let id = getRegistroId(it);

            // Se não tiver id, cria um id sintético para NÃO sumir
            if (!id) {
                const created = (it as any).created_at || "";
                id = `sem-id-${i}-${String(created)}`;
                map.set(id, it);
                continue;
            }

            const atual = map.get(id);
            if (!atual) {
                map.set(id, it);
            } else {
                const dNovo = getItemDate(it, criacaoMap)?.getTime() ?? 0;
                const dAtual = getItemDate(atual, criacaoMap)?.getTime() ?? 0;
                if (dNovo >= dAtual) map.set(id, it);
            }
        }

        return Array.from(map.values());
    }, [registros, criacaoMap]);

    // 2) Ordena DESC pela melhor data
    const ordenados = React.useMemo(() => {
        const arr = [...semDuplicados];
        arr.sort((a, b) => {
            const da = getItemDate(a, criacaoMap);
            const db = getItemDate(b, criacaoMap);
            const ta = da ? da.getTime() : 0;
            const tb = db ? db.getTime() : 0;
            return tb - ta; // DESC
        });
        return arr;
    }, [semDuplicados, criacaoMap]);

    return (
        <div className="flex flex-col border rounded overflow-hidden w-full">
            <div className="bg-gray-100 p-3 font-semibold">Registros</div>

            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="p-4 text-center">Carregando...</div>
                ) : ordenados.length === 0 ? (
                    <div className="p-4 text-center">Nenhum registro encontrado.</div>
                ) : (
                    <ul>
                        {ordenados.map((item, idx) => {
                            const id = getRegistroId(item);

                            // data exibida no UI
                            const criadoEm =
                                (id ? criacaoMap[id] : "") || (item as any).created_at || "";

                            // key estável mesmo sem id
                            const key =
                                (id ? `id-${id}` : `sem-id-${idx}`) + `-${criadoEm || "s-data"}`;

                            return (
                                <li key={key}>
                                    <button
                                        type="button"
                                        className={`w-full p-3 border-b hover:bg-muted/40 flex items-center ${selecionadoId === id ? "bg-blue-50" : ""
                                            }`}
                                        onClick={() => onSelecionar(item)}
                                    >
                                        <div className="flex-1 text-left font-medium truncate">
                                            {item.falecido}
                                        </div>
                                        <div className="text-xs text-muted-foreground text-right">
                                            {criadoEm ? formataDataHora(criadoEm) : "—"}
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="flex justify-between items-center p-2 border-t bg-gray-50">
                <button
                    onClick={onPaginaAnterior}
                    disabled={pagina <= 1}
                    className="px-2 py-1 border rounded disabled:opacity-50"
                >
                    ← Anterior
                </button>
                <span className="text-sm">
                    Página {pagina} / {Math.max(1, totalPaginas)}
                </span>
                <button
                    onClick={onPaginaProxima}
                    disabled={pagina >= totalPaginas}
                    className="px-2 py-1 border rounded disabled:opacity-50"
                >
                    Próxima →
                </button>
            </div>
        </div>
    );
}
