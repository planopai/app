'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Usuario = { id: number; nome: string; usuario: string };
type Pagina = { key: string; label: string };

const API_URL = '/api/php/pai_api.php';

/* parser robusto */
async function safeJsonFetch(input: RequestInfo, init?: RequestInit) {
    const r = await fetch(input, { cache: 'no-store', ...init });
    const txt = await r.text();
    const cleaned = txt.replace(/^\uFEFF/, '').trim();
    let json: any = null;

    if (!cleaned.startsWith('<')) {
        try { json = JSON.parse(cleaned); } catch {
            const m = cleaned.match(/\{[\s\S]*\}$/m);
            if (m) json = JSON.parse(m[0]);
        }
    }
    if (json == null) throw new Error(`Resposta não-JSON do backend:\n${cleaned.slice(0, 300)}${cleaned.length > 300 ? '…' : ''}`);
    if (!r.ok || json?.erro) throw new Error(json?.erro || json?.msg || `HTTP ${r.status}`);
    return json;
}

/** Lista consolidada das páginas (keys = slugs das pastas; labels = menu) */
const ALL_PAGES: Pagina[] = [
    { key: 'inicio', label: 'Início' },
    { key: 'quadro-atendimento', label: 'Quadro de Atendimento' },
    { key: 'acompanhamento', label: 'Acompanhamento' },
    { key: 'memorial', label: 'Memorial' },
    { key: 'obituario', label: 'Obituário' },
    { key: 'clube', label: 'Clube PAI' },
    { key: 'leads', label: 'Leads' },
    { key: 'coroa-de-flores', label: 'Coroa de Flores' },
    { key: 'relatorio', label: 'Relatório' },
    { key: 'administrativo', label: 'Administrativo' },
    // extras da árvore (caso usem no menu ou tela inicial)
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'api', label: 'API' },
    { key: 'atendimento', label: 'Atendimento' },
    { key: 'login', label: 'Login' },
    { key: 'medicos', label: 'Médicos' },
    { key: 'mensagens', label: 'Mensagens' },
    { key: 'noticias', label: 'Notícias' },
    { key: 'offline', label: 'Offline' },
    { key: 'parceiros', label: 'Parceiros' },
    { key: 'permissoes', label: 'Permissões' },
    { key: 'salas', label: 'Salas' },
    { key: 'seguranca', label: 'Segurança' },
    { key: 'sorteios', label: 'Sorteios' },
    { key: 'tela', label: 'Tela Inicial' },
    { key: 'telemetria', label: 'Telemetria' },
    { key: 'usuarios', label: 'Usuários' },
];

export default function PermissoesPage() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [userId, setUserId] = useState<number | null>(null);
    const [allowed, setAllowed] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchUsuarios = async () => {
        setLoading(true); setError(null);
        try {
            const j = await safeJsonFetch(`${API_URL}?action=list_users&_=${Date.now()}`);
            setUsuarios(j as Usuario[]);
        } catch (e: any) {
            setError(e.message || 'Erro ao carregar usuários.');
        } finally { setLoading(false); }
    };

    const fetchPerms = async (uid: number) => {
        setLoading(true); setError(null); setMsg(null);
        try {
            const j = await safeJsonFetch(`${API_URL}?action=list_permissions&user_id=${uid}&_=${Date.now()}`);
            const set: Record<string, boolean> = {};
            (j as string[]).forEach((k) => (set[k] = true));
            setAllowed(set);
        } catch (e: any) {
            setError(e.message || 'Erro ao carregar permissões.');
            setAllowed({});
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchUsuarios(); }, []);
    useEffect(() => { if (userId != null) fetchPerms(userId); }, [userId]);

    const toggle = (key: string) => setAllowed((prev) => ({ ...prev, [key]: !prev[key] }));

    const save = async () => {
        if (userId == null) return;
        setLoading(true); setMsg(null); setError(null);
        try {
            const selecionadas = Object.entries(allowed).filter(([, v]) => v).map(([k]) => k);
            await safeJsonFetch(`${API_URL}?action=save_permissions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, permissions: selecionadas }),
            });
            setMsg('Permissões salvas!');
        } catch (e: any) {
            setError(e.message || 'Erro ao salvar permissões.');
        } finally { setLoading(false); }
    };

    const currentUser = useMemo(() => usuarios.find((u) => u.id === userId), [userId, usuarios]);

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 font-[var(--font-nunito,_inherit)]">
            <h1 className="text-xl sm:text-2xl font-semibold mb-4">Permissões por usuário</h1>

            <div className="rounded-2xl shadow p-4 mb-6">
                <label className="block text-sm mb-1">Usuário</label>
                <select
                    className="border rounded-lg px-3 py-2 w-full sm:w-96"
                    value={userId ?? ''}
                    onChange={(e) => setUserId(e.target.value ? parseInt(e.target.value) : null)}
                >
                    <option value="">Selecione...</option>
                    {usuarios.map((u) => (
                        <option key={u.id} value={u.id}>
                            #{u.id} – {u.nome} ({u.usuario})
                        </option>
                    ))}
                </select>
            </div>

            {userId != null && (
                <div className="rounded-2xl shadow p-4">
                    <h2 className="text-lg font-medium mb-3">
                        Páginas liberadas para {currentUser?.nome} ({currentUser?.usuario})
                    </h2>

                    {msg && <p className="text-green-700 mb-2">{msg}</p>}
                    {error && <p className="text-red-600 mb-2">{error}</p>}

                    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {ALL_PAGES.map((p) => (
                            <li key={p.key} className="flex items-center gap-2">
                                <input
                                    id={`pg-${p.key}`}
                                    type="checkbox"
                                    checked={!!allowed[p.key]}
                                    onChange={() => toggle(p.key)}
                                />
                                <label htmlFor={`pg-${p.key}`}>{p.label}</label>
                            </li>
                        ))}
                    </ul>

                    <div className="mt-4">
                        <button
                            onClick={save}
                            disabled={loading}
                            className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                        >
                            Salvar permissões
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
