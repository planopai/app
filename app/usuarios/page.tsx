'use client';

/**
 * Colaboradores e usuários (/usuarios) — 05/11/2026.
 *
 * Junta o cadastro do colaborador (RH) e o acesso ao app numa tela só (decisão do usuário em 05/11/2026):
 * - lista única: colaboradores (rh_colaborador) e acessos sem colaborador (sócios, prestadores);
 * - ficha com abas: Dados e contrato · Acesso ao app · Pagamento · Histórico;
 * - "Função" = cargo da carteira; "Grupo de acesso" = o que o sistema chama de cargo (tabela cargos);
 * - login opcional; desligar bloqueia o login na hora; usuário não é excluído, é bloqueado;
 * - permissões extras continuam na tela Permissões.
 * Back-end: rh_colaboradores.php (novo). Só a Gestão acessa.
 * Visual e peças no mesmo padrão da tela anterior (diálogo no computador, folha de baixo no celular, Esc fecha).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    IconAlertTriangle,
    IconCheck,
    IconCopy,
    IconEye,
    IconEyeOff,
    IconKey,
    IconLock,
    IconLockOpen,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconShieldLock,
    IconUserMinus,
    IconUserPlus,
    IconX,
} from '@tabler/icons-react';

/* ============================== tipos ============================== */

type Pessoa = {
    colaborador_id: number | null;
    nome: string;
    funcao: string | null;
    vinculo: string | null;
    situacao: string | null;
    data_admissao: string | null;
    data_desligamento: string | null;
    codigo_dominio: string | null;
    usuario_id: number | null;
    login: string | null;
    grupo: string | null;
    acesso_ativo: number | null;
};
type Grupo = { id: number; nome: string; slug: string; descricao?: string | null };
type Historico = { id: number; data_evento: string; tipo: string; descricao: string | null; valor_anterior: string | null; valor_novo: string | null; criado_por: string | null };

type Form = {
    id: number | null;
    nome: string;
    funcao: string;
    cbo: string;
    codigo_dominio: string;
    vinculo: string;
    situacao: string;
    data_admissao: string;
    salario_base: string;
    cpf: string;
    telefone: string;
    email: string;
    departamento: string;
    filial: string;
    pix_tipo: string;
    pix_chave: string;
    banco: string;
    agencia: string;
    conta: string;
    observacao: string;
    data_desligamento: string;
    tipo_desligamento: string;
    motivo_desligamento: string;
};

const FORM_VAZIO: Form = {
    id: null, nome: '', funcao: '', cbo: '', codigo_dominio: '', vinculo: 'CLT', situacao: 'ATIVO', data_admissao: '', salario_base: '',
    cpf: '', telefone: '', email: '', departamento: '', filial: '', pix_tipo: '', pix_chave: '', banco: '', agencia: '', conta: '',
    observacao: '', data_desligamento: '', tipo_desligamento: '', motivo_desligamento: '',
};

const API_URL = 'https://api.planoassistencialintegrado.com.br/rh_colaboradores.php';

/* ============================== API ============================== */

class SessaoExpirada extends Error {}

async function api(acao: string, corpo?: Record<string, unknown>, extra = '') {
    const r = await fetch(`${API_URL}?action=${acao}${extra}${corpo ? '' : `&_=${Date.now()}`}`, {
        cache: 'no-store',
        credentials: 'include',
        ...(corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {}),
    });
    if (r.status === 401) throw new SessaoExpirada('Sessão expirada.');
    const txt = (await r.text()).replace(/^﻿/, '').trim();
    let json: any = null;
    try {
        json = JSON.parse(txt);
    } catch {
        /* segue */
    }
    if (json?.need_login) throw new SessaoExpirada('Sessão expirada.');
    if (json == null) throw new Error('O servidor não respondeu como esperado. Tente de novo.');
    if (json.erro) throw new Error(json.msg || 'Não foi possível concluir. Tente de novo.');
    return json;
}

/* ============================== utilidades ============================== */

const semAcento = (s: string) =>
    String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

function limparLogin(s: string) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9._-]/g, '');
}
const sugerirLogin = (nome: string) => limparLogin(String(nome || '').trim().split(/\s+/)[0] || '');

