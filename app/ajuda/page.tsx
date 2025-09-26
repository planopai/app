"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    HelpCircle,
    Search,
    MessageCircleQuestion,
    Phone,
    Mail,
    BookOpenCheck,
    LifeBuoy,
    Download,
    ExternalLink,
    ChevronRight,
    ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"; // sem Accordion

// ---- Configuração de conteúdo -------------------------------------------------

type FAQ = {
    id: string;
    categoria: string; // ex: "Leads", "Memorial"...
    pergunta: string;
    resposta: React.ReactNode;
    palavrasChave?: string[]; // termos auxiliares para busca
};

const CATEGORIAS: { key: string; label: string; href?: string }[] = [
    { key: "inicio", label: "Início", href: "/" },
    { key: "quadro", label: "Quadro de Atendimento", href: "/quadro" },
    { key: "acompanhamento", label: "Acompanhamento", href: "/acompanhamento" },
    { key: "memorial", label: "Memorial", href: "/memorial" },
    { key: "obituario", label: "Obituário", href: "/obituario" },
    { key: "leads", label: "Leads", href: "/leads" },
    { key: "coroa", label: "Coroa de Flores", href: "/coroa-de-flores" },
    { key: "relatorio", label: "Relatório", href: "/relatorios" },
];

const FAQS: FAQ[] = [
    {
        id: "faq-acesso",
        categoria: "Início",
        pergunta: "Não consigo acessar minha conta. O que fazer?",
        resposta: (
            <div className="space-y-2">
                <p>
                    1) Verifique se o e-mail e a senha estão corretos. 2) Se necessário, clique em
                    <strong> “Esqueci minha senha”</strong> na tela de login. 3) Confirme se o link de
                    redefinição não foi para a pasta de spam. 4) Se sua organização usa SSO, tente
                    entrar pelo botão <strong>“Entrar com a empresa”</strong>.
                </p>
                <p>
                    Persistindo o problema, entre em contato com o suporte com um print do erro e o
                    e-mail afetado.
                </p>
            </div>
        ),
        palavrasChave: ["login", "senha", "acesso", "autenticação", "SSO"],
    },
    {
        id: "faq-quadro-status",
        categoria: "Quadro de Atendimento",
        pergunta: "Como acompanhar o status dos atendimentos em tempo real?",
        resposta: (
            <div className="space-y-2">
                <p>
                    No menu lateral, acesse <strong>Quadro de Atendimento</strong>. Use os filtros no
                    topo para <em>Unidade</em>, <em>Data</em> e <em>Status</em>. Os cartões são atualizados
                    automaticamente a cada ciclo; você pode forçar a atualização com o botão
                    <strong> Atualizar</strong>.
                </p>
                <ul className="list-disc pl-6">
                    <li>Ícones indicam etapas (triagem, em atendimento, finalizado).</li>
                    <li>Clique em um cartão para abrir detalhes e agir (mensagens, anexos, tarefas).</li>
                </ul>
            </div>
        ),
        palavrasChave: ["tempo real", "filtro", "status", "andamento"],
    },
    {
        id: "faq-timeline",
        categoria: "Acompanhamento",
        pergunta: "Onde vejo a linha do tempo e as etapas do processo?",
        resposta: (
            <p>
                Vá em <strong>Acompanhamento</strong>. A timeline mostra eventos do caso (criação,
                mensagens, alterações de etapa, anexos). É possível adicionar notas internas e
                marcar responsáveis. Use o botão <strong>+ Evento</strong> para registrar uma ação.
            </p>
        ),
        palavrasChave: ["linha do tempo", "timeline", "etapas", "notas"],
    },
    {
        id: "faq-memorial",
        categoria: "Memorial",
        pergunta: "Como reservo salas e gerencio mensagens de segurança?",
        resposta: (
            <div className="space-y-2">
                <p>
                    Em <strong>Memorial</strong>, utilize a aba <em>Salas</em> para disponibilidade e
                    reservas. Na aba <em>Segurança</em>, configure mensagens e perfis de acesso dos
                    participantes (familiares, equipe, fornecedores).
                </p>
            </div>
        ),
    },
    {
        id: "faq-obituario",
        categoria: "Obituário",
        pergunta: "Como criar e exportar uma peça para redes sociais?",
        resposta: (
            <div className="space-y-2">
                <p>
                    Acesse <strong>Obituário</strong> → <em>Novo</em>. Preencha os dados e escolha um
                    modelo. Após revisar, clique em <strong>Exportar</strong> para baixar a imagem em
                    alta resolução.
                </p>
                <p>Dica: adicione a logo da sua casa em Configurações → Identidade Visual.</p>
            </div>
        ),
        palavrasChave: ["post", "arte", "mídia", "social"],
    },
    {
        id: "faq-leads",
        categoria: "Leads",
        pergunta: "Posso importar contatos de uma planilha?",
        resposta: (
            <div className="space-y-2">
                <p>
                    Sim. Em <strong>Leads</strong> clique em <em>Importar</em> e envie um CSV com cabeçalho
                    <code>nome,email,telefone,etapa</code>. O sistema valida e mostra pré-visualização
                    antes de confirmar.
                </p>
                <p>
                    Também é possível <em>Exportar</em> os leads filtrados para uma planilha.
                </p>
            </div>
        ),
        palavrasChave: ["csv", "importar", "exportar", "planilha"],
    },
    {
        id: "faq-coroa",
        categoria: "Coroa de Flores",
        pergunta: "Como gerencio o catálogo e os pedidos?",
        resposta: (
            <p>
                No módulo <strong>Coroa de Flores</strong> você cria modelos, define preços e
                acompanha pedidos por status (em produção, entregue). Integre o WhatsApp para envio
                automático de comprovantes.
            </p>
        ),
        palavrasChave: ["catálogo", "pedido", "whatsapp"],
    },
    {
        id: "faq-relatorio",
        categoria: "Relatório",
        pergunta: "Quais indicadores estão disponíveis?",
        resposta: (
            <ul className="list-disc pl-6 space-y-1">
                <li>Atendimentos por período/unidade e tempo médio de atendimento.</li>
                <li>Conversão de leads por origem e etapa.</li>
                <li>Receita por serviço/modelo de coroa.</li>
                <li>Exportação para CSV/PDF com filtros aplicados.</li>
            </ul>
        ),
        palavrasChave: ["métricas", "indicadores", "dashboard", "exportação"],
    },
    {
        id: "faq-performance",
        categoria: "Dicas Rápidas",
        pergunta: "A tela está lenta ou instável. Como corrigir?",
        resposta: (
            <ul className="list-disc pl-6 space-y-1">
                <li>Atualize a página (Ctrl/Cmd + R).</li>
                <li>Saia e entre novamente para renovar a sessão.</li>
                <li>Limpe cache/cookies do navegador e tente em aba anônima.</li>
                <li>Verifique sua conexão e desative extensões que interfiram.</li>
            </ul>
        ),
        palavrasChave: ["lento", "travando", "instável", "cache", "reiniciar"],
    },
];

