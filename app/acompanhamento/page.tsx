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
    normalizarStatus, // ✅ importa a normalização
} from "./components/helpers";

import TabelaAtendimentos from "./components/TabelaAtendimentos";
import AvisosBox from "./components/AvisosBox";
import Wizard from "./components/Wizard";
import MateriaisModal from "./components/MateriaisModal";
import ArrumacaoModal from "./components/ArrumacaoModal";
import AcaoModal from "./components/AcaoModal";
import InfoModal from "./components/InfoModal";

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

    // selects
    const [assistenciaVal, setAssistenciaVal] = useState<string>("");
    const [tanatoVal, setTanatoVal] = useState<string>("");

    // Materiais
    const [materiaisOpen, setMateriaisOpen] = useState(false);
    const [materiais, setMateriais] = useState<MateriaisState>(defaultMateriais());

    // Arrumação
    const [arrumacaoOpen, setArrumacaoOpen] = useState(false);
    const [arrumacao, setArrumacao] = useState<ArrumacaoState>(defaultArrumacao());

    // Ações
    const [acaoOpen, setAcaoOpen] = useState(false);
    const [acaoId, setAcaoId] = useState<Registro["id"] | null>(null);
    const [acaoMsg, setAcaoMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [acaoSubmitting, setAcaoSubmitting] = useState(false);

    // Info
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoIdx, setInfoIdx] = useState<number | null>(null);

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

            if (r.status === 401) {
                return;
            }

            const data = await r.json().catch(() => null);
            if (data?.need_login) return;

            // ✅ normaliza status de todos os registros (corrige os antigos com rótulos)
            const sane: Registro[] = Array.isArray(data)
                ? data.map((it: any) => ({
                    ...it,
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
            const editing = tipo === "editar";
            setWizardEditing(editing);
            setWizardIdx(idx);
            setWizardRestrictGroup(grupoStep);
            setWizardStep(grupoStep ?? 0);
            setWizardMsg(null);
            setWizardTitle(editing ? "Editar Registro" : "Novo Registro");

            if (editing && idx !== null && registros[idx]) {
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
        const grupo = wizardStepIndexes[wizardStep];
        const next: Registro = { ...wizardData };

        for (const idx of grupo) {
            const s = (steps as any)[idx] as any;
            const el = document.getElementById("wizard-" + s.id) as
                | HTMLInputElement
                | HTMLTextAreaElement
                | null;
            const v = (el?.value ?? "").trim();

            if (obrigatorios.includes(s.id) && !v) {
                el?.focus();
                setWizardMsg({ text: "Preencha todos campos obrigatórios.", ok: false });
                return null;
            }
            (next as any)[s.id] = v;
        }

        if (wizardData.id != null) next.id = wizardData.id;

        (next as any).materiais = materiais;
        (next as any).arrumacao = arrumacao;

        setWizardData(next);
        return next;
    }, [wizardData, wizardStep, materiais, arrumacao]);

    const concluirWizard = useCallback(async () => {
        const dataAtualizada = salvarGrupoWizard();
        if (!dataAtualizada) return;

        let grupoObrigatorios: string[];
        if (typeof wizardRestrictGroup === "number") {
            const grupo = wizardStepIndexes[wizardRestrictGroup];
            const ids = grupo.map((i) => (steps as any)[i].id);
            grupoObrigatorios = ids.filter((id) => obrigatorios.includes(id));
        } else {
            grupoObrigatorios = obrigatorios;
        }

        for (const id of grupoObrigatorios) {
            if (!dataAtualizada[id] || String(dataAtualizada[id]).trim() === "") {
                setWizardMsg({ text: "Preencha todos campos obrigatórios.", ok: false });
                return;
            }
        }

        try {
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
        }
    }, [salvarGrupoWizard, wizardRestrictGroup, wizardEditing, fetchRegistros]);

    /* -------------------- Ações (status) -------------------- */

    const abrirPopupAcao = useCallback(
        (idx: number) => {
            const r = registros[idx];
            if (!r) return;
            setAcaoMsg(null);
            setAcaoId(r.id ?? null);
            setAcaoSubmitting(false);
            setAcaoOpen(true);
        },
        [registros]
    );

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
                    fetchRegistros();
                    setTimeout(() => setAcaoOpen(false), 500);
                } else {
                    setAcaoSubmitting(false);
                    setAcaoMsg({ text: json?.erro || "Erro ao atualizar status.", ok: false });
                }
            } catch (e: any) {
                setAcaoSubmitting(false);
                setAcaoMsg({ text: e?.message || "Erro ao atualizar status.", ok: false });
            }
        },
        [acaoId, fetchRegistros, acaoSubmitting]
    );

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
                    onClick={() => abrirWizard("novo")}
                >
                    Novo Registro
                </button>
            </header>

            <TabelaAtendimentos
                registros={registros}
                onAcao={(idx: number) => abrirPopupAcao(idx)}
                onInfo={(idx: number) => {
                    setInfoIdx(idx);
                    setInfoOpen(true);
                }}
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
                obrigatorios={obrigatorios}
                steps={steps as any}
                wizardStepIndexes={wizardStepIndexes}
                wizardStepTitles={wizardStepTitles}
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

            <InfoModal open={infoOpen} setOpen={setInfoOpen} infoIdx={infoIdx} abrirWizard={abrirWizard} />
        </div>
    );
}
