'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Usuario = { id: number; nome: string; usuario: string };

const API_URL = '/api/php/pai_api.php';

/* ---------------- parser robusto (tolera BOM/HTML) ---------------- */
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

/* ---------------- Modal simples ---------------- */
function Modal({
    open,
    onClose,
    title,
    children,
    footer,
    maxWidth = 560,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: number;
}) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div
                className="relative w-full rounded-2xl bg-white shadow-xl"
                style={{ maxWidth }}
            >
                <div className="px-5 py-4 border-b">
                    <h3 className="text-lg font-semibold">{title}</h3>
                </div>
                <div className="px-5 py-4">{children}</div>
                {footer && <div className="px-5 py-4 border-t flex justify-end gap-2">{footer}</div>}
            </div>
        </div>
    );
}

export default function UsuariosPage() {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // modal
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [nome, setNome] = useState('');
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');

    const resetForm = () => { setEditingId(null); setNome(''); setUsuario(''); setSenha(''); };

    const fetchUsuarios = async () => {
        setLoading(true); setError(null);
        try {
            const j = await safeJsonFetch(`${API_URL}?action=list_users&_=${Date.now()}`);
            setUsuarios(j as Usuario[]);
        } catch (e: any) {
            setUsuarios([]);
            setError(e?.message || 'Erro ao listar usuários.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsuarios(); }, []);

    const openCreate = () => { resetForm(); setOpen(true); };
    const openEdit = (u: Usuario) => { setEditingId(u.id); setNome(u.nome); setUsuario(u.usuario); setSenha(''); setOpen(true); };

    const title = useMemo(
        () => (editingId == null ? 'Novo usuário' : `Editar usuário #${editingId}`),
        [editingId]
    );

    const save = async () => {
        setError(null);
        if (!nome.trim() || !usuario.trim() || (editingId == null && !senha.trim())) {
            setError(editingId == null ? 'Preencha nome, usuário e senha.' : 'Preencha nome e usuário.');
            return;
        }
        setLoading(true);
        try {
            const action = editingId == null ? 'create_user' : 'update_user';
            await safeJsonFetch(`${API_URL}?action=${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingId ?? undefined, nome, usuario, senha }),
            });
            await fetchUsuarios();
            setOpen(false);
            resetForm();
        } catch (e: any) {
            setError(e?.message || 'Erro ao salvar.');
        } finally {
            setLoading(false);
        }
    };

    const excluir = async () => {
        if (editingId == null) return;
        if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
        setLoading(true);
        try {
            await safeJsonFetch(`${API_URL}?action=delete_user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editingId }),
            });
            await fetchUsuarios();
            setOpen(false);
            resetForm();
        } catch (e: any) {
            setError(e?.message || 'Erro ao excluir.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 font-[var(--font-nunito,_inherit)]">
            <div className="flex items-center justify-between gap-3 mb-4">
                <h1 className="text-xl sm:text-2xl font-semibold">Usuários</h1>
                <button
                    onClick={openCreate}
                    className="rounded-xl bg-black text-white px-4 py-2 text-sm"
                >
                    Novo usuário
                </button>
            </div>

            {error && <p className="text-red-600 mb-3">{error}</p>}

            {/* Tabela responsiva: evita vazamento no mobile */}
            <div className="rounded-2xl shadow overflow-x-auto">
                <table className="min-w-full table-fixed">
                    <colgroup>
                        <col className="w-20" />
                        <col />
                        <col className="w-40" />
                        <col className="w-28" />
                    </colgroup>
                    <thead>
                        <tr className="bg-gray-50 text-left">
                            <th className="px-4 py-3">ID</th>
                            <th className="px-4 py-3">Nome</th>
                            <th className="px-4 py-3">Usuário</th>
                            <th className="px-4 py-3">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        {usuarios.map((u) => (
                            <tr key={u.id} className="border-t">
                                <td className="px-4 py-2 truncate">{u.id}</td>
                                <td className="px-4 py-2 truncate">{u.nome}</td>
                                <td className="px-4 py-2 truncate">{u.usuario}</td>
                                <td className="px-4 py-2">
                                    <button
                                        className="px-3 py-1 rounded-lg border w-full sm:w-auto"
                                        onClick={() => openEdit(u)}
                                        disabled={loading}
                                    >
                                        Editar
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {usuarios.length === 0 && !loading && (
                            <tr>
                                <td className="px-4 py-6 text-center text-gray-500" colSpan={4}>
                                    Nenhum usuário encontrado.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title={title}
                maxWidth={520}
                footer={
                    <>
                        {editingId != null && (
                            <button
                                onClick={excluir}
                                className="px-4 py-2 rounded-xl bg-red-600 text-white disabled:opacity-50"
                                disabled={loading}
                            >
                                Excluir
                            </button>
                        )}
                        <button
                            onClick={() => setOpen(false)}
                            className="px-4 py-2 rounded-xl border"
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={save}
                            className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                            disabled={loading}
                        >
                            {editingId == null ? 'Adicionar' : 'Salvar'}
                        </button>
                    </>
                }
            >
                <div className="grid gap-3">
                    <div>
                        <label className="block text-sm mb-1">Nome</label>
                        <input
                            className="w-full border rounded-lg px-3 py-2"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Usuário</label>
                        <input
                            className="w-full border rounded-lg px-3 py-2"
                            value={usuario}
                            onChange={(e) => setUsuario(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm mb-1">
                            Senha {editingId != null && <span className="opacity-60 text-xs">(em branco = manter)</span>}
                        </label>
                        <input
                            className="w-full border rounded-lg px-3 py-2"
                            type="password"
                            value={senha}
                            onChange={(e) => setSenha(e.target.value)}
                        />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