function iniciais(nome: string) {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function gerarSenha() {
    const letras = 'abcdefghjkmnpqrstuvwxyz';
    const numeros = '23456789';
    const sorteia = (s: string) => s[Math.floor((window.crypto?.getRandomValues?.(new Uint32Array(1))[0] ?? Math.random() * 1e9) % s.length)];
    let out = '';
    for (let i = 0; i < 5; i++) out += sorteia(letras);
    out = out.charAt(0).toUpperCase() + out.slice(1);
    for (let i = 0; i < 3; i++) out += sorteia(numeros);
    return out;
}

const dataBR = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const valorBR = (v?: string | number | null) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const SITUACAO: Record<string, { rotulo: string; cls: string }> = {
    ATIVO: { rotulo: 'Ativo', cls: 'bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]' },
    FERIAS: { rotulo: 'Férias', cls: 'bg-[#E9EFF6] text-[#2E5277] dark:bg-[#3D6A99]/25 dark:text-[#C9D8EA]' },
    AFASTADO: { rotulo: 'Afastado', cls: 'bg-[#FCF3CC] text-[#7A5D00] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]' },
    DESLIGADO: { rotulo: 'Desligado', cls: 'bg-[#F1F4F8] text-[#5B6478] dark:bg-white/[0.08] dark:text-[#AEB9CF]' },
};
const TIPO_HIST: Record<string, string> = {
    ADMISSAO: 'Admissão', FUNCAO: 'Função', SALARIO: 'Salário', FERIAS: 'Férias', AFASTAMENTO: 'Afastamento',
    RETORNO: 'Retorno', DESLIGAMENTO: 'Desligamento', OBSERVACAO: 'Observação',
};

/* ============================== estilos ============================== */

const CAMPO =
    'h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:ring-2 focus:ring-[#3D6A99]/30 disabled:opacity-60 dark:bg-[#1C2334] dark:text-white';
const ROTULO = 'mb-1.5 block text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]';
const BTN_SEC =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-3.5 text-[14px] font-extrabold text-[#313C55] transition hover:border-[#313C55] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white';
const BTN_PRI =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#313C55] px-4 text-[14px] font-extrabold text-white transition hover:bg-[#232B40] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]';
const BTN_PERIGO =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#B42318] px-4 text-[14px] font-extrabold text-white hover:bg-[#962016] disabled:opacity-50';
const CARTAO = 'rounded-2xl border border-[#E3E8F0] bg-white shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F]';
const SELO = 'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[12px] font-bold';

/* ============================== peças ============================== */

function NoCorpo({ children }: { children: React.ReactNode }) {
    const [ok, setOk] = useState(false);
    useEffect(() => setOk(true), []);
    return ok ? createPortal(children, document.body) : null;
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={ativo}
            className={[
                'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 text-[14px] font-bold transition',
                ativo
                    ? 'border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]'
                    : 'border-[#E3E8F0] bg-white text-[#313C55] hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#C8CFDC]',
            ].join(' ')}
        >
            {children}
        </button>
    );
}

function Avatar({ nome, apagado }: { nome: string; apagado?: boolean }) {
    return (
        <span
            className={`grid size-10 shrink-0 place-items-center rounded-full text-[14px] font-extrabold ${
                apagado ? 'bg-[#F1F4F8] text-[#98A1B3] dark:bg-white/[0.06] dark:text-[#7A8396]' : 'bg-[#E9EFF6] text-[#2E5277] dark:bg-[#3D6A99]/25 dark:text-[#C9D8EA]'
            }`}
        >
            {iniciais(nome)}
        </span>
    );
}

function Campo({ rotulo, children, className = '' }: { rotulo: string; children: React.ReactNode; className?: string }) {
    return (
        <label className={`block ${className}`}>
            <span className={ROTULO}>{rotulo}</span>
            {children}
        </label>
    );
}

function SeloAcesso({ p, grupos }: { p: Pessoa; grupos: Grupo[] }) {
    if (!p.usuario_id) return <span className={`${SELO} border border-[#E3E8F0] text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]`}>Sem login</span>;
    if (!p.acesso_ativo)
        return (
            <span className={`${SELO} bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]`}>
                <IconLock size={13} /> Bloqueado
            </span>
        );
    if (!p.grupo)
        return (
            <span className={`${SELO} border border-[#E4BC30] text-[#7A5D00] dark:border-[#F2CB3F]/60 dark:text-[#F2CB3F]`}>
                <IconAlertTriangle size={13} /> Sem grupo
            </span>
        );
    return <span className={`${SELO} bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-[#DDE3EE]`}>{grupos.find((g) => g.slug === p.grupo)?.nome || p.grupo}</span>;
}

function SeloSituacao({ s }: { s: string | null }) {
    if (!s) return <span className={`${SELO} border border-[#E3E8F0] text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]`}>Só acesso</span>;
    const c = SITUACAO[s] || SITUACAO.ATIVO;
    return <span className={`${SELO} ${c.cls}`}>{c.rotulo}</span>;
}

/* ============================== página ============================== */

type Filtro = 'ativos' | 'desligados' | 'sem_login' | 'so_acesso' | 'todos';
type Aba = 'dados' | 'acesso' | 'pagamento' | 'historico';

export default function ColaboradoresUsuariosPage() {
    const [pessoas, setPessoas] = useState<Pessoa[]>([]);
    const [grupos, setGrupos] = useState<Grupo[]>([]);
    const [tiposDeslig, setTiposDeslig] = useState<string[]>([]);
    const [euId, setEuId] = useState<number | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erroLista, setErroLista] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [busca, setBusca] = useState('');
    const [filtro, setFiltro] = useState<Filtro>('ativos');

    // janela
    const [aberta, setAberta] = useState(false);
    const [modo, setModo] = useState<'colaborador' | 'acesso'>('colaborador');
    const [aba, setAba] = useState<Aba>('dados');
    const [f, setF] = useState<Form>(FORM_VAZIO);
    const [historico, setHistorico] = useState<Historico[]>([]);
    const [carregandoFicha, setCarregandoFicha] = useState(false);

    // acesso
    const [usuarioId, setUsuarioId] = useState<number | null>(null);
    const [acessoAtivo, setAcessoAtivo] = useState(true);
    const [temAcesso, setTemAcesso] = useState(false);
    const [ligarExistente, setLigarExistente] = useState<number | ''>('');
    const [login, setLogin] = useState('');
    const [loginTocado, setLoginTocado] = useState(false);
    const [grupo, setGrupo] = useState('');
    const [senha, setSenha] = useState('');
    const [verSenha, setVerSenha] = useState(false);
    const [trocarSenha, setTrocarSenha] = useState(false);
    const [copiado, setCopiado] = useState(false);

    // ações
    const [salvando, setSalvando] = useState(false);
    const [erroForm, setErroForm] = useState<string | null>(null);
    const [desligando, setDesligando] = useState(false);
    const [novoHist, setNovoHist] = useState({ tipo: 'OBSERVACAO', data: hojeISO(), descricao: '' });
    const nomeRef = useRef<HTMLInputElement>(null);

    const irParaLogin = () => {
        window.location.href = '/login';
    };
    const tratarErro = (e: any, padrao: string, set: (m: string) => void) => {
        if (e instanceof SessaoExpirada) return irParaLogin();
        set(e?.message || padrao);
    };

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErroLista(null);
        try {
            const j = await api('painel');
            setPessoas(Array.isArray(j.dados?.pessoas) ? j.dados.pessoas : []);
            setGrupos(Array.isArray(j.dados?.grupos) ? j.dados.grupos.map((g: any) => ({ ...g, id: Number(g.id) })) : []);
            setTiposDeslig(Array.isArray(j.dados?.tipos_desligamento) ? j.dados.tipos_desligamento : []);
            setEuId(j.dados?.eu?.id != null ? Number(j.dados.eu.id) : null);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível carregar a lista.', setErroLista);
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    useEffect(() => {
        if (!aviso) return;
        const t = window.setTimeout(() => setAviso(null), 3500);
        return () => window.clearTimeout(t);
    }, [aviso]);

    /* ---- lista ---- */
    const ehAtivo = (p: Pessoa) => (p.colaborador_id ? p.situacao !== 'DESLIGADO' : !!p.acesso_ativo);
    const contagem = useMemo(
        () => ({
            ativos: pessoas.filter(ehAtivo).length,
            desligados: pessoas.filter((p) => p.situacao === 'DESLIGADO' || (!p.colaborador_id && !p.acesso_ativo)).length,
            sem_login: pessoas.filter((p) => p.colaborador_id && !p.usuario_id && p.situacao !== 'DESLIGADO').length,
            so_acesso: pessoas.filter((p) => !p.colaborador_id).length,
            todos: pessoas.length,
        }),
        [pessoas],
    );

    const filtrados = useMemo(() => {
        const q = semAcento(busca);
        return pessoas.filter((p) => {
            if (filtro === 'ativos' && !ehAtivo(p)) return false;
            if (filtro === 'desligados' && !(p.situacao === 'DESLIGADO' || (!p.colaborador_id && !p.acesso_ativo))) return false;
            if (filtro === 'sem_login' && !(p.colaborador_id && !p.usuario_id && p.situacao !== 'DESLIGADO')) return false;
            if (filtro === 'so_acesso' && p.colaborador_id) return false;
            if (q && !semAcento(`${p.nome} ${p.login || ''} ${p.funcao || ''}`).includes(q)) return false;
            return true;
        });
    }, [pessoas, busca, filtro]);

    const loginsSemColaborador = useMemo(() => pessoas.filter((p) => !p.colaborador_id && p.usuario_id), [pessoas]);

    /* ---- janela ---- */
    const limparAcesso = () => {
        setUsuarioId(null);
        setAcessoAtivo(true);
        setTemAcesso(false);
        setLigarExistente('');
        setLogin('');
        setLoginTocado(false);
        setGrupo('');
        setSenha('');
        setVerSenha(false);
        setTrocarSenha(false);
    };

    const abrirNovo = (m: 'colaborador' | 'acesso') => {
        setModo(m);
        setAba(m === 'acesso' ? 'acesso' : 'dados');
        setF({ ...FORM_VAZIO, data_admissao: hojeISO() });
        setHistorico([]);
        limparAcesso();
        if (m === 'acesso') {
            setTemAcesso(true);
            setSenha(gerarSenha());
            setVerSenha(true);
            setTrocarSenha(true);
        }
        setErroForm(null);
        setDesligando(false);
        setAberta(true);
    };

    const abrir = async (p: Pessoa) => {
        setErroForm(null);
        setDesligando(false);
        limparAcesso();
        setHistorico([]);
        if (p.usuario_id) {
            setUsuarioId(p.usuario_id);
            setTemAcesso(true);
            setLogin(p.login || '');
            setLoginTocado(true);
            setGrupo(p.grupo || '');
            setAcessoAtivo(!!p.acesso_ativo);
        }
        if (!p.colaborador_id) {
            setModo('acesso');
            setAba('acesso');
            setF({ ...FORM_VAZIO, nome: p.nome });
            setAberta(true);
            return;
        }
        setModo('colaborador');
        setAba('dados');
        setF({ ...FORM_VAZIO, id: p.colaborador_id, nome: p.nome, funcao: p.funcao || '', situacao: p.situacao || 'ATIVO' });
        setAberta(true);
        setCarregandoFicha(true);
        try {
            const j = await api('ficha', undefined, `&id=${p.colaborador_id}`);
            const c = j.dados?.colaborador || {};
            setF({
                id: Number(c.id),
                nome: c.nome || '',
                funcao: c.cargo || '',
                cbo: c.cbo || '',
                codigo_dominio: c.codigo_dominio || '',
                vinculo: c.vinculo || 'CLT',
                situacao: c.situacao || 'ATIVO',
                data_admissao: c.data_admissao || '',
                salario_base: c.salario_base != null ? valorBR(c.salario_base) : '',
                cpf: c.cpf || '',
                telefone: c.telefone || '',
                email: c.email || '',
                departamento: c.departamento || '',
                filial: c.filial || '',
                pix_tipo: c.pix_tipo || '',
                pix_chave: c.pix_chave || '',
                banco: c.banco || '',
                agencia: c.agencia || '',
                conta: c.conta || '',
                observacao: c.observacao || '',
                data_desligamento: c.data_desligamento || '',
                tipo_desligamento: c.tipo_desligamento || '',
                motivo_desligamento: c.motivo_desligamento || '',
            });
            setHistorico(Array.isArray(j.dados?.historico) ? j.dados.historico : []);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível abrir a ficha.', setErroForm);
        } finally {
            setCarregandoFicha(false);
        }
    };

    const fechar = useCallback(() => {
        if (salvando) return;
        setAberta(false);
    }, [salvando]);

    useEffect(() => {
        if (!aberta) return;
        const html = document.documentElement;
        const antes = html.style.overflow;
        html.style.overflow = 'hidden';
        const esc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') fechar();
        };
        window.addEventListener('keydown', esc);
        const t = window.setTimeout(() => nomeRef.current?.focus(), 60);
        return () => {
            html.style.overflow = antes;
            window.removeEventListener('keydown', esc);
            window.clearTimeout(t);
        };
    }, [aberta, fechar]);

    const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const v = e.target.value;
        setF((x) => ({ ...x, [k]: v }));
        if (k === 'nome' && !loginTocado && !usuarioId) setLogin(sugerirLogin(v));
    };

    const loginRepetido = useMemo(() => {
        const l = limparLogin(login);
        return !!l && !ligarExistente && pessoas.some((p) => p.usuario_id && p.usuario_id !== usuarioId && limparLogin(p.login || '') === l);
    }, [login, pessoas, usuarioId, ligarExistente]);

    const souEu = usuarioId != null && usuarioId === euId;
    const desligado = f.situacao === 'DESLIGADO';

    /* ---- salvar ---- */
    const salvar = async () => {
        setErroForm(null);
        const nome = f.nome.trim().replace(/\s+/g, ' ');
        if (!nome) return setErroForm('Preencha o nome.');
        let acesso: Record<string, unknown> | null = null;
        if (temAcesso) {
            if (ligarExistente) {
                const alvo = pessoas.find((p) => p.usuario_id === ligarExistente);
                acesso = { vincular_usuario_id: ligarExistente, login: alvo?.login || '', grupo: alvo?.grupo || '' };
            } else {
                const l = limparLogin(login);
                if (!l) return setErroForm('Preencha o login.');
                if (loginRepetido) return setErroForm(`Já existe um usuário com o login "${l}".`);
                if (!usuarioId && senha.trim().length < 6) return setErroForm('A senha precisa ter pelo menos 6 caracteres.');
                if (usuarioId && trocarSenha && senha.trim() && senha.trim().length < 6) return setErroForm('A nova senha precisa ter pelo menos 6 caracteres.');
                acesso = { usuario_id: usuarioId || 0, login: l, grupo, senha: trocarSenha || !usuarioId ? senha.trim() : '' };
            }
        }
        setSalvando(true);
        try {
            if (modo === 'acesso') {
                await api('acesso_salvar', { nome, ...(acesso || {}) });
            } else {
                await api('salvar', { colaborador: { ...f, nome }, acesso });
            }
            setAberta(false);
            setAviso(f.id || usuarioId ? `Alterações de ${nome} salvas.` : `${nome} cadastrado.`);
            await carregar();
        } catch (e: any) {
            tratarErro(e, 'Não foi possível salvar.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    const desligar = async () => {
        setErroForm(null);
        if (!f.data_desligamento || !f.tipo_desligamento || !f.motivo_desligamento.trim()) return setErroForm('Informe a data, o tipo e o motivo do desligamento.');
        setSalvando(true);
        try {
            await api('desligar', { id: f.id, data: f.data_desligamento, tipo: f.tipo_desligamento, motivo: f.motivo_desligamento.trim() });
            setAberta(false);
            setAviso(`${f.nome} desligado. O acesso ao app foi bloqueado.`);
            await carregar();
        } catch (e: any) {
            tratarErro(e, 'Não foi possível desligar.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    const reativar = async () => {
        setSalvando(true);
        setErroForm(null);
        try {
            await api('reativar', { id: f.id });
            setAberta(false);
            setAviso(`${f.nome} reativado. Libere o acesso ao app, se ele usar.`);
            await carregar();
        } catch (e: any) {
            tratarErro(e, 'Não foi possível reativar.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    const alternarAcesso = async () => {
        if (!usuarioId) return;
        setSalvando(true);
        setErroForm(null);
        try {
            await api('acesso_ativo', { usuario_id: usuarioId, ativo: !acessoAtivo });
            setAcessoAtivo(!acessoAtivo);
            setAviso(!acessoAtivo ? 'Acesso liberado.' : 'Acesso bloqueado.');
            await carregar();
        } catch (e: any) {
            tratarErro(e, 'Não foi possível alterar o acesso.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    const lancarHistorico = async () => {
        if (!f.id) return;
        if (!novoHist.descricao.trim()) return setErroForm('Descreva o lançamento.');
        setSalvando(true);
        setErroForm(null);
        try {
            await api('historico_incluir', { id: f.id, ...novoHist, descricao: novoHist.descricao.trim() });
            const j = await api('ficha', undefined, `&id=${f.id}`);
            setHistorico(Array.isArray(j.dados?.historico) ? j.dados.historico : []);
            setNovoHist({ tipo: 'OBSERVACAO', data: hojeISO(), descricao: '' });
        } catch (e: any) {
            tratarErro(e, 'Não foi possível lançar.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    const copiarSenha = async () => {
        try {
            await navigator.clipboard.writeText(senha);
            setCopiado(true);
            window.setTimeout(() => setCopiado(false), 1600);
        } catch {
            /* sem área de transferência */
        }
    };

    const abas: { k: Aba; rotulo: string }[] =
        modo === 'acesso'
            ? [{ k: 'acesso', rotulo: 'Acesso ao app' }]
            : [
                  { k: 'dados', rotulo: 'Dados e contrato' },
                  { k: 'acesso', rotulo: 'Acesso ao app' },
                  { k: 'pagamento', rotulo: 'Pagamento' },
                  ...(f.id ? [{ k: 'historico' as Aba, rotulo: 'Histórico' }] : []),
              ];

    /* ============================== render ============================== */

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
                <header className="mb-4 flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[24px] font-extrabold leading-tight lg:text-[28px]">Colaboradores e usuários</h1>
                    </div>
                    <button type="button" onClick={() => void carregar()} disabled={carregando} className={`${BTN_SEC} w-11 px-0`} aria-label="Atualizar" title="Atualizar">
                        <IconRefresh size={18} className={carregando ? 'animate-spin' : ''} />
                    </button>
                    <button type="button" onClick={() => abrirNovo('acesso')} className={BTN_SEC}>
                        <IconKey size={18} />
                        <span className="hidden sm:inline">Só acesso</span>
                    </button>
                    <button type="button" onClick={() => abrirNovo('colaborador')} className={BTN_PRI}>
                        <IconPlus size={18} stroke={2.2} />
                        <span className="hidden sm:inline">Novo colaborador</span>
                        <span className="sm:hidden">Novo</span>
                    </button>
                </header>

                {erroLista ? (
                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#F3B8B2] bg-[#FDECEA] px-4 py-3 text-[14px] font-semibold text-[#B42318] dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                        <span className="min-w-0 flex-1">{erroLista}</span>
                        <button type="button" onClick={() => void carregar()} className="min-h-11 shrink-0 rounded-lg px-3 font-extrabold underline underline-offset-4">
                            Tentar de novo
                        </button>
                    </div>
                ) : null}
                {aviso ? (
                    <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-[#7BA11A]/50 bg-[#EEF5D6] px-4 py-3 text-[14px] font-semibold text-[#3F5A0A] dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]">
                        <IconCheck size={18} />
                        {aviso}
                    </div>
                ) : null}

                <div className={`${CARTAO} mb-4 p-3 sm:p-4`}>
                    <div className="relative">
                        <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8396]" />
                        <input
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            placeholder="Buscar por nome, login ou função"
                            aria-label="Buscar"
                            className={`${CAMPO} pl-10 ${busca ? 'pr-11' : ''}`}
                            autoComplete="off"
                        />
                        {busca ? (
                            <button
                                type="button"
                                onClick={() => setBusca('')}
                                aria-label="Limpar busca"
                                className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-[#5B6478] hover:bg-[#E3E8F0] dark:text-[#AEB9CF] dark:hover:bg-white/[0.08]"
                            >
                                <IconX size={18} />
                            </button>
                        ) : null}
                    </div>
                    <div className="-mx-3 mt-3 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
                        <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
                            {(
                                [
                                    ['ativos', 'Ativos'],
                                    ['sem_login', 'Sem login'],
                                    ['so_acesso', 'Só acesso'],
                                    ['desligados', 'Desligados e bloqueados'],
                                    ['todos', 'Todos'],
                                ] as [Filtro, string][]
                            ).map(([k, r]) => (
                                <Chip key={k} ativo={filtro === k} onClick={() => setFiltro(k)}>
                                    {r} <span className="opacity-70">{contagem[k]}</span>
                                </Chip>
                            ))}
                        </div>
                    </div>
                </div>

                <div className={`${CARTAO} overflow-hidden`}>
                    <div className="border-b border-[#E3E8F0] px-4 py-3 text-[15px] font-extrabold dark:border-white/[0.08]">
                        {carregando && pessoas.length === 0 ? 'Carregando…' : `${filtrados.length} ${filtrados.length === 1 ? 'pessoa' : 'pessoas'}`}
                    </div>

                    {carregando && pessoas.length === 0 ? (
                        <ul aria-hidden="true">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <li key={i} className="flex items-center gap-3 border-b border-[#EEF1F6] px-4 py-3 last:border-b-0 dark:border-white/[0.06]">
                                    <span className="size-10 animate-pulse rounded-full bg-[#E9EEF5] dark:bg-white/[0.08]" />
                                    <span className="h-4 w-1/3 animate-pulse rounded bg-[#E9EEF5] dark:bg-white/[0.08]" />
                                </li>
                            ))}
                        </ul>
                    ) : filtrados.length === 0 ? (
                        <div className="p-8 text-center">
                            <p className="text-[15px] font-extrabold">Ninguém encontrado.</p>
                            {busca || filtro !== 'ativos' ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBusca('');
                                        setFiltro('ativos');
                                    }}
                                    className={`${BTN_SEC} mt-3`}
                                >
                                    Limpar busca e filtro
                                </button>
                            ) : null}
                        </div>
                    ) : (
                        <>
                            <table className="hidden w-full text-left lg:table">
                                <thead>
                                    <tr className="border-b border-[#E3E8F0] text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:border-white/[0.08] dark:text-[#AEB9CF]">
                                        <th className="py-2.5 pl-4 pr-4">Nome</th>
                                        <th className="py-2.5 pr-4">Função</th>
                                        <th className="py-2.5 pr-4">Situação</th>
                                        <th className="py-2.5 pr-4">Login</th>
                                        <th className="py-2.5 pr-4">Grupo de acesso</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtrados.map((p) => (
                                        <tr
                                            key={`${p.colaborador_id ?? 'u'}-${p.usuario_id ?? 'c'}`}
                                            onClick={() => void abrir(p)}
                                            className="cursor-pointer border-b border-[#EEF1F6] transition last:border-b-0 hover:bg-[#F6F8FB] dark:border-white/[0.06] dark:hover:bg-white/[0.03]"
                                        >
                                            <td className="py-2.5 pl-4 pr-4">
                                                <div className="flex items-center gap-3">
                                                    <Avatar nome={p.nome} apagado={!ehAtivo(p)} />
                                                    <span className="text-[15px] font-extrabold">{p.nome}</span>
                                                    {p.usuario_id && p.usuario_id === euId ? (
                                                        <span className="rounded-md bg-[#F2CB3F] px-1.5 py-0.5 text-[11px] font-extrabold text-[#313C55]">Você</span>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td className="py-2.5 pr-4 text-[14px]">{p.funcao || '—'}</td>
                                            <td className="py-2.5 pr-4">
                                                <SeloSituacao s={p.situacao} />
                                            </td>
                                            <td className="py-2.5 pr-4 font-mono text-[14px] text-[#4A5368] dark:text-[#C8CFDC]">{p.login || '—'}</td>
                                            <td className="py-2.5 pr-4">
                                                <SeloAcesso p={p} grupos={grupos} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <ul className="lg:hidden">
                                {filtrados.map((p) => (
                                    <li key={`${p.colaborador_id ?? 'u'}-${p.usuario_id ?? 'c'}`} className="border-b border-[#EEF1F6] last:border-b-0 dark:border-white/[0.06]">
                                        <button type="button" onClick={() => void abrir(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                                            <Avatar nome={p.nome} apagado={!ehAtivo(p)} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[15px] font-extrabold">{p.nome}</span>
                                                <span className="mt-0.5 block truncate text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{p.funcao || (p.login ? `login ${p.login}` : '')}</span>
                                                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                                    <SeloSituacao s={p.situacao} />
                                                    <SeloAcesso p={p} grupos={grupos} />
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            </div>

            {/* ============================== Ficha ============================== */}
            {aberta ? (
                <NoCorpo>
                    <div
                        data-pai-overlay
                        role="dialog"
                        aria-modal="true"
                        aria-label={f.nome || 'Cadastro'}
                        className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) fechar();
                        }}
                    >
                        <div className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white lg:rounded-2xl">
                            <div className="flex items-center gap-3 border-b border-[#E3E8F0] px-5 py-3.5 dark:border-white/[0.08]">
                                {f.nome ? <Avatar nome={f.nome} apagado={desligado} /> : null}
                                <div className="min-w-0 flex-1">
                                    <h2 className="truncate text-[18px] font-extrabold">
                                        {f.nome || (modo === 'acesso' ? 'Novo acesso' : 'Novo colaborador')}
                                    </h2>
                                    <div className="mt-0.5 flex flex-wrap gap-1.5">
                                        {modo === 'colaborador' && f.id ? <SeloSituacao s={f.situacao} /> : null}
                                        {modo === 'acesso' ? <SeloSituacao s={null} /> : null}
                                    </div>
                                </div>
                                <button type="button" onClick={fechar} aria-label="Fechar" className="grid size-11 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]">
                                    <IconX size={20} />
                                </button>
                            </div>

                            {abas.length > 1 ? (
                                <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-[#E3E8F0] px-3 [scrollbar-width:none] dark:border-white/[0.08]">
                                    {abas.map((a) => (
                                        <button
                                            key={a.k}
                                            role="tab"
                                            aria-selected={aba === a.k}
                                            type="button"
                                            onClick={() => setAba(a.k)}
                                            className={`min-h-12 shrink-0 whitespace-nowrap border-b-[3px] px-3 text-[14px] font-extrabold ${
                                                aba === a.k ? 'border-[#F2CB3F] text-[#313C55] dark:text-white' : 'border-transparent text-[#5B6478] dark:text-[#AEB9CF]'
                                            }`}
                                        >
                                            {a.rotulo}
                                        </button>
                                    ))}
                                </div>
                            ) : null}

                            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
                                {carregandoFicha ? <p className="text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Carregando a ficha…</p> : null}

                                {/* ---------- Dados e contrato ---------- */}
                                {aba === 'dados' && modo === 'colaborador' ? (
                                    <>
                                        <Campo rotulo="Nome completo">
                                            <input ref={nomeRef} value={f.nome} onChange={set('nome')} className={CAMPO} autoComplete="off" disabled={desligado} />
                                        </Campo>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <Campo rotulo="Função">
                                                <input value={f.funcao} onChange={set('funcao')} placeholder="Ex.: Agente Funerário" className={CAMPO} disabled={desligado} />
                                            </Campo>
                                            <Campo rotulo="CBO">
                                                <input value={f.cbo} onChange={set('cbo')} inputMode="numeric" className={CAMPO} disabled={desligado} />
                                            </Campo>
                                            <Campo rotulo="Vínculo">
                                                <select value={f.vinculo} onChange={set('vinculo')} className={CAMPO} disabled={desligado}>
                                                    <option value="CLT">CLT</option>
                                                    <option value="PRESTADOR">Prestador de serviço</option>
                                                    <option value="ESTAGIO">Estágio</option>
                                                </select>
                                            </Campo>
                                            <Campo rotulo="Situação">
                                                <select value={f.situacao} onChange={set('situacao')} className={CAMPO} disabled={desligado}>
                                                    {desligado ? <option value="DESLIGADO">Desligado</option> : null}
                                                    <option value="ATIVO">Ativo</option>
                                                    <option value="FERIAS">Férias</option>
                                                    <option value="AFASTADO">Afastado</option>
                                                </select>
                                            </Campo>
                                            <Campo rotulo="Admissão">
                                                <input type="date" value={f.data_admissao} onChange={set('data_admissao')} className={CAMPO} disabled={desligado} />
                                            </Campo>
                                            <Campo rotulo="Salário base (R$)">
                                                <input value={f.salario_base} onChange={set('salario_base')} inputMode="decimal" placeholder="0,00" className={CAMPO} disabled={desligado} />
                                            </Campo>
                                            <Campo rotulo="CPF">
                                                <input value={f.cpf} onChange={set('cpf')} inputMode="numeric" className={CAMPO} disabled={desligado} />
                                            </Campo>
                                            <Campo rotulo="Telefone">
                                                <input value={f.telefone} onChange={set('telefone')} inputMode="tel" className={CAMPO} disabled={desligado} />
                                            </Campo>
                                            <Campo rotulo="E-mail">
                                                <input value={f.email} onChange={set('email')} inputMode="email" className={CAMPO} disabled={desligado} />
                                            </Campo>
                                            <Campo rotulo="Código no Domínio">
                                                <input value={f.codigo_dominio} onChange={set('codigo_dominio')} inputMode="numeric" className={CAMPO} disabled={desligado} />
                                            </Campo>
                                        </div>
                                        <Campo rotulo="Observação">
                                            <textarea value={f.observacao} onChange={set('observacao')} rows={2} className={`${CAMPO} h-auto py-3`} disabled={desligado} />
                                        </Campo>

                                        {/* Desligamento */}
                                        {f.id ? (
                                            <div className="border-t border-[#E3E8F0] pt-4 dark:border-white/[0.08]">
                                                {desligado ? (
                                                    <div className="space-y-3">
                                                        <p className="text-[14px]">
                                                            Desligado em <b>{dataBR(f.data_desligamento)}</b> · {f.tipo_desligamento}
                                                            {f.motivo_desligamento ? ` · ${f.motivo_desligamento}` : ''}
                                                        </p>
                                                        <button type="button" onClick={() => void reativar()} disabled={salvando} className={BTN_SEC}>
                                                            <IconUserPlus size={18} />
                                                            Reativar colaborador
                                                        </button>
                                                    </div>
                                                ) : desligando ? (
                                                    <div className="space-y-3 rounded-xl border border-[#F3B8B2] bg-[#FDECEA] p-3 dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10">
                                                        <div className="grid gap-3 sm:grid-cols-2">
                                                            <Campo rotulo="Data do desligamento">
                                                                <input type="date" value={f.data_desligamento} onChange={set('data_desligamento')} className={CAMPO} />
                                                            </Campo>
                                                            <Campo rotulo="Tipo">
                                                                <select value={f.tipo_desligamento} onChange={set('tipo_desligamento')} className={CAMPO}>
                                                                    <option value="">Escolha</option>
                                                                    {tiposDeslig.map((t) => (
                                                                        <option key={t} value={t}>
                                                                            {t}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </Campo>
                                                        </div>
                                                        <Campo rotulo="Motivo">
                                                            <input value={f.motivo_desligamento} onChange={set('motivo_desligamento')} className={CAMPO} />
                                                        </Campo>
                                                        <p className="text-[13px] font-semibold text-[#B42318] dark:text-[#FF9C92]">O acesso ao app é bloqueado na hora. A ficha e o histórico ficam guardados.</p>
                                                        <div className="flex gap-2">
                                                            <button type="button" onClick={() => setDesligando(false)} disabled={salvando} className={`${BTN_SEC} flex-1`}>
                                                                Cancelar
                                                            </button>
                                                            <button type="button" onClick={() => void desligar()} disabled={salvando} className={`${BTN_PERIGO} flex-1`}>
                                                                <IconUserMinus size={18} />
                                                                Desligar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : souEu ? null : (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setDesligando(true);
                                                            setF((x) => ({ ...x, data_desligamento: x.data_desligamento || hojeISO() }));
                                                        }}
                                                        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-[14px] font-bold text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/10"
                                                    >
                                                        <IconUserMinus size={18} />
                                                        Desligar colaborador
                                                    </button>
                                                )}
                                            </div>
                                        ) : null}
                                    </>
                                ) : null}

                                {/* ---------- Acesso ao app ---------- */}
                                {aba === 'acesso' ? (
                                    <>
                                        {modo === 'acesso' ? (
                                            <Campo rotulo="Nome completo">
                                                <input ref={nomeRef} value={f.nome} onChange={set('nome')} placeholder="Ex.: Maria das Dores" className={CAMPO} autoComplete="off" />
                                            </Campo>
                                        ) : null}

                                        {modo === 'colaborador' && !usuarioId ? (
                                            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-[#F6F8FB] px-3.5 dark:bg-[#1C2334]">
                                                <input
                                                    type="checkbox"
                                                    checked={temAcesso}
                                                    disabled={desligado}
                                                    onChange={(e) => {
                                                        setTemAcesso(e.target.checked);
                                                        if (e.target.checked && !senha) {
                                                            setSenha(gerarSenha());
                                                            setVerSenha(true);
                                                            setTrocarSenha(true);
                                                            if (!login) setLogin(sugerirLogin(f.nome));
                                                        }
                                                    }}
                                                    className="size-5 accent-[#313C55]"
                                                />
                                                <span className="text-[15px] font-bold">Usa o app (tem login)</span>
                                            </label>
                                        ) : null}

                                        {temAcesso ? (
                                            <>
                                                {modo === 'colaborador' && !usuarioId && loginsSemColaborador.length ? (
                                                    <Campo rotulo="Ligar a um login que já existe">
                                                        <select value={ligarExistente} onChange={(e) => setLigarExistente(e.target.value ? Number(e.target.value) : '')} className={CAMPO}>
                                                            <option value="">Não, criar um login novo</option>
                                                            {loginsSemColaborador.map((p) => (
                                                                <option key={p.usuario_id!} value={p.usuario_id!}>
                                                                    {p.nome} ({p.login})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </Campo>
                                                ) : null}

                                                {!ligarExistente ? (
                                                    <>
                                                        <Campo rotulo="Login">
                                                            <input
                                                                value={login}
                                                                onChange={(e) => {
                                                                    setLoginTocado(true);
                                                                    setLogin(limparLogin(e.target.value));
                                                                }}
                                                                placeholder="Ex.: maria"
                                                                className={`${CAMPO} font-mono`}
                                                                autoComplete="off"
                                                                autoCapitalize="none"
                                                                spellCheck={false}
                                                                disabled={desligado}
                                                            />
                                                            {loginRepetido ? (
                                                                <span className="mt-1.5 block text-[13px] font-bold text-[#B42318] dark:text-[#FF9C92]">Já existe um usuário com este login.</span>
                                                            ) : null}
                                                        </Campo>

                                                        <Campo rotulo="Grupo de acesso">
                                                            <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className={CAMPO} disabled={desligado || souEu}>
                                                                <option value="">Sem grupo</option>
                                                                {grupos.map((g) => (
                                                                    <option key={g.slug} value={g.slug}>
                                                                        {g.nome}
                                                                    </option>
                                                                ))}
                                                                {grupo && !grupos.some((g) => g.slug === grupo) ? <option value={grupo}>{grupo} (inativo)</option> : null}
                                                            </select>
                                                            {!grupo ? (
                                                                <span className="mt-1.5 flex items-start gap-1.5 text-[13px] text-[#7A5D00] dark:text-[#F2CB3F]">
                                                                    <IconAlertTriangle size={15} className="mt-0.5 shrink-0" />
                                                                    Sem grupo, a pessoa entra no app mas não vê nenhuma tela.
                                                                </span>
                                                            ) : grupos.find((g) => g.slug === grupo)?.descricao ? (
                                                                <span className="mt-1.5 block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{grupos.find((g) => g.slug === grupo)?.descricao}</span>
                                                            ) : null}
                                                        </Campo>

                                                        <div>
                                                            <span className={ROTULO}>Senha</span>
                                                            {usuarioId && !trocarSenha ? (
                                                                <button
                                                                    type="button"
                                                                    disabled={desligado}
                                                                    onClick={() => {
                                                                        setTrocarSenha(true);
                                                                        setSenha(gerarSenha());
                                                                        setVerSenha(true);
                                                                    }}
                                                                    className={`${BTN_SEC} w-full`}
                                                                >
                                                                    <IconKey size={18} />
                                                                    Trocar a senha
                                                                </button>
                                                            ) : (
                                                                <>
                                                                    <div className="flex gap-2">
                                                                        <div className="relative min-w-0 flex-1">
                                                                            <input
                                                                                type={verSenha ? 'text' : 'password'}
                                                                                value={senha}
                                                                                onChange={(e) => setSenha(e.target.value)}
                                                                                placeholder="Mínimo de 6 caracteres"
                                                                                className={`${CAMPO} pr-12 font-mono`}
                                                                                autoComplete="new-password"
                                                                                autoCapitalize="none"
                                                                                spellCheck={false}
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setVerSenha((v) => !v)}
                                                                                aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                                                                                className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-[#5B6478] hover:bg-[#E3E8F0] dark:text-[#AEB9CF] dark:hover:bg-white/[0.08]"
                                                                            >
                                                                                {verSenha ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                                                                            </button>
                                                                        </div>
                                                                        <button type="button" onClick={copiarSenha} disabled={!senha} className={`${BTN_SEC} w-12 px-0`} aria-label="Copiar senha" title="Copiar senha">
                                                                            {copiado ? <IconCheck size={18} /> : <IconCopy size={18} />}
                                                                        </button>
                                                                    </div>
                                                                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setSenha(gerarSenha());
                                                                                setVerSenha(true);
                                                                            }}
                                                                            className="min-h-11 text-[13px] font-bold text-[#3D6A99] underline underline-offset-4 dark:text-[#A9BED6]"
                                                                        >
                                                                            Gerar outra senha
                                                                        </button>
                                                                        {usuarioId ? (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setTrocarSenha(false);
                                                                                    setSenha('');
                                                                                }}
                                                                                className="min-h-11 text-[13px] font-bold text-[#5B6478] underline underline-offset-4 dark:text-[#AEB9CF]"
                                                                            >
                                                                                Manter a senha atual
                                                                            </button>
                                                                        ) : null}
                                                                    </div>
                                                                    <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Copie e entregue a senha para a pessoa. Depois de salvar, ela não aparece de novo.</p>
                                                                </>
                                                            )}
                                                        </div>
                                                    </>
                                                ) : null}

                                                {usuarioId ? (
                                                    <div className="flex flex-wrap gap-2 border-t border-[#E3E8F0] pt-4 dark:border-white/[0.08]">
                                                        <a href="/permissoes" className={BTN_SEC}>
                                                            <IconShieldLock size={18} />
                                                            Permissões extras
                                                        </a>
                                                        {souEu ? null : acessoAtivo ? (
                                                            <button type="button" onClick={() => void alternarAcesso()} disabled={salvando} className={`${BTN_SEC} text-[#B42318] dark:text-[#FF9C92]`}>
                                                                <IconLock size={18} />
                                                                Bloquear acesso
                                                            </button>
                                                        ) : (
                                                            <button type="button" onClick={() => void alternarAcesso()} disabled={salvando || desligado} className={BTN_SEC}>
                                                                <IconLockOpen size={18} />
                                                                Liberar acesso
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </>
                                        ) : null}
                                    </>
                                ) : null}

                                {/* ---------- Pagamento ---------- */}
                                {aba === 'pagamento' ? (
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Campo rotulo="Tipo da chave Pix">
                                            <select value={f.pix_tipo} onChange={set('pix_tipo')} className={CAMPO} disabled={desligado}>
                                                <option value="">Sem Pix</option>
                                                <option value="CPF">CPF</option>
                                                <option value="CELULAR">Celular</option>
                                                <option value="EMAIL">E-mail</option>
                                                <option value="ALEATORIA">Chave aleatória</option>
                                            </select>
                                        </Campo>
                                        <Campo rotulo="Chave Pix">
                                            <input value={f.pix_chave} onChange={set('pix_chave')} className={CAMPO} disabled={desligado || !f.pix_tipo} />
                                        </Campo>
                                        <Campo rotulo="Banco (código)">
                                            <input value={f.banco} onChange={set('banco')} inputMode="numeric" placeholder="Ex.: 001" className={CAMPO} disabled={desligado} />
                                        </Campo>
                                        <Campo rotulo="Agência">
                                            <input value={f.agencia} onChange={set('agencia')} inputMode="numeric" className={CAMPO} disabled={desligado} />
                                        </Campo>
                                        <Campo rotulo="Conta" className="sm:col-span-2">
                                            <input value={f.conta} onChange={set('conta')} className={CAMPO} disabled={desligado} />
                                        </Campo>
                                    </div>
                                ) : null}

                                {/* ---------- Histórico ---------- */}
                                {aba === 'historico' ? (
                                    <>
                                        <div className="space-y-3 rounded-xl bg-[#F6F8FB] p-3 dark:bg-[#1C2334]">
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <Campo rotulo="Tipo">
                                                    <select value={novoHist.tipo} onChange={(e) => setNovoHist((x) => ({ ...x, tipo: e.target.value }))} className={CAMPO}>
                                                        <option value="OBSERVACAO">Observação</option>
                                                        <option value="FERIAS">Férias</option>
                                                        <option value="AFASTAMENTO">Afastamento</option>
                                                        <option value="RETORNO">Retorno</option>
                                                    </select>
                                                </Campo>
                                                <Campo rotulo="Data">
                                                    <input type="date" value={novoHist.data} onChange={(e) => setNovoHist((x) => ({ ...x, data: e.target.value }))} className={CAMPO} />
                                                </Campo>
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    value={novoHist.descricao}
                                                    onChange={(e) => setNovoHist((x) => ({ ...x, descricao: e.target.value }))}
                                                    placeholder="O que aconteceu"
                                                    aria-label="Descrição"
                                                    className={CAMPO}
                                                />
                                                <button type="button" onClick={() => void lancarHistorico()} disabled={salvando} className={`${BTN_PRI} shrink-0`}>
                                                    Lançar
                                                </button>
                                            </div>
                                        </div>
                                        <ol className="space-y-2">
                                            {historico.length === 0 ? <li className="text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Nada lançado ainda.</li> : null}
                                            {historico.map((h) => (
                                                <li key={h.id} className="rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.08]">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-[13px] font-extrabold">{dataBR(h.data_evento)}</span>
                                                        <span className={`${SELO} bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-[#DDE3EE]`}>{TIPO_HIST[h.tipo] || h.tipo}</span>
                                                        {h.criado_por ? <span className="ml-auto text-[12px] text-[#7A8396]">{h.criado_por}</span> : null}
                                                    </div>
                                                    {h.descricao ? <p className="mt-1 text-[14px]">{h.descricao}</p> : null}
                                                    {h.valor_anterior || h.valor_novo ? (
                                                        <p className="mt-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                            {h.valor_anterior || '—'} → {h.valor_novo || '—'}
                                                        </p>
                                                    ) : null}
                                                </li>
                                            ))}
                                        </ol>
                                    </>
                                ) : null}

                                {erroForm ? (
                                    <div role="alert" className="rounded-xl border border-[#F3B8B2] bg-[#FDECEA] px-3.5 py-2.5 text-[14px] font-semibold text-[#B42318] dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                                        {erroForm}
                                    </div>
                                ) : null}
                            </div>

                            <div className="flex shrink-0 justify-end gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] dark:border-white/[0.08] dark:bg-[#1C2334]">
                                <button type="button" onClick={fechar} disabled={salvando} className={`${BTN_SEC} flex-1 lg:flex-none`}>
                                    {desligado ? 'Fechar' : 'Cancelar'}
                                </button>
                                {!desligado && aba !== 'historico' ? (
                                    <button type="button" onClick={() => void salvar()} disabled={salvando || loginRepetido || carregandoFicha} className={`${BTN_PRI} flex-1 lg:flex-none`}>
                                        {salvando ? 'Salvando…' : f.id || usuarioId ? 'Salvar' : 'Cadastrar'}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </NoCorpo>
            ) : null}
        </div>
    );
}
