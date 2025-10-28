'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Usuario = { id: number; nome: string; usuario: string };
type Pagina = { key: string; label: string };

const API_URL = '/api/php/pai_api.php';

/* ---------------- parser robusto (tolera BOM/HTML/HTML) ---------------- */
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

export default function PermissoesPage() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [pages, setPages] = useState<Pagina[]>([]);
    const [userId, setUserId] = useState<number | null>(null);
    const [allowed, setAllowed] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    /* ---------------- fetchers ---------------- */
    const fetchUsuarios = async () => {
        setLoading(true); setError(null);
        try {
            const j = await safeJsonFetch(`${API_URL}?action=list_users&_=${Date.now()}`);
            setUsuarios(j as Usuario[]);
        } catch (e: any) {
            setError(e.message || 'Erro ao carregar usuários.');
        } finally { setLoading(false); }
    };

    const fetchPages = async () => {
        try {
            const j = await safeJsonFetch(`${API_URL}?action=list_pages&_=${Date.now()}`);
            setPages(j as Pagina[]);
        } catch {
            setPages([]);
        }
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

    useEffect(() => { fetchUsuarios(); fetchPages(); }, []);
    useEffect(() => { if (userId != null) fetchPerms(userId); }, [userId]);

    /* ---------------- ações ---------------- */
    const toggle = (key: string) => setAllowed((prev) => ({ ...prev, [key]: !prev[key] }));

    const marcarTudo = () => {
        setAllowed((prev) => {
            const next: Record<string, boolean> = { ...prev };
            for (const p of pages) next[p.key] = true;
            return next;
        });
    };

    const desmarcarTudo = () => {
        setAllowed((prev) => {
            const next: Record<string, boolean> = { ...prev };
            for (const p of pages) next[p.key] = false;
            return next;
        });
    };

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

    /* ---------------- render ---------------- */
    return (
        <div className="w-full px-3 sm:px-6 lg:px-10 pt-10 pb-14 md:pt-12 md:pb-16 lg:pt-16 lg:pb-24 font-[var(--font-nunito,_inherit)]">
            <h1 className="text-2xl md:text-3xl font-semibold mb-6 md:mb-8">Permissões por usuário</h1>

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
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <h2 className="text-lg font-medium">
                            Páginas liberadas para {currentUser?.nome} ({currentUser?.usuario})
                        </h2>
                        <div className="flex gap-2">
                            <button
                                onClick={marcarTudo}
                                className="px-3 py-2 rounded-xl border text-sm"
                                disabled={loading || pages.length === 0}
                                title="Marcar todas as páginas"
                            >
                                Marcar tudo
                            </button>
                            <button
                                onClick={desmarcarTudo}
                                className="px-3 py-2 rounded-xl border text-sm"
                                disabled={loading || pages.length === 0}
                                title="Desmarcar todas as páginas"
                            >
                                Desmarcar tudo
                            </button>
                        </div>
                    </div>

                    {msg && <p className="text-green-700 mt-2">{msg}</p>}
                    {error && <p className="text-red-600 mt-2">{error}</p>}

                    <ul className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {pages.map((p) => (
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
                        {pages.length === 0 && (
                            <li className="text-sm text-muted-foreground col-span-full">
                                Nenhuma página disponível.
                            </li>
                        )}
                    </ul>

                    <div className="mt-5">
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