const LINKS_UTEIS = [
    { label: "Central de Ajuda", href: "#", icon: BookOpenCheck },
    { label: "Abrir um chamado", href: "#", icon: LifeBuoy },
    { label: "Manual em PDF", href: "#", icon: Download },
];

// ---- Componentes auxiliares ---------------------------------------------------

function EmptyState({ query }: { query: string }) {
    return (
        <Card className="p-6 text-center">
            <HelpCircle className="mx-auto mb-2 h-8 w-8" />
            <p className="font-medium">Nenhum resultado para “{query}”.</p>
            <p className="text-sm text-muted-foreground">
                Tente termos diferentes ou filtre por categoria.
            </p>
        </Card>
    );
}

// ---- Página -------------------------------------------------------------------

export default function HelpPage() {
    const [tab, setTab] = useState<string>("todas");
    const [query, setQuery] = useState<string>("");

    const categoriasSet = useMemo(
        () => Array.from(new Set(FAQS.map((f) => f.categoria))),
        []
    );

    const faqsFiltradas = useMemo(() => {
        const texto = query.trim().toLowerCase();
        return FAQS.filter((f) => {
            const matchTab = tab === "todas" || f.categoria.toLowerCase() === tab;
            if (!texto) return matchTab;
            const alvo = [
                f.pergunta.toLowerCase(),
                (typeof f.resposta === "string" ? f.resposta : "").toLowerCase(),
                f.categoria.toLowerCase(),
                ...(f.palavrasChave || []).map((p) => p.toLowerCase()),
            ].join(" ");
            return matchTab && alvo.includes(texto);
        });
    }, [tab, query]);

    return (
        <div className="mx-auto max-w-6xl px-6 py-8">
            {/* Hero */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="mb-8 grid gap-6 md:grid-cols-2 md:items-center">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Ajuda & Suporte</h1>
                        <p className="mt-2 text-muted-foreground">
                            Encontre respostas rápidas sobre Início, Quadro de Atendimento,
                            Acompanhamento, Memorial, Obituário, Leads, Coroa de Flores e Relatórios.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {CATEGORIAS.map((c) => (
                                <Badge key={c.key} variant="secondary" className="gap-1">
                                    <ChevronRight className="h-3 w-3" /> {c.label}
                                </Badge>
                            ))}
                        </div>
                    </div>
                    <Card className="p-4">
                        <div className="flex items-center gap-2">
                            <Search className="h-5 w-5" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Busque por palavras-chave (ex.: status, exportar, salas)"
                                className="flex-1"
                                aria-label="Buscar na ajuda"
                            />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Dica: você também pode navegar por categoria abaixo.
                        </p>
                    </Card>
                </div>
            </motion.div>

            {/* Ações rápidas */}
            <div className="mb-8 grid gap-4 md:grid-cols-3">
                {LINKS_UTEIS.map((a) => (
                    <Link key={a.label} href={a.href} className="group">
                        <Card className="transition hover:shadow-md">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-base">{a.label}</CardTitle>
                                <a.icon className="h-5 w-5" />
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">
                                Abrir <ArrowUpRight className="ml-1 inline h-4 w-4 align-text-top opacity-70 group-hover:opacity-100" />
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            {/* Tabs por categoria */}
            <Tabs value={tab} onValueChange={setTab} className="mb-6">
                <TabsList className="flex w-full flex-wrap">
                    <TabsTrigger value="todas">Todas</TabsTrigger>
                    {categoriasSet.map((c) => (
                        <TabsTrigger key={c.toLowerCase()} value={c.toLowerCase()}>
                            {c}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {/* Lista de FAQs sem shadcn Accordion - usando <details> */}
            {faqsFiltradas.length === 0 ? (
                <EmptyState query={query} />
            ) : (
                <div className="space-y-3">
                    {faqsFiltradas.map((faq) => (
                        <details key={faq.id} className="rounded-2xl border p-3 open:shadow-sm">
                            <summary className="cursor-pointer list-none text-left text-base font-medium flex items-center justify-between">
                                <span>{faq.pergunta}</span>
                                <span className="text-xs text-muted-foreground ml-2">{faq.categoria}</span>
                            </summary>
                            <div className="pt-3 text-sm text-muted-foreground">
                                {faq.resposta}
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Badge variant="outline">{faq.categoria}</Badge>
                                    {(faq.palavrasChave || []).slice(0, 3).map((t) => (
                                        <Badge key={t} variant="secondary">{t}</Badge>
                                    ))}
                                </div>
                            </div>
                        </details>
                    ))}
                </div>
            )}

            {/* Ajuda humana */}
            <div className="mt-10 grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><MessageCircleQuestion className="h-5 w-5" />Fale com o Suporte</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground space-y-2">
                        <p>Horário comercial de segunda a sexta.</p>
                        <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> (00) 0000-0000</div>
                        <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> suporte@exemplo.com.br</div>
                        <Button className="mt-3 w-full">Abrir chat</Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5" />Boas Práticas</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Mantenha dados atualizados e padronizados.</li>
                            <li>Use filtros para análises mais precisas.</li>
                            <li>Registre notas e responsabilidades no acompanhamento.</li>
                            <li>Faça exportações periódicas de relatórios.</li>
                        </ul>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><LifeBuoy className="h-5 w-5" />Recursos</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground space-y-2">
                        <p>Materiais para treinar sua equipe e tirar dúvidas.</p>
                        <div className="flex flex-col gap-2">
                            <Link href="#" className="inline-flex items-center gap-2 underline">
                                Guia Rápido <ExternalLink className="h-4 w-4" />
                            </Link>
                            <Link href="#" className="inline-flex items-center gap-2 underline">
                                Vídeos Tutoriais <ExternalLink className="h-4 w-4" />
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Rodapé */}
            <div className="mt-10 text-center text-xs text-muted-foreground">
                <p>Precisa de algo que não encontrou? Envie sua sugestão pela opção “Abrir um chamado”.</p>
            </div>
        </div>
    );
}
