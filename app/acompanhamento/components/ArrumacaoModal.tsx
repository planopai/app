// INSUMOS POR TECNICO FIX V1: Sandro ID 7 / Joseildo ID 16
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import type { ArrumacaoState, Registro } from "./types";
import { jsonWith401 } from "./helpers";

type EstoqueRow = {
    id?: number;
    produto_id?: number;
    est_produto_id?: number;
    nome: string;
    codigo_barras?: string;
    saldo_total?: number;
};

type InsumoSel = {
    checked: boolean;
    qtd: number;
    nome: string;
    codigo_barras?: string;
};

type DepInsumos = "ARMARIO SANDRO" | "ARMARIO ILDO";

type MeInfo = {
    id: number;
    usuario: string;
    cargo: string;
    deposito_insumos: DepInsumos | null;
    pode_conservacao: boolean;
};

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const ESTOQUE_API = `${ENDPOINT}/materiais_gerais.php`;
const ME_API = `${ENDPOINT}/informativo.php?me=1`;
const INFORM_API = `${ENDPOINT}/informativo.php`;

function normUpper(value: unknown): string {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();
}

function depositoPorUsuario(id: number): DepInsumos | null {
    if (id === 7) return "ARMARIO SANDRO";
    if (id === 16) return "ARMARIO ILDO";
    return null;
}

function getPidFromRow(item: EstoqueRow): number {
    return (
        Number(
            (item as any).id ??
            (item as any).produto_id ??
            (item as any).est_produto_id ??
            0,
        ) || 0
    );
}

function safeParseJson(raw: unknown): any {
    try {
        if (!raw) return {};
        return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
        return {};
    }
}

function parseArrumacaoJson(raw: unknown): {
    deposito_nome: DepInsumos | null;
    itens: Record<number, InsumoSel>;
} {
    const out: {
        deposito_nome: DepInsumos | null;
        itens: Record<number, InsumoSel>;
    } = {
        deposito_nome: null,
        itens: {},
    };

    const obj = safeParseJson(raw);
    if (!obj || typeof obj !== "object") return out;

    const deposito = normUpper(
        (obj as any).deposito_nome ?? (obj as any).deposito ?? "",
    );

    if (deposito === "ARMARIO SANDRO" || deposito === "ARMARIO ILDO") {
        out.deposito_nome = deposito;
    }

    const itensRaw = (obj as any).itens ?? (obj as any).items ?? null;

    if (Array.isArray(itensRaw)) {
        for (const item of itensRaw) {
            const pid =
                Number((item as any)?.produto_id ?? (item as any)?.id ?? 0) || 0;
            if (pid <= 0) continue;

            const checked =
                (item as any)?.checked !== false &&
                (item as any)?.checked !== 0 &&
                (item as any)?.checked !== "0" &&
                (item as any)?.checked !== "false";

            if (!checked) continue;

            out.itens[pid] = {
                checked: true,
                qtd: Math.max(
                    1,
                    Math.floor(
                        Number(
                            (item as any)?.qtd ??
                            (item as any)?.quantidade ??
                            1,
                        ) || 1,
                    ),
                ),
                nome:
                    String((item as any)?.nome ?? "").trim() ||
                    `Produto ${pid}`,
                codigo_barras:
                    String(
                        (item as any)?.codigo_barras ??
                        (item as any)?.cb ??
                        "",
                    ).trim() || undefined,
            };
        }

        return out;
    }

    if (itensRaw && typeof itensRaw === "object") {
        for (const [key, value] of Object.entries(itensRaw)) {
            const item: any = value || {};
            let pid = Number(item?.produto_id ?? 0) || 0;

            if (pid <= 0) {
                const match = String(key).match(/(\d+)/);
                if (match) pid = Number(match[1]) || 0;
            }

            if (pid <= 0) continue;

            const checked =
                item?.checked !== false &&
                item?.checked !== 0 &&
                item?.checked !== "0" &&
                item?.checked !== "false";

            if (!checked) continue;

            out.itens[pid] = {
                checked: true,
                qtd: Math.max(
                    1,
                    Math.floor(
                        Number(item?.qtd ?? item?.quantidade ?? 1) || 1,
                    ),
                ),
                nome: String(item?.nome ?? "").trim() || `Produto ${pid}`,
                codigo_barras:
                    String(item?.codigo_barras ?? item?.cb ?? "").trim() ||
                    undefined,
            };
        }
    }

    return out;
}

