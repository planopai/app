"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Lightbulb, Search, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ---- Tipos --------------------------------------------------------------------

type Dica = {
    id: string;
    categoria: string;
    titulo: string;
    conteudo: React.ReactNode;
    palavrasChave?: string[];
};

// ---- Dicas --------------------------------------------------------------------

const DICAS: Dica[] = [
    {
        id: "dica-atendimento-filtros",
        categoria: "Atendimento",
        titulo: "Use filtros antes de agir",
        conteudo: (
            <ul className="list-disc pl-6 space-y-1">
                <li>Filtre por <em>Unidade</em>, <em>Data</em> e <em>Status</em> para reduzir ruído.</li>
                <li>Combine dois filtros (ex.: Unidade + Status) para listas menores e decisões mais rápidas.</li>
                <li>Salve filtros frequentes com favoritos do navegador.</li>
            </ul>
        ),
        palavrasChave: ["filtro", "status", "unidade"],
    },
    {
        id: "dica-atendimento-prioridade",
        categoria: "Atendimento",
        titulo: "Priorize pelo impacto",
        conteudo: (
            <ul className="list-disc pl-6 space-y-1">
                <li>Atenda primeiro casos com tempo em fila maior.</li>
                <li>Depois, priorize eventos com pendências (ex.: documentos ou confirmação de agenda).</li>
                <li>Marque responsáveis para evitar duplicidade.</li>
            </ul>
        ),
        palavrasChave: ["prioridade", "fila", "responsável"],
    },
    {
        id: "dica-acompanhamento-notas",
        categoria: "Acompanhamento",
        titulo: "Notas curtas e objetivas",
        conteudo: (
            <ul className="list-disc pl-6 space-y-1">
                <li>Comece com verbo: <em>Ligado para família — aguardando retorno</em>.</li>
                <li>Inclua data e próximo passo (<em>DD/MM, enviar orçamento atualizado</em>).</li>
                <li>Evite siglas internas sem explicação.</li>
            </ul>
        ),
        palavrasChave: ["notas", "timeline", "próximo passo"],
    },
    {
        id: "dica-memorial-salas",
        categoria: "Memorial",
        titulo: "Organize reservas de sala com antecedência",
        conteudo: (
            <ul className="list-disc pl-6 space-y-1">
                <li>Bloqueie horários assim que houver confirmação da família.</li>
                <li>Adicione observações visíveis para a equipe (ex.: acessibilidade, número de cadeiras).</li>
                <li>Revise conflitos diariamente pela manhã.</li>
            </ul>
        ),
    },
    {
        id: "dica-obituario-layout",
        categoria: "Obituário",
        titulo: "Layout limpo funciona melhor",
        conteudo: (
            <ul className="list-disc pl-6 space-y-1">
                <li>Prefira fotos bem iluminadas e sem ruído.</li>
                <li>Mantenha 2 a 3 fontes no máximo.</li>
                <li>Deixe margem segura para posts de feed e stories.</li>
            </ul>
        ),
        palavrasChave: ["arte", "post", "redes sociais"],
    },
    {
        id: "dica-leads-csv",
        categoria: "Leads",
        titulo: "Importe CSV padronizado",
        conteudo: (
            <ul className="list-disc pl-6 space-y-1">
                <li>Colunas: <code>nome,email,telefone,etapa</code>.</li>
                <li>Valide DDD e e-mail antes da importação.</li>
                <li>Use <em>etapa</em> coerente com o funil (ex.: Novo, Contato, Orçamento, Fechado).</li>
            </ul>
        ),
        palavrasChave: ["csv", "importação", "funil"],
    },
    {
        id: "dica-coroa-catalogo",
        categoria: "Coroa de Flores",
        titulo: "Catálogo enxuto e claro",
        conteudo: (
            <ul className="list-disc pl-6 space-y-1">
                <li>Mantenha poucos modelos por faixa de preço.</li>
                <li>Fotos reais + descrição objetiva (tamanho aproximado, flores principais).</li>
                <li>Atualize itens descontinuados para evitar re-trabalho.</li>
            </ul>
        ),
    },
    {
        id: "dica-relatorios-filtros",
        categoria: "Relatórios",
        titulo: "Relatórios: comece pelo objetivo",
        conteudo: (
            <ul className="list-disc pl-6 space-y-1">
                <li>Defina a pergunta antes: <em>O que quero provar/acompanhar?</em></li>
                <li>Depois aplique filtros (período, unidade, origem) e exporte se precisar compartilhar.</li>
                <li>Evite planilhas gigantes: use períodos menores e consolide.</li>
            </ul>
        ),
        palavrasChave: ["métricas", "exportar", "período"],
    },
    {
        id: "dica-performance",
        categoria: "Performance",
        titulo: "Se estiver lento, faça estes 4 passos",
        conteudo: (
            <ol className="list-decimal pl-6 space-y-1">
                <li>Atualize a página (Ctrl/Cmd + R).</li>
                <li>Entre e saia da conta para renovar a sessão.</li>
                <li>Teste em aba anônima (isola extensões e cache).</li>
                <li>Verifique a conexão e feche abas pesadas.</li>
            </ol>
        ),
        palavrasChave: ["lento", "travando", "cache"],
    },
    {
        id: "dica-seguranca",
        categoria: "Segurança",
        titulo: "Boas práticas de segurança",
        conteudo: (
            <ul className="list-disc pl-6 space-y-1">
                <li>Use senha forte e única por usuário.</li>
                <li>Evite compartilhar contas; registre responsáveis.</li>
                <li>Revise permissões de acesso quando alguém sair da equipe.</li>
            </ul>
        ),
        palavrasChave: ["senha", "permissão", "acesso"],
    },
    {
        id: "dica-acessibilidade",
        categoria: "Acessibilidade",
        titulo: "Deixe o conteúdo mais acessível",
        conteudo: (
            <ul className="list-disc pl-6 space-y-1">
                <li>Use contraste adequado em peças do obituário.</li>
                <li>Evite 100% de texto em CAPS.</li>
                <li>Sempre descreva imagens importantes em notas internas.</li>
            </ul>
        ),
        palavrasChave: ["contraste", "legibilidade"],
    },
    {
        id: "dica-atalhos",
        categoria: "Atalhos",
        titulo: "Atalhos úteis do navegador",
        conteudo: (
            <ul className="list-disc pl-6 space-y-1">
                <li><kbd>Ctrl/Cmd</kbd> + <kbd>K</kbd>: foco na busca.</li>
                <li><kbd>Ctrl/Cmd</kbd> + <kbd>F</kbd>: localizar texto na página.</li>
                <li><kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd>: nova janela anônima para depurar.</li>
            </ul>
        ),
        palavrasChave: ["atalhos", "teclado", "produtividade"],
    },
];

