'use client';

import React, { useMemo, useState } from 'react';

/** =======================
 *  Tipos
 *  ======================= */
type Categoria = {
    id: string;
    nome: string;
    slug: string;
    icon?: string; // opcional para ícone/emoji
};

type Endereco = {
    titulo?: string;
    rua: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade: string;
    uf: string;
    cep?: string;
    mapaUrl?: string;
};

type Contato = {
    site?: string;
    whatsapp?: string;
    telefone?: string;
    email?: string;
    instagram?: string;
};

type Beneficio = {
    titulo: string;
    descontoPercentual?: number; // ex.: 15 => 15%
    descontoValor?: number; // ex.: 20 => R$ 20
    comoUsar: string; // instruções
    regras: string[]; // bullets
    validadeInicio?: string; // ISO ou texto
    validadeFim?: string;    // ISO ou texto
    observacoes?: string;
};

type Parceiro = {
    id: string;
    nome: string;
    slug: string;
    descricaoCurta: string;
    logoUrl?: string;
    capaUrl?: string;
    categorias: string[]; // ids de categoria
    ativo: boolean;
    beneficio: Beneficio;
    enderecos: Endereco[];
    contato: Contato;
    tags?: string[];
};

/** =======================
 *  MOCK de dados
 *  (trocar por fetch/SSR depois)
 *  ======================= */
const CATEGORIAS: Categoria[] = [
    { id: 'farmacias', nome: 'Farmácias', slug: 'farmacias', icon: '💊' },
    { id: 'mercados', nome: 'Mercados', slug: 'mercados', icon: '🛒' },
    { id: 'academias', nome: 'Academias', slug: 'academias', icon: '🏋️' },
    { id: 'manutencao', nome: 'Manutenção', slug: 'manutencao', icon: '🛠️' },
    { id: 'construcao', nome: 'Construção', slug: 'construcao', icon: '🧱' },
    { id: 'educacao', nome: 'Educação', slug: 'educacao', icon: '🎓' },
    { id: 'gratuitos', nome: 'Gratuitos', slug: 'gratuitos', icon: '🎁' },
];

const PARCEIROS: Parceiro[] = [
    {
        id: 'p1',
        nome: 'Academia Boa Forma',
        slug: 'academia-boa-forma',
        descricaoCurta: 'Planos mensais e aulas coletivas.',
        logoUrl: 'https://via.placeholder.com/160x160.png?text=Academia',
        categorias: ['academias'],
        ativo: true,
        beneficio: {
            titulo: 'Desconto em planos',
            descontoPercentual: 20,
            comoUsar:
                'Apresente sua carteirinha digital do PAI na recepção e mencione o código **PAI20** no ato da matrícula.',
            regras: [
                'Válido apenas para novos contratos.',
                'Não cumulativo com outras promoções.',
                'Necessário documento com foto.',
            ],
            observacoes: 'Benefício aplicável somente em unidades participantes.',
        },
        enderecos: [
            {
                titulo: 'Unidade Centro',
                rua: 'Rua das Palmeiras',
                numero: '123',
                bairro: 'Centro',
                cidade: 'Belo Horizonte',
                uf: 'MG',
                cep: '30100-000',
                mapaUrl:
                    'https://www.google.com/maps/search/?api=1&query=Rua+das+Palmeiras+123+Belo+Horizonte',
            },
        ],
        contato: {
            site: 'https://academia-exemplo.com',
            whatsapp: '5531999990000',
            telefone: '(31) 99999-0000',
            instagram: 'https://instagram.com/academia',
            email: 'contato@academia-exemplo.com',
        },
        tags: ['Academia', 'Musculação', 'Aulas coletivas'],
    },
    {
        id: 'p2',
        nome: 'Clínica Vet Amigo',
        slug: 'clinica-vet-amigo',
        descricaoCurta: 'Consultas, vacinas e banho & tosa.',
        logoUrl: 'https://via.placeholder.com/160x160.png?text=Vet',
        categorias: ['manutencao'],
        ativo: true,
        beneficio: {
            titulo: 'Check-up Pet',
            descontoPercentual: 15,
            comoUsar:
                'Agende pelo WhatsApp e informe que é **associado PAI**. No local, apresente sua carteirinha.',
            regras: [
                'Agendamento sujeito à disponibilidade.',
                'Exames laboratoriais não inclusos.',
            ],
        },
        enderecos: [
            {
                rua: 'Av. Brasil',
                numero: '500',
                bairro: 'Jardim',
                cidade: 'Curitiba',
                uf: 'PR',
                mapaUrl:
                    'https://www.google.com/maps/search/?api=1&query=Av+Brasil+500+Curitiba',
            },
        ],
        contato: {
            whatsapp: '5541999991111',
            telefone: '(41) 99999-1111',
            instagram: 'https://instagram.com/clinica.vet',
        },
        tags: ['Vet', 'Banho & tosa'],
    },
    {
        id: 'p3',
        nome: 'Pizzaria La Nonna',
        slug: 'pizzaria-la-nonna',
        descricaoCurta: 'Pizzas artesanais no forno a lenha.',
        logoUrl: 'https://via.placeholder.com/160x160.png?text=Pizza',
        categorias: ['mercados'],
        ativo: true,
        beneficio: {
            titulo: 'Rodízio com desconto',
            descontoValor: 10,
            comoUsar:
                'Peça ao garçom para aplicar o **convênio PAI** e apresente um documento com foto.',
            regras: ['Válido de segunda a quinta.', 'Não inclui bebidas.'],
        },
        enderecos: [
            {
                rua: 'Rua Itália',
                numero: '45',
                bairro: 'Bela Vista',
                cidade: 'São Paulo',
                uf: 'SP',
                mapaUrl:
                    'https://www.google.com/maps/search/?api=1&query=Rua+Italia+45+Sao+Paulo',
            },
        ],
        contato: {
            telefone: '(11) 4002-8922',
            instagram: 'https://instagram.com/lanonna.pizza',
        },
        tags: ['Restaurante', 'Rodízio'],
    },
];