async function consultarMe(signal: AbortSignal): Promise<MeInfo> {
    const response = await fetch(ME_API, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.erro) {
        throw new Error(
            data?.msg || `Erro ao consultar usuário (${response.status}).`,
        );
    }

    const id = Number(data?.id ?? 0) || 0;
    const depositoServidor = normUpper(data?.deposito_insumos ?? "");
    const deposito =
        depositoServidor === "ARMARIO SANDRO" ||
            depositoServidor === "ARMARIO ILDO"
            ? depositoServidor
            : depositoPorUsuario(id);

    return {
        id,
        usuario: String(data?.usuario ?? ""),
        cargo: String(data?.cargo ?? "").trim().toLowerCase(),
        deposito_insumos: deposito,
        pode_conservacao:
            data?.pode_conservacao === true ||
            data?.pode_conservacao === 1 ||
            data?.pode_conservacao === "1",
    };
}

export default function ArrumacaoModal({
    open,
    setOpen,
    arrumacao,
    setArrumacao,
    setWizardData,
    wizardData,
    onPersisted,
}: {
    open: boolean;
    setOpen: (open: boolean) => void;
    arrumacao: ArrumacaoState;
    setArrumacao: React.Dispatch<React.SetStateAction<ArrumacaoState>>;
    setWizardData: React.Dispatch<React.SetStateAction<Registro>>;
    wizardData?: Registro;
    onPersisted?: () => void | Promise<void>;
}) {
    const campos: { key: keyof ArrumacaoState; label: string }[] = [
        { key: "luvas", label: "Luvas" },
        { key: "palha", label: "Palha" },
        { key: "tamponamento", label: "Tamponamento" },
        { key: "maquiagem", label: "Maquiagem" },
        { key: "barba", label: "Barba" },
        { key: "mascara", label: "Máscara" },
    ];

    const [me, setMe] = useState<MeInfo | null>(null);
    const [depInsumos, setDepInsumos] = useState<DepInsumos | null>(null);
    const [loadingMe, setLoadingMe] = useState(false);
    const [loadingItens, setLoadingItens] = useState(false);
    const [err, setErr] = useState("");
    const [saveErr, setSaveErr] = useState("");
    const [saving, setSaving] = useState(false);
    const [rows, setRows] = useState<EstoqueRow[]>([]);
    const [sel, setSel] = useState<Record<number, InsumoSel>>({});

    const meAbortRef = useRef<AbortController | null>(null);
    const itensAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!open) return;

        meAbortRef.current?.abort();
        itensAbortRef.current?.abort();

        const controller = new AbortController();
        meAbortRef.current = controller;

        const raw =
            (wizardData as any)?.arrumacao_json ??
            (wizardData as any)?.arrumacao ??
            null;
        const parsed = parseArrumacaoJson(raw);

        setMe(null);
        setDepInsumos(null);
        setRows([]);
        setErr("");
        setSaveErr("");
        setSaving(false);
        setLoadingMe(true);

        consultarMe(controller.signal)
            .then((usuario) => {
                const deposito = usuario.deposito_insumos;

                if (
                    !deposito ||
                    (usuario.id !== 7 && usuario.id !== 16) ||
                    usuario.cargo !== "tanatopraxista"
                ) {
                    throw new Error(
                        "Somente Sandro ou Joseildo podem selecionar insumos de tanatopraxia.",
                    );
                }

                setMe(usuario);
                setDepInsumos(deposito);

                if (parsed.deposito_nome === deposito) {
                    setSel(parsed.itens);
                } else {
                    setSel({});
                }
            })
            .catch((error: any) => {
                if (error?.name === "AbortError") return;
                setMe(null);
                setDepInsumos(null);
                setSel({});
                setRows([]);
                setErr(
                    error?.message ||
                    "Não foi possível identificar o armário do usuário.",
                );
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoadingMe(false);
            });

        return () => controller.abort();
    }, [open, wizardData]);

    useEffect(() => {
        if (!open || !depInsumos || !me) return;

        itensAbortRef.current?.abort();
        const controller = new AbortController();
        itensAbortRef.current = controller;

        setLoadingItens(true);
        setErr("");

        const url = new URL(ESTOQUE_API);
        url.searchParams.set("action", "insumos_tanato_listar");
        // Busca também itens sem saldo para que uma seleção já salva continue
        // visível depois da baixa automática da fase05. Itens zerados e ainda
        // não selecionados ficam bloqueados na interface.
        url.searchParams.set("somente_com_saldo", "0");
        url.searchParams.set("limit", "300");
        url.searchParams.set("_nocache", String(Date.now()));

        fetch(url.toString(), {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            signal: controller.signal,
        })
            .then(async (response) => {
                const data = await response.json().catch(() => null);

                if (response.status === 401) {
                    throw new Error("Sessão expirada. Faça login novamente.");
                }

                if (!response.ok || !data?.ok) {
                    throw new Error(
                        data?.msg || "Falha ao buscar insumos.",
                    );
                }

                const depositoRetornado = normUpper(
                    data?.deposito_nome ?? "",
                );

                if (
                    depositoRetornado &&
                    depositoRetornado !== depInsumos
                ) {
                    throw new Error(
                        "O servidor retornou um depósito diferente do permitido.",
                    );
                }

                setRows(
                    Array.isArray(data?.rows)
                        ? (data.rows as EstoqueRow[])
                        : [],
                );
            })
            .catch((error: any) => {
                if (error?.name === "AbortError") return;
                setRows([]);
                setErr(error?.message || "Falha ao buscar insumos.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoadingItens(false);
            });

        return () => controller.abort();
    }, [open, depInsumos, me]);

    const selectedCount = useMemo(
        () =>
            Object.values(sel).filter(
                (item) => item?.checked && (item?.qtd ?? 0) > 0,
            ).length,
        [sel],
    );

    // Mesmo que o endpoint de estoque deixe de devolver um produto após a
    // baixa da fase05, mantemos a seleção persistida visível no modal.
    const rowsParaExibir = useMemo(() => {
        const byPid = new Map<number, EstoqueRow>();

        for (const row of rows) {
            const pid = getPidFromRow(row);
            if (pid > 0) byPid.set(pid, row);
        }

        for (const [pidRaw, item] of Object.entries(sel)) {
            const pid = Number(pidRaw) || 0;
            if (pid <= 0 || !item?.checked || byPid.has(pid)) continue;

            byPid.set(pid, {
                id: pid,
                produto_id: pid,
                nome: item.nome || `Produto ${pid}`,
                codigo_barras: item.codigo_barras,
                saldo_total: 0,
            });
        }

        return Array.from(byPid.values());
    }, [rows, sel]);

    const buildArrumacaoJson = (): string => {
        const oldRaw = (wizardData as any)?.arrumacao_json ?? null;
        const oldObj = safeParseJson(oldRaw);

        const itens = Object.entries(sel)
            .map(([pidString, value]) => ({
                produto_id: Number(pidString) || 0,
                qtd: Math.max(
                    1,
                    Math.floor(Number(value?.qtd ?? 1) || 1),
                ),
                nome: String(value?.nome ?? "").trim(),
                codigo_barras: String(
                    value?.codigo_barras ?? "",
                ).trim(),
                checked: !!value?.checked,
            }))
            .filter(
                (item) =>
                    item.produto_id > 0 &&
                    item.checked &&
                    item.qtd > 0,
            );

        const payload: any = {
            ...(oldObj && typeof oldObj === "object" ? oldObj : {}),
            ...(arrumacao && typeof arrumacao === "object"
                ? arrumacao
                : {}),
        };

        if (itens.length > 0 && depInsumos) {
            payload.deposito_nome = depInsumos;
            payload.deposito = depInsumos;
            payload.itens = itens;
            payload.items = itens;
        } else {
            delete payload.deposito_nome;
            delete payload.deposito;
            delete payload.itens;
            delete payload.items;
        }

        return JSON.stringify(payload);
    };

    const podeSalvar =
        !!me &&
        !!depInsumos &&
        !loadingMe &&
        !loadingItens &&
        !saving &&
        !err;

    const aplicarNoEstadoLocal = (json: string) => {
        setWizardData((previous: Registro) => {
            const next: Registro = {
                ...previous,
                arrumacao,
                arrumacao_json: json,
            };

            // Estes campos são apenas marcadores de transporte. Como a
            // Arrumação passa a ser persistida imediatamente em registros
            // existentes, não devemos deixar um escopo antigo restringindo
            // um próximo salvamento do Wizard.
            delete (next as any)._wizard_restrict_ids;
            delete (next as any)._wizard_modal_restrict_ids;
            delete (next as any)._wizard_modal_scope;
            delete (next as any)._wizard_modal_dirty_at;

            return next;
        });
    };

    const salvarArrumacao = async () => {
        if (!podeSalvar) return;

        const json = buildArrumacaoJson();
        const registroId = Number((wizardData as any)?.id ?? 0) || 0;

        setSaving(true);
        setSaveErr("");

        try {
            // Em edição, o botão do próprio modal passa a salvar no banco.
            // O escopo restrito garante que somente arrumacao_json seja
            // alterado no atendimento.
            if (registroId > 0) {
                const result = await jsonWith401(INFORM_API, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        acao: "editar",
                        id: registroId,
                        arrumacao_json: json,
                        _wizard_restrict_ids: ["arrumacao_json"],
                    }),
                });

                if (!result?.sucesso) {
                    throw new Error(
                        result?.msg ||
                        result?.erro ||
                        "Não foi possível salvar a arrumação.",
                    );
                }
            }

            // Atualiza a lista principal depois da persistência, mas uma
            // eventual falha de atualização da listagem não transforma um
            // salvamento já confirmado pelo backend em erro.
            if (registroId > 0 && onPersisted) {
                try {
                    await Promise.resolve(onPersisted());
                } catch (refreshError) {
                    console.warn(
                        "Arrumação salva, mas a lista não pôde ser atualizada:",
                        refreshError,
                    );
                }
            }

            // Registro novo ainda não possui ID. Nesse caso os dados ficam
            // no wizardData e serão gravados quando o novo atendimento for
            // concluído pela primeira vez. Em edição, isto também mantém a
            // tela atual sincronizada com o JSON já persistido.
            aplicarNoEstadoLocal(json);
            setOpen(false);
        } catch (error: any) {
            setSaveErr(
                error?.message ||
                "Não foi possível salvar os insumos de tanatopraxia.",
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={() => setOpen(false)}
            ariaLabel="Arrumação do Corpo"
            maxWidth={720}
        >
            <h3 className="text-lg font-semibold">
                Conservação do Corpo
            </h3>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {campos.map((campo) => (
                    <label
                        key={campo.key}
                        className="inline-flex items-center gap-2"
                    >
                        <input
                            type="checkbox"
                            checked={!!arrumacao[campo.key]}
                            onChange={(event) =>
                                setArrumacao((previous) => ({
                                    ...previous,
                                    [campo.key]: event.target.checked,
                                }))
                            }
                        />
                        <span>{campo.label}</span>
                    </label>
                ))}
            </div>

            <div className="mt-6 rounded-xl border p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="text-sm font-semibold">
                            Insumos Tanatopraxia
                        </div>
                        <div className="text-xs text-muted-foreground">
                            Os itens serão descontados automaticamente na{" "}
                            <b>fase05</b>.
                        </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                        {selectedCount > 0 ? (
                            <>
                                Selecionados: <b>{selectedCount}</b>
                            </>
                        ) : (
                            "Nenhum insumo selecionado"
                        )}
                    </div>
                </div>

                <div className="mt-3">
                    {loadingMe || loadingItens ? (
                        <div className="rounded-md border p-3 text-sm text-slate-600">
                            Carregando itens…
                        </div>
                    ) : err ? (
                        <div className="rounded-md border p-3 text-sm text-red-600">
                            {err}
                        </div>
                    ) : rowsParaExibir.length === 0 ? (
                        <div className="rounded-md border p-3 text-sm text-slate-600">
                            Nenhum insumo cadastrado para este armário.
                        </div>
                    ) : (
                        <div className="max-h-72 overflow-auto rounded-md border">
                            <div className="grid grid-cols-[1fr_92px_72px] gap-2 border-b bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                                <div>Produto</div>
                                <div className="text-right">Estoque</div>
                                <div className="text-right">Qtd</div>
                            </div>

                            <ul className="divide-y">
                                {rowsParaExibir.map((item) => {
                                    const pid = getPidFromRow(item);
                                    if (!pid) return null;

                                    const current = sel[pid];
                                    const checked = !!current?.checked;
                                    const saldo = Math.max(
                                        0,
                                        Number(item.saldo_total) || 0,
                                    );
                                    const semSaldoParaNovaSelecao =
                                        saldo <= 0 && !checked;
                                    const qtd = Math.max(
                                        1,
                                        Math.floor(
                                            Number(current?.qtd ?? 1) || 1,
                                        ),
                                    );

                                    return (
                                        <li
                                            key={pid}
                                            className="grid grid-cols-[1fr_92px_72px] items-center gap-2 px-3 py-2"
                                        >
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    disabled={
                                                        semSaldoParaNovaSelecao ||
                                                        saving
                                                    }
                                                    title={
                                                        semSaldoParaNovaSelecao
                                                            ? "Item sem saldo disponível"
                                                            : undefined
                                                    }
                                                    onChange={(event) => {
                                                        const enabled =
                                                            event.target
                                                                .checked;

                                                        setSel(
                                                            (previous) => ({
                                                                ...previous,
                                                                [pid]: {
                                                                    checked:
                                                                        enabled,
                                                                    qtd: Math.max(
                                                                        1,
                                                                        Math.floor(
                                                                            Number(
                                                                                previous?.[
                                                                                    pid
                                                                                ]
                                                                                    ?.qtd ??
                                                                                1,
                                                                            ) ||
                                                                            1,
                                                                        ),
                                                                    ),
                                                                    nome: String(
                                                                        item.nome ||
                                                                        "",
                                                                    ).trim(),
                                                                    codigo_barras:
                                                                        String(
                                                                            (
                                                                                item as any
                                                                            )
                                                                                .codigo_barras ||
                                                                            "",
                                                                        ).trim() ||
                                                                        undefined,
                                                                },
                                                            }),
                                                        );
                                                    }}
                                                />

                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-medium text-slate-900">
                                                        {item.nome}
                                                    </div>
                                                    <div className="truncate text-[11px] text-slate-500">
                                                        CB:{" "}
                                                        <b>
                                                            {String(
                                                                (
                                                                    item as any
                                                                )
                                                                    .codigo_barras ||
                                                                "",
                                                            )}
                                                        </b>
                                                    </div>
                                                </div>
                                            </label>

                                            <div className="text-right text-sm text-slate-700">
                                                <b>
                                                    {saldo}
                                                </b>
                                            </div>

                                            <div className="text-right">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    step={1}
                                                    className="w-full rounded-md border px-2 py-1 text-sm"
                                                    value={qtd}
                                                    disabled={!checked || saving}
                                                    onChange={(event) => {
                                                        const nextQtd =
                                                            Math.max(
                                                                1,
                                                                Math.floor(
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value,
                                                                    ) || 1,
                                                                ),
                                                            );

                                                        setSel(
                                                            (previous) => ({
                                                                ...previous,
                                                                [pid]: {
                                                                    checked:
                                                                        true,
                                                                    qtd: nextQtd,
                                                                    nome: String(
                                                                        previous?.[
                                                                            pid
                                                                        ]
                                                                            ?.nome ??
                                                                        item.nome ??
                                                                        "",
                                                                    ).trim(),
                                                                    codigo_barras:
                                                                        String(
                                                                            previous?.[
                                                                                pid
                                                                            ]
                                                                                ?.codigo_barras ??
                                                                            (
                                                                                item as any
                                                                            )
                                                                                .codigo_barras ??
                                                                            "",
                                                                        ).trim() ||
                                                                        undefined,
                                                                },
                                                            }),
                                                        );
                                                    }}
                                                    title="Quantidade"
                                                />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>

                {saveErr && (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {saveErr}
                    </div>
                )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <button
                    type="button"
                    className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                    onClick={() => setOpen(false)}
                    disabled={saving}
                >
                    Cancelar
                </button>

                <button
                    type="button"
                    disabled={!podeSalvar}
                    className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={salvarArrumacao}
                    aria-busy={saving}
                >
                    {saving ? "Salvando…" : "Salvar Arrumação"}
                </button>
            </div>
        </Modal>
    );
}
