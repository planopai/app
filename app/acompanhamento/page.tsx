"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrumacaoState, MateriaisState, Registro, Aviso } from "./components/types";
import {
    API,
    obrigatorios,
    steps,
    wizardStepIndexes,
    wizardStepTitles,
} from "./components/constants";
import {
    defaultArrumacao,
    defaultMateriais,
    jsonWith401,
    enviarRegistroPHP,
    capitalizeStatus,
    normalizarStatus,
} from "./components/helpers";

import TabelaAtendimentos from "./components/TabelaAtendimentos";
import AvisosBox from "./components/AvisosBox";
import Wizard from "./components/Wizard";
import MateriaisModal from "./components/MateriaisModal";
import ArrumacaoModal from "./components/ArrumacaoModal";
import AcaoModal from "./components/AcaoModal";
import InfoModal from "./components/InfoModal";
import SignatureModal from "./components/SignatureModal";
import Modal from "./components/Modal";

type TipoAtendimento = "funerario" | "terceiro";

export default function AcompanhamentoPage() {
    // Tabela
    const [registros, setRegistros] = useState<Registro[]>([]);

    // Avisos
    const [avisos, setAvisos] = useState<Aviso[]>([]);
    const [avisoMsg, setAvisoMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const avisoInputRef = useRef<HTMLInputElement>(null);

    // Wizard
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardTitle, setWizardTitle] = useState("Novo Registro");
    const [wizardEditing, setWizardEditing] = useState(false);
    const [wizardIdx, setWizardIdx] = useState<number | null>(null);
    const [wizardRestrictGroup, setWizardRestrictGroup] = useState<number | null>(null);
    const [wizardStep, setWizardStep] = useState(0);
    const [wizardData, setWizardData] = useState<Registro>({});
    const [wizardMsg, setWizardMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [wizardSubmitting, setWizardSubmitting] = useState(false);

    // Tipo de atendimento (para novos registros)
    const [novoTipoOpen, setNovoTipoOpen] = useState(false);
    const [tipoAtendimento, setTipoAtendimento] = useState<TipoAtendimento>("funerario");

    // selects
    const [assistenciaVal, setAssistenciaVal] = useState<string>("");
    const [tanatoVal, setTanatoVal] = useState<string>("");

    // Materiais
    const [materiaisOpen, setMateriaisOpen] = useState(false);
    const [materiais, setMateriais] = useState<MateriaisState>(defaultMateriais());

    // Arrumação
    const [arrumacaoOpen, setArrumacaoOpen] = useState(false);
    const [arrumacao, setArrumacao] = useState<ArrumacaoState>(defaultArrumacao());

    // Ações (por ID)
    const [acaoOpen, setAcaoOpen] = useState(false);
    const [acaoId, setAcaoId] = useState<Registro["id"] | null>(null);
    const [acaoMsg, setAcaoMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [acaoSubmitting, setAcaoSubmitting] = useState(false);

    // Info — agora por ID (evita desindexar com polling)
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoId, setInfoId] = useState<Registro["id"] | null>(null);

    // Assinatura (ainda por índice internamente)
    const [signOpen, setSignOpen] = useState(false);
    const [signTipo, setSignTipo] = useState<"recebimento" | "requisicao">("recebimento");
    const [signIdx, setSignIdx] = useState<number | null>(null);

    /* -------------------- Fetch helpers -------------------- */

    const fetchRegistros = useCallback(async () => {
        try {
            const r = await fetch(`${API}/api/php/informativo.php?listar=1&_nocache=${Date.now()}`, {
                cache: "no-store",
                headers: {
                    Pragma: "no-cache",
                    Expires: "0",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
                credentials: "include",
            });

            if (r.status === 401) return;

            const data = await r.json().catch(() => null);
            if (data?.need_login) return;

            const sane: Registro[] = Array.isArray(data)
                ? data.map((it: any) => ({
                    ...it,
                    id: it?.id != null ? String(it.id) : it.id,
                    status: normalizarStatus(it?.status) ?? it?.status,
                }))
                : [];

            setRegistros(sane);
        } catch {
            setRegistros([]);
        }
    }, []);

    const fetchAvisos = useCallback(async () => {
        try {
            const r = await fetch(`${API}/api/php/avisos.php?listar=1&_nocache=${Date.now()}`, {
                credentials: "include",
            });
            if (r.status === 401) return;
            const data = await r.json().catch(() => null);
            if (data?.need_login) return;
            setAvisos(Array.isArray(data) ? data : []);
        } catch {
            setAvisos([]);
        }
    }, []);

    const enviarAviso = useCallback(async () => {
        const val = (avisoInputRef.current?.value ?? "").trim();
        if (!val) {
            setAvisoMsg({ text: "Digite um aviso para enviar!", ok: false });
            return;
        }
        try {
            const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensagem: val }),
            });
            if (res?.sucesso) {
                setAvisoMsg({ text: "Aviso adicionado!", ok: true });
                if (avisoInputRef.current) avisoInputRef.current.value = "";
                fetchAvisos();
            } else {
                setAvisoMsg({ text: res?.erro || "Erro ao adicionar!", ok: false });
            }
        } catch (e: any) {
            setAvisoMsg({ text: e?.message || "Erro ao adicionar!", ok: false });
        }
    }, [fetchAvisos]);

    const editarAviso = useCallback(
        async (id: number | string, mensagem: string) => {
            try {
                const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, mensagem }),
                });
                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso atualizado!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || "Erro ao editar!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao editar!", ok: false });
            }
        },
        [fetchAvisos]
    );

    const excluirAviso = useCallback(
        async (id: number | string) => {
            if (!window.confirm("Tem certeza que deseja excluir este aviso?")) return;
            try {
                const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, excluir: true }),
                });
                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso excluído!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || "Erro ao excluir!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao excluir!", ok: false });
            }
        },
        [fetchAvisos]
    );

    const finalizarAviso = useCallback(
        async (id: number | string) => {
            try {
                const res = await jsonWith401(`${API}/api/php/avisos.php`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, finalizar: true }),
                });
                if (res?.sucesso) {
                    setAvisoMsg({ text: "Aviso finalizado!", ok: true });
                    fetchAvisos();
                } else {
                    setAvisoMsg({ text: res?.erro || "Erro ao finalizar!", ok: false });
                }
            } catch (e: any) {
                setAvisoMsg({ text: e?.message || "Erro ao finalizar!", ok: false });
            }
        },
        [fetchAvisos]
    );

    /* -------------------- Ciclos -------------------- */

    useEffect(() => {
        fetchRegistros();
        fetchAvisos();
    }, [fetchRegistros, fetchAvisos]);

    useEffect(() => {
        const intReg = setInterval(fetchRegistros, 10000);
        const intAv = setInterval(fetchAvisos, 3000);

        const onVis = () => {
            if (!document.hidden) fetchRegistros();
        };
        document.addEventListener("visibilitychange", onVis);

        return () => {
            clearInterval(intReg);
            clearInterval(intAv);
            document.removeEventListener("visibilitychange", onVis);
        };
    }, [fetchRegistros, fetchAvisos]);

    useEffect(() => {
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setWizardOpen(false);
                setAcaoOpen(false);
                setInfoOpen(false);
                setMateriaisOpen(false);
                setArrumacaoOpen(false);
                setSignOpen(false);
                setNovoTipoOpen(false);
            }
        };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, []);

    /* -------------------- Parser helpers locais -------------------- */

    const parseMateriaisFromRegistro = (r: Registro): MateriaisState => {
        if (r.materiais_json) {
            try {
                const parsed = JSON.parse(String(r.materiais_json));
                const base = defaultMateriais();
                Object.keys(base).forEach((k) => {
                    const qtdCol = (r as any)[`materiais_${k}_qtd`];
                    const parsedItem = (parsed as any)?.[k];
                    (base as any)[k] = {
                        checked: !!parsedItem?.checked || Number(qtdCol) > 0 || !!parsedItem?.qtd,
                        qtd: Number(parsedItem?.qtd ?? (qtdCol != null ? qtdCol : 0)),
                    };
                });
                return base;
            } catch {
                // segue fallback
            }
        }
        const base = defaultMateriais();
        Object.keys(base).forEach((k) => {
            const qtdCol = (r as any)[`materiais_${k}_qtd`];
            const qtd = Number(qtdCol ?? 0);
            (base as any)[k] = { checked: qtd > 0, qtd };
        });
        return base;
    };

    const parseArrumacaoFromRegistro = (r: Registro): ArrumacaoState => {
        if (r.arrumacao_json) {
            try {
                const parsed = JSON.parse(String(r.arrumacao_json));
                return { ...defaultArrumacao(), ...parsed };
            } catch {
                // ignore
            }
        }
        return defaultArrumacao();
    };

    /* -------------------- Aberturas -------------------- */

    const abrirWizard = useCallback(
        (tipo: "novo" | "editar", idx: number | null = null, grupoStep: number | null = null) => {
            setWizardSubmitting(false);
            const editing = tipo === "editar";
            setWizardEditing(editing);
            setWizardIdx(idx);
            setWizardRestrictGroup(grupoStep);
            setWizardStep(grupoStep ?? 0);
            setWizardMsg(null);
            setWizardTitle(editing ? "Editar Registro" : "Novo Registro");

            if (editing && idx !== null && registros[idx]) {
                // Em edição, mantemos o fluxo padrão (funerário)
                setTipoAtendimento("funerario");
                const r = registros[idx];
                const data: Registro = {};
                (steps as any).forEach((s: any) => {
                    (data as any)[s.id] = (r as any)[s.id] ?? "";
                });
                data.id = r.id;

                const mats = parseMateriaisFromRegistro(r);
                setMateriais(mats);
                (data as any).materiais = mats;

                const arr = parseArrumacaoFromRegistro(r);
                setArrumacao(arr);
                (data as any).arrumacao = arr;

                setWizardData(data);
                setAssistenciaVal(String((r.assistencia ?? "") as string));
                setTanatoVal(String((r.tanato ?? "") as string));
            } else {
                // Novo — respeita o tipo escolhido
                const empty: Registro = {};
                (steps as any).forEach((s: any) => ((empty as any)[s.id] = ""));
                setWizardData(empty);
                setMateriais(defaultMateriais());
                setArrumacao(defaultArrumacao());
                setAssistenciaVal("");
                setTanatoVal("");
            }

            setWizardOpen(true);
        },
        [registros]
    );

    const salvarGrupoWizard = useCallback((): Registro | null => {
        const grupo = wizardStepIndexesForTipo[wizardStep];
        const next: Registro = { ...wizardData };

        for (const idx of grupo) {
            const s = (steps as any)[idx] as any;
            const el = document.getElementById("wizard-" + s.id) as
                | HTMLInputElement
                | HTMLTextAreaElement
                | null;
            const v = (el?.value ?? "").trim();
            (next as any)[s.id] = v;
        }

        if (wizardData.id != null) next.id = wizardData.id;

        (next as any).materiais = materiais;
        (next as any).arrumacao = arrumacao;

        setWizardData(next);
        return next;
    }, [wizardData, wizardStep, materiais, arrumacao]);

    const concluirWizard = useCallback(async () => {
        if (wizardSubmitting) return;
        const dataAtualizada = salvarGrupoWizard();
        if (!dataAtualizada) return;

        // obrigatórios dinâmicos por tipo
        let grupoObrigatorios: string[];
        if (typeof wizardRestrictGroup === "number") {
            const grupo = wizardStepIndexesForTipo[wizardRestrictGroup];
            const ids = grupo.map((i) => (steps as any)[i].id);
            grupoObrigatorios = ids.filter((id) => obrigatoriosForTipo.includes(id));
        } else {
            grupoObrigatorios = obrigatoriosForTipo;
        }

        for (const id of grupoObrigatorios) {
            if (!dataAtualizada[id] || String(dataAtualizada[id]).trim() === "") {
                setWizardMsg({ text: "Preencha todos campos obrigatórios.", ok: false });
                return;
            }
        }

        try {
            setWizardSubmitting(true);
            const payload = { ...dataAtualizada, acao: wizardEditing ? "editar" : "novo" };
            const json = await enviarRegistroPHP(payload);
            if (json?.sucesso) {
                setWizardMsg({ text: "Registro salvo!", ok: true });
                fetchRegistros();
                setTimeout(() => setWizardOpen(false), 950);
            } else {
                setWizardMsg({ text: json?.erro || "Erro ao salvar!", ok: false });
            }
        } catch (e: any) {
            setWizardMsg({ text: e?.message || "Erro ao salvar!", ok: false });
        } finally {
            setWizardSubmitting(false);
        }
    }, [salvarGrupoWizard, wizardRestrictGroup, wizardEditing, fetchRegistros, wizardSubmitting]);

    /* -------------------- Ações (status) -------------------- */

    const abrirPopupAcaoPorId = useCallback((id: Registro["id"]) => {
        setAcaoMsg(null);
        setAcaoId(id != null ? String(id) : null);
        setAcaoSubmitting(false);
        setAcaoOpen(true);
    }, []);

    const registrarAcao = useCallback(
        async (acao: string) => {
            if (acaoSubmitting) return;
            if (acaoId == null) return;

            const ok = window.confirm("Deseja confirmar essa ação?");
            if (!ok) return;

            setAcaoSubmitting(true);
            try {
                const json = await enviarRegistroPHP({
                    acao: "atualizar_status",
                    id: acaoId,
                    status: acao,
                });

                if (json?.sucesso) {
                    setAcaoMsg({ text: `Status alterado para "${capitalizeStatus(acao)}"`, ok: true });
                    await fetchRegistros();
                    setAcaoOpen(false);
                } else {
                    setAcaoMsg({ text: json?.erro || "Erro ao atualizar status.", ok: false });
                }
            } catch (e: any) {
                setAcaoMsg({ text: e?.message || "Erro ao atualizar status.", ok: false });
            } finally {
                setAcaoSubmitting(false);
            }
        },
        [acaoId, fetchRegistros, acaoSubmitting]
    );

    /* -------------------- Info por ID (estável) -------------------- */

    // Registro atual para o Info
    const registroInfo = useMemo(
        () => (infoId != null ? registros.find((x) => String(x.id) === String(infoId)) ?? null : null),
        [registros, infoId]
    );

    // Índice “compatível” para o InfoModal (enquanto ele ainda depender de índice)
    const infoIdxResolved = useMemo(() => {
        if (infoId == null) return null;
        const idx = registros.findIndex((x) => String(x.id) === String(infoId));
        return idx >= 0 ? idx : null;
    }, [registros, infoId]);

    const abrirInfoPorId = useCallback((id: Registro["id"]) => {
        setInfoId(id != null ? String(id) : null);
        setInfoOpen(true);
    }, []);

    // Wrappers para manter compat com InfoModal que espera índice:
    const abrirWizardFromInfo = useCallback(
        (tipo: "novo" | "editar", _idx: number | null = null, grupoStep: number | null = null) => {
            const idx = infoIdxResolved;
            if (idx != null) abrirWizard(tipo, idx, grupoStep);
        },
        [infoIdxResolved, abrirWizard]
    );

    const abrirAssinaturaFromInfo = useCallback(
        (_idx: number, tipo: "recebimento" | "requisicao") => {
            const idx = infoIdxResolved;
            if (idx != null) {
                setSignIdx(idx);
                setSignTipo(tipo);
                setSignOpen(true);
            }
        },
        [infoIdxResolved]
    );

    /* -------------------- Assinatura (fora do Info) -------------------- */
    const abrirAssinatura = useCallback((idx: number, tipo: "recebimento" | "requisicao") => {
        setSignIdx(idx);
        setSignTipo(tipo);
        setSignOpen(true);
    }, []);

    /* -------------------- Configuração dinâmica do Wizard por tipo -------------------- */
    const wizardStepTitlesForTipo = useMemo(() => {
        return tipoAtendimento === "terceiro"
            ? ["Atendimento", "Velório", "Sepultamento"]
            : wizardStepTitles;
    }, [tipoAtendimento]);

    const wizardStepIndexesForTipo = useMemo(() => {
        if (tipoAtendimento === "terceiro") {
            // Atendimento: Nome(0), Contato(1), Obs Atendimento(17)
            return [
                [0, 1, 17], // Atendimento (nenhum obrigatório)
                [11, 12, 13, 19], // Velório 01
                [14, 15, 16, 20], // Velório 02
            ];
        }
        return wizardStepIndexes;
    }, [tipoAtendimento]);

    const obrigatoriosForTipo = useMemo(() => {
        // No serviço de outra empresa, nada é obrigatório
        return tipoAtendimento === "terceiro" ? [] : obrigatorios;
    }, [tipoAtendimento]);

    /* -------------------- Resumos -------------------- */
    const materiaisSelecionadosResumo = useMemo(() => {
        const list: string[] = [];
        const mats = wizardData.materiais || materiais;
        Object.keys(mats || {}).forEach((key) => {
            const it = (mats as any)[key];
            if (it?.checked) {
                const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                list.push(`${label} (${it.qtd})`);
            }
        });
        return list.join(" • ");
    }, [wizardData.materiais, materiais]);

    const arrumacaoSelecionadaResumo = useMemo(() => {
        const mapa: { key: keyof ArrumacaoState; label: string }[] = [
            { key: "luvas", label: "Luvas" },
            { key: "palha", label: "Palha" },
            { key: "tamponamento", label: "Tamponamento" },
            { key: "maquiagem", label: "Maquiagem" },
            { key: "algodao", label: "Algodão" },
            { key: "cordao", label: "Cordão" },
            { key: "barba", label: "Barba" },
        ];
        const arr = wizardData.arrumacao || arrumacao;
        return mapa
            .filter((o) => (arr as any)[o.key])
            .map((o) => o.label)
            .join(" • ");
    }, [wizardData.arrumacao, arrumacao]);

    /* -------------------- Render -------------------- */
    return (
        <div className="p-6">
            <header className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Gestão de Atendimentos</h1>
                    <p className="text-sm text-muted-foreground">
                        Cadastre, acompanhe e atualize o status dos atendimentos.
                    </p>
                </div>
                <button
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                    onClick={() => setNovoTipoOpen(true)}
                >
                    Novo Registro
                </button>
            </header>

            <TabelaAtendimentos
                registros={registros}
                onAcao={(id) => abrirPopupAcaoPorId(id)}
                onInfo={(id) => abrirInfoPorId(id)}
            />

            <AvisosBox
                avisos={avisos}
                avisoMsg={avisoMsg}
                setAvisoMsg={setAvisoMsg}
                enviarAviso={enviarAviso}
                editarAviso={editarAviso}
                excluirAviso={excluirAviso}
                finalizarAviso={finalizarAviso}
                avisoInputRef={avisoInputRef}
            />

            <Wizard
                open={wizardOpen}
                onClose={() => setWizardOpen(false)}
                wizardTitle={wizardTitle}
                wizardStep={wizardStep}
                setWizardStep={setWizardStep}
                wizardRestrictGroup={wizardRestrictGroup}
                wizardData={wizardData}
                setWizardData={setWizardData}
                obrigatorios={obrigatoriosForTipo}
                steps={steps as any}
                wizardStepIndexes={wizardStepIndexesForTipo}
                wizardStepTitles={wizardStepTitlesForTipo}
                assistenciaVal={assistenciaVal}
                setAssistenciaVal={setAssistenciaVal}
                tanatoVal={tanatoVal}
                setTanatoVal={setTanatoVal}
                materiaisSelecionadosResumo={materiaisSelecionadosResumo}
                arrumacaoSelecionadaResumo={arrumacaoSelecionadaResumo}
                setMateriaisOpen={setMateriaisOpen}
                setArrumacaoOpen={setArrumacaoOpen}
                salvarGrupoWizard={salvarGrupoWizard}
                concluirWizard={concluirWizard}
                wizardSubmitting={wizardSubmitting}
            />

            <MateriaisModal
                open={materiaisOpen}
                setOpen={setMateriaisOpen}
                materiais={materiais}
                setMateriais={setMateriais}
                setWizardData={setWizardData}
            />

            <ArrumacaoModal
                open={arrumacaoOpen}
                setOpen={setArrumacaoOpen}
                arrumacao={arrumacao}
                setArrumacao={setArrumacao}
                setWizardData={setWizardData}
            />

            <AcaoModal
                open={acaoOpen}
                setOpen={setAcaoOpen}
                registros={registros}
                acaoId={acaoId}
                registrarAcao={registrarAcao}
                acaoMsg={acaoMsg}
                acaoSubmitting={acaoSubmitting}
            />

            <InfoModal
                open={infoOpen}
                setOpen={setInfoOpen}
                infoIdx={infoIdxResolved}
                abrirWizard={abrirWizardFromInfo}
                abrirAssinatura={(idx, tipo) => abrirAssinaturaFromInfo(idx, tipo)}
                registro={registroInfo}
            />

            <SignatureModal
                open={signOpen}
                onClose={() => setSignOpen(false)}
                registro={signIdx != null ? registros[signIdx] : undefined}
                tipo={signTipo}
                onSaved={() => {
                    fetchRegistros();
                }}
            />

            {/* Modal para escolher o tipo de novo registro */}
            <Modal
                open={novoTipoOpen}
                onClose={() => setNovoTipoOpen(false)}
                ariaLabel="Tipo de atendimento"
                maxWidth={420}
            >
                <h3 className="text-lg font-semibold">Selecione o tipo de atendimento</h3>
                <div className="mt-4 grid gap-3">
                    <button
                        className="w-full rounded-md border px-3 py-2 text-left hover:bg-muted"
                        onClick={() => {
                            setTipoAtendimento("funerario");
                            setNovoTipoOpen(false);
                            abrirWizard("novo");
                        }}
                    >
                        Atendimento Funerário
                        <div className="text-xs text-muted-foreground">
                            Fluxo completo (itens, ornamentação, etc.)
                        </div>
                    </button>

                    <button
                        className="w-full rounded-md border px-3 py-2 text-left hover:bg-muted"
                        onClick={() => {
                            setTipoAtendimento("terceiro");
                            setNovoTipoOpen(false);
                            abrirWizard("novo");
                        }}
                    >
                        Serviço de Outra Empresa
                        <div className="text-xs text-muted-foreground">
                            Apenas Atendimento (Nome/Contato/Observação) + Velório/Sepultamento
                        </div>
                    </button>
                </div>
            </Modal>
        </div>
    );
}