/** =======================
 *  Helpers
 *  ======================= */
function maskWhatsApp(phone?: string) {
    if (!phone) return '';
    // Ex.: 5531999990000 -> +55 (31) 99999-0000
    const only = phone.replace(/\D/g, '');
    if (only.length < 12) return phone;
    const country = only.slice(0, 2);
    const ddd = only.slice(2, 4);
    const first = only.slice(4, 9);
    const last = only.slice(9);
    return `+${country} (${ddd}) ${first}-${last}`;
}

function classNames(...xs: Array<string | undefined | false>) {
    return xs.filter(Boolean).join(' ');
}

/** =======================
 *  Página
 *  ======================= */
export default function ClubePublicPage() {
    const [query, setQuery] = useState('');
    const [categoria, setCategoria] = useState<string | null>(null);
    const [selecionado, setSelecionado] = useState<Parceiro | null>(null);

    const categoriasComContagem = useMemo(() => {
        return CATEGORIAS.map((c) => ({
            ...c,
            total: PARCEIROS.filter(
                (p) => p.ativo && p.categorias.includes(c.id)
            ).length,
        }));
    }, []);

    const parceirosFiltrados = useMemo(() => {
        const q = query.trim().toLowerCase();
        return PARCEIROS.filter((p) => p.ativo)
            .filter((p) => (categoria ? p.categorias.includes(categoria) : true))
            .filter((p) => {
                if (!q) return true;
                const txt = [
                    p.nome,
                    p.descricaoCurta,
                    ...(p.tags ?? []),
                    ...p.categorias.map(
                        (id) => CATEGORIAS.find((c) => c.id === id)?.nome ?? ''
                    ),
                ]
                    .join(' ')
                    .toLowerCase();
                return txt.includes(q);
            });
    }, [categoria, query]);

    return (
        <div className="container">
            {/* Header simples */}
            <header className="topbar">
                <div className="brand">
                    <div className="logo" aria-hidden>
                        🟡
                    </div>
                    <div>
                        <strong>PAI</strong> <span>Clube de Benefícios</span>
                    </div>
                </div>

                <div className="search">
                    <input
                        type="search"
                        placeholder="O que você procura?"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Buscar parceiros"
                    />
                </div>
            </header>

            {/* Filtros por categoria */}
            <section className="categories">
                <button
                    className={classNames('chip', !categoria && 'chip--active')}
                    onClick={() => setCategoria(null)}
                >
                    Todas
                </button>

                {categoriasComContagem.map((c) => (
                    <button
                        key={c.id}
                        className={classNames(
                            'chip',
                            categoria === c.id && 'chip--active',
                            c.total === 0 && 'chip--disabled'
                        )}
                        onClick={() => setCategoria((prev) => (prev === c.id ? null : c.id))}
                        disabled={c.total === 0}
                        title={`${c.nome} (${c.total})`}
                    >
                        <span className="chip-icon">{c.icon ?? '🏷️'}</span>
                        {c.nome}
                        <span className="chip-count">{c.total}</span>
                    </button>
                ))}
            </section>

            {/* Grid de parceiros */}
            <section className="grid">
                {parceirosFiltrados.length === 0 && (
                    <p className="muted">Nenhum parceiro encontrado.</p>
                )}

                {parceirosFiltrados.map((p) => (
                    <article
                        key={p.id}
                        className="card"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelecionado(p)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelecionado(p)}
                    >
                        <div className="card-media">
                            {/* Imagem/Logo */}
                            <img
                                src={p.logoUrl || 'https://via.placeholder.com/160'}
                                alt={`Logo de ${p.nome}`}
                                loading="lazy"
                            />
                        </div>

                        <div className="card-body">
                            <h3 className="card-title">{p.nome}</h3>
                            <p className="card-desc">{p.descricaoCurta}</p>

                            {/* Destaque do benefício */}
                            <div className="badge">
                                {p.beneficio.descontoPercentual
                                    ? `${p.beneficio.descontoPercentual}% OFF`
                                    : p.beneficio.descontoValor
                                        ? `R$ ${p.beneficio.descontoValor} OFF`
                                        : p.beneficio.titulo}
                            </div>

                            {/* Tags */}
                            {p.tags && p.tags.length > 0 && (
                                <ul className="tags">
                                    {p.tags.map((t) => (
                                        <li key={t}>{t}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </article>
                ))}
            </section>

            {/* Modal de detalhes */}
            {selecionado && (
                <DetalheParceiro parceiro={selecionado} onClose={() => setSelecionado(null)} />
            )}

            {/* Estilos locais */}
            <style jsx>{`
        :root {
          --bg: #ffffff;
          --text: #0f172a;
          --muted: #64748b;
          --primary: #0ea5e9;
          --primary-700: #0369a1;
          --chip: #eef2ff;
          --chip-active: #dbeafe;
          --border: #e2e8f0;
          --card: #ffffff;
          --shadow: 0 4px 14px rgba(2, 6, 23, 0.08);
          --radius: 14px;
        }
        * {
          box-sizing: border-box;
        }
        .container {
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
        }
        .topbar {
          position: sticky;
          top: 0;
          z-index: 10;
          display: grid;
          grid-template-columns: 260px 1fr;
          align-items: center;
          gap: 16px;
          padding: 16px 24px;
          background: linear-gradient(0deg, #0ea5e9, #0ea5e9);
          color: #fff;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 18px;
        }
        .brand strong {
          font-weight: 800;
          letter-spacing: 0.5px;
        }
        .brand span {
          opacity: 0.9;
          font-weight: 500;
        }
        .logo {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.2);
        }
        .search input {
          width: 100%;
          padding: 12px 16px;
          background: #fff;
          color: #111827;
          border-radius: 999px;
          border: 0;
          outline: none;
        }

        .categories {
          display: flex;
          gap: 10px;
          padding: 18px 24px;
          overflow-x: auto;
          background: #f8fafc;
          border-bottom: 1px solid var(--border);
        }
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          background: var(--chip);
          border: 1px solid rgba(99, 102, 241, 0.15);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .chip:hover {
          transform: translateY(-1px);
          background: var(--chip-active);
        }
        .chip--active {
          background: var(--chip-active);
          border-color: #60a5fa;
          box-shadow: inset 0 0 0 1px #93c5fd;
        }
        .chip--disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .chip-icon {
          font-size: 16px;
        }
        .chip-count {
          padding: 2px 8px;
          border-radius: 999px;
          background: #e5e7eb;
          color: #111827;
          font-size: 12px;
        }

        .grid {
          padding: 24px;
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 18px;
        }
        @media (max-width: 1200px) {
          .grid {
            grid-template-columns: repeat(8, 1fr);
          }
        }
        @media (max-width: 768px) {
          .grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        @media (max-width: 520px) {
          .grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .card {
          grid-column: span 3;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          overflow: hidden;
          display: grid;
          grid-template-rows: auto 1fr;
          cursor: pointer;
          transition: transform 0.16s ease, box-shadow 0.16s ease;
        }
        .card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(2, 6, 23, 0.14);
        }
        .card-media {
          padding: 18px;
          display: grid;
          place-items: center;
          background: #f8fafc;
          border-bottom: 1px solid var(--border);
        }
        .card-media img {
          max-width: 140px;
          height: 72px;
          object-fit: contain;
          filter: saturate(0.96);
        }
        .card-body {
          padding: 14px 16px 18px;
        }
        .card-title {
          margin: 0 0 6px 0;
          font-size: 16px;
        }
        .card-desc {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
        }
        .badge {
          display: inline-block;
          margin-top: 10px;
          padding: 6px 10px;
          font-weight: 700;
          border-radius: 8px;
          background: #ecfeff;
          color: #0369a1;
          border: 1px solid #bae6fd;
        }
        .tags {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin: 12px 0 0;
          padding: 0;
          list-style: none;
        }
        .tags li {
          font-size: 12px;
          color: #334155;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          padding: 4px 8px;
          border-radius: 999px;
        }

        .muted {
          color: var(--muted);
          padding: 24px;
        }
      `}</style>
        </div>
    );
}

/** =======================
 *  Modal de detalhes
 *  ======================= */
function DetalheParceiro({
    parceiro,
    onClose,
}: {
    parceiro: Parceiro;
    onClose: () => void;
}) {
    // fecha ao apertar ESC
    React.useEffect(() => {
        const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    const b = parceiro.beneficio;

    return (
        <div className="overlay" onClick={onClose} role="dialog" aria-modal="true">
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <header className="sheet-header">
                    <div className="sheet-brand">
                        <img
                            src={parceiro.logoUrl || 'https://via.placeholder.com/160'}
                            alt={parceiro.nome}
                        />
                        <div>
                            <h2>{parceiro.nome}</h2>
                            <p>{parceiro.descricaoCurta}</p>
                        </div>
                    </div>
                    <button className="close" onClick={onClose} aria-label="Fechar">
                        ✕
                    </button>
                </header>

                <div className="sheet-content">
                    <section>
                        <h3>Benefício</h3>
                        <p className="highlight">
                            {b.descontoPercentual
                                ? `${b.descontoPercentual}% OFF`
                                : b.descontoValor
                                    ? `R$ ${b.descontoValor} OFF`
                                    : b.titulo}
                        </p>
                        <p className="muted small">{b.titulo}</p>
                    </section>

                    <section>
                        <h3>Como usar</h3>
                        <p dangerouslySetInnerHTML={{ __html: markdownInline(b.comoUsar) }} />
                    </section>

                    {b.regras?.length > 0 && (
                        <section>
                            <h3>Regras</h3>
                            <ul className="bullets">
                                {b.regras.map((r, i) => (
                                    <li key={i} dangerouslySetInnerHTML={{ __html: markdownInline(r) }} />
                                ))}
                            </ul>
                        </section>
                    )}

                    {parceiro.enderecos.length > 0 && (
                        <section>
                            <h3>Endereços</h3>
                            <ul className="enderecos">
                                {parceiro.enderecos.map((e, i) => (
                                    <li key={i}>
                                        <strong>{e.titulo ?? 'Endereço'}</strong>
                                        <span>
                                            {e.rua}
                                            {e.numero ? `, ${e.numero}` : ''} {e.complemento ?? ''} –{' '}
                                            {e.bairro ?? ''} • {e.cidade}/{e.uf}{' '}
                                            {e.cep ? `• CEP ${e.cep}` : ''}
                                        </span>
                                        {e.mapaUrl && (
                                            <a href={e.mapaUrl} target="_blank" rel="noopener noreferrer">
                                                Ver mapa
                                            </a>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    <section>
                        <h3>Contato</h3>
                        <ul className="contatos">
                            {parceiro.contato.site && (
                                <li>
                                    🌐{' '}
                                    <a href={parceiro.contato.site} target="_blank" rel="noopener noreferrer">
                                        {parceiro.contato.site.replace('https://', '')}
                                    </a>
                                </li>
                            )}
                            {parceiro.contato.whatsapp && (
                                <li>
                                    💬{' '}
                                    <a
                                        href={`https://wa.me/${parceiro.contato.whatsapp.replace(/\D/g, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        WhatsApp {maskWhatsApp(parceiro.contato.whatsapp)}
                                    </a>
                                </li>
                            )}
                            {parceiro.contato.telefone && <li>📞 {parceiro.contato.telefone}</li>}
                            {parceiro.contato.email && (
                                <li>
                                    ✉️{' '}
                                    <a href={`mailto:${parceiro.contato.email}`}>{parceiro.contato.email}</a>
                                </li>
                            )}
                            {parceiro.contato.instagram && (
                                <li>
                                    📸{' '}
                                    <a
                                        href={parceiro.contato.instagram}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        Instagram
                                    </a>
                                </li>
                            )}
                        </ul>
                    </section>
                </div>
            </div>

            <style jsx>{`
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.55);
          display: grid;
          place-items: center;
          padding: 20px;
        }
        .sheet {
          width: 100%;
          max-width: 920px;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 24px 60px rgba(2, 6, 23, 0.4);
          overflow: hidden;
          animation: pop 0.15s ease;
        }
        @keyframes pop {
          from {
            transform: translateY(8px);
            opacity: 0.7;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .sheet-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 18px;
          border-bottom: 1px solid #e5e7eb;
          background: #f8fafc;
        }
        .sheet-brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .sheet-brand img {
          width: 56px;
          height: 56px;
          object-fit: contain;
          border-radius: 12px;
          background: #fff;
          border: 1px solid #e5e7eb;
          padding: 6px;
        }
        .sheet-brand h2 {
          margin: 0;
          font-size: 18px;
        }
        .sheet-brand p {
          margin: 4px 0 0;
          color: #64748b;
          font-size: 14px;
        }
        .close {
          border: 0;
          background: #0ea5e9;
          color: #fff;
          border-radius: 10px;
          width: 36px;
          height: 36px;
          cursor: pointer;
        }
        .sheet-content {
          padding: 16px 18px 22px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px 24px;
        }
        @media (max-width: 840px) {
          .sheet-content {
            grid-template-columns: 1fr;
          }
        }
        .sheet-content section h3 {
          margin: 0 0 6px;
          font-size: 15px;
        }
        .highlight {
          display: inline-block;
          font-weight: 800;
          padding: 6px 10px;
          border-radius: 8px;
          background: #ecfeff;
          color: #0369a1;
          border: 1px solid #bae6fd;
        }
        .bullets {
          margin: 0;
          padding-left: 18px;
        }
        .bullets li + li {
          margin-top: 6px;
        }
        .enderecos {
          display: grid;
          gap: 10px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .enderecos li {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 10px 12px;
          background: #fbfdff;
        }
        .enderecos li strong {
          display: block;
          margin-bottom: 4px;
        }
        .enderecos li a {
          display: inline-block;
          margin-top: 6px;
          color: #0ea5e9;
        }
        .contatos {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 8px;
        }
        .muted {
          color: #64748b;
        }
        .small {
          font-size: 13px;
        }
      `}</style>
        </div>
    );
}

/** =======================
 *  Util: Markdown simples inline (negrito/itálico que baste)
 *  ======================= */
function markdownInline(text: string) {
    // suporta **negrito** e *itálico* básicos
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');
}