// ---- Página -------------------------------------------------------------------

export default function TipsPage() {
    const [tab, setTab] = useState<string>("todas");
    const [query, setQuery] = useState<string>("");

    const categorias = useMemo(() => Array.from(new Set(DICAS.map((d) => d.categoria))), []);

    const dicasFiltradas = useMemo(() => {
        const texto = query.trim().toLowerCase();
        return DICAS.filter((d) => {
            const matchTab = tab === "todas" || d.categoria.toLowerCase() === tab;
            if (!texto) return matchTab;
            const alvo = [
                d.titulo.toLowerCase(),
                (typeof d.conteudo === "string" ? d.conteudo : "").toLowerCase(),
                d.categoria.toLowerCase(),
                ...(d.palavrasChave || []).map((p) => p.toLowerCase()),
            ].join(" ");
            return matchTab && alvo.includes(texto);
        });
    }, [tab, query]);

    return (
        <div className="mx-auto max-w-5xl px-6 py-8">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="mb-6 flex items-center gap-3">
                    <Lightbulb className="h-7 w-7" />
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Dicas & Boas Práticas</h1>
                        <p className="text-sm text-muted-foreground">Um guia rápido para trabalhar melhor no sistema — sem abrir chamados.</p>
                    </div>
                </div>

                <Card className="mb-6 p-4">
                    <div className="flex items-center gap-2">
                        <Search className="h-5 w-5" />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Busque por palavras-chave (ex.: filtros, csv, lento)"
                            className="flex-1"
                            aria-label="Buscar dicas"
                        />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {categorias.map((c) => (
                            <Badge key={c} variant="secondary" className="gap-1">
                                <ChevronRight className="h-3 w-3" /> {c}
                            </Badge>
                        ))}
                    </div>
                </Card>
            </motion.div>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={setTab} className="mb-4">
                <TabsList className="flex w-full flex-wrap">
                    <TabsTrigger value="todas">Todas</TabsTrigger>
                    {categorias.map((c) => (
                        <TabsTrigger key={c.toLowerCase()} value={c.toLowerCase()}>
                            {c}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {/* Lista de dicas para usuarios   */}
            {dicasFiltradas.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum resultado para sua busca.</Card>
            ) : (
                <div className="grid gap-3">
                    {dicasFiltradas.map((d) => (
                        <details key={d.id} className="rounded-2xl border p-3 open:shadow-sm">
                            <summary className="cursor-pointer list-none text-left font-medium">{d.titulo}</summary>
                            <div className="pt-3 text-sm text-muted-foreground">
                                {d.conteudo}
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Badge variant="outline">{d.categoria}</Badge>
                                    {(d.palavrasChave || []).slice(0, 3).map((t) => (
                                        <Badge key={t} variant="secondary">{t}</Badge>
                                    ))}
                                </div>
                            </div>
                        </details>
                    ))}
                </div>
            )}

            {/* Rodapé simples */}
            <div className="mt-8 text-center text-xs text-muted-foreground">
                Última atualização automática das dicas: {new Date().toLocaleDateString("pt-BR")}
            </div>
        </div>
    );
}
