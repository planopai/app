export type Anexo = {
    id: number;
    mime: string;
    nome_original: string | null;
    tamanho_bytes: number;
    duracao_s: number | null;
    largura: number | null;
    altura: number | null;
    tem_miniatura: boolean;
};

export type Mensagem = {
    id: number;
    conversa_id: number;
    autor_tipo: "usuario" | "contato" | "sistema";
    autor_usuario_id: number | null;
    autor_contato_id: number | null;
    autor_nome: string | null;
    tipo: "texto" | "imagem" | "audio" | "documento" | "modelo" | "sistema";
    texto: string | null;
    responde_a_id: number | null;
    cliente_uuid: string | null;
    status_envio: "pendente" | "enviada" | "entregue" | "lida" | "falhou" | null;
    erro_envio: string | null;
    apagada: boolean;
    criado_em: string;
    anexos: Anexo[];
    /** nota interna: só a equipe vê, nunca vai ao WhatsApp (14/10/2026) */
    interna?: boolean;
    /** transcrição do áudio do cliente (Aurora) */
    transcricao?: string | null;
    /** reações com emoji (uma por pessoa) */
    reacoes?: { emoji: string; usuario_id: number; nome: string | null }[];
    /** só no app: mensagem ainda sendo enviada */
    _enviando?: boolean;
    _falhaLocal?: string;
};

export type Membro = { usuario_id: number; nome: string; papel: "membro" | "admin" | "observador"; ultima_lida_id: number };

export type Conversa = {
    id: number;
    tipo: "individual" | "grupo" | "externo";
    canal: "interno" | "whatsapp";
    titulo: string;
    outro_usuario_id: number | null;
    membros: Membro[];
    meu_papel: "membro" | "admin" | "observador" | null;
    posso_responder: boolean;
    participo: boolean;
    silenciada: boolean;
    nao_lidas: number;
    ultima_mensagem: Mensagem | null;
    ultima_mensagem_em: string | null;
    /** nome = o salvo pela equipe, se houver; nome_whatsapp = o do perfil do cliente */
    contato: { id: number; nome: string | null; nome_whatsapp?: string | null; salvo?: boolean; telefone: string; contratos?: ContratoVinculado[] } | null;
    status_atendimento: "aguardando" | "em_atendimento" | "encerrado" | null;
    responsavel: { id: number; nome: string | null } | null;
    janela_ate: string | null;
    janela_aberta: boolean | null;
    atendimento_id: number | null;
    /** Gestão vendo um atendimento em andamento sem participar: pode transferir e encerrar, não responde */
    gestao_acompanha?: boolean;
    /** pacote 4A: setor da conversa de cliente e etiquetas (as da empresa + as minhas) */
    setor_id?: number | null;
    /** 1 = falecimento comunicado (Aurora): fica no topo da fila */
    prioridade?: number;
    /** orçamento preparado pela Aurora aguardando o atendente conferir */
    orcamento_ia?: boolean;
    setor?: { id: number; nome: string; cor: string } | null;
    etiquetas?: EtiquetaCurta[];
    /** fixada no topo da lista por mim (até 3) */
    fixada?: boolean;
    fixada_em?: string | null;
    /** marcada por mim como "não lida" (bolinha verde sem número) */
    marcada_nao_lida?: boolean;
};

export type Perfil = {
    id: number;
    nome: string;
    atendente: boolean;
    gestao: boolean;
    /** pode mexer em Configurações do Messenger (respostas da empresa, assinatura) */
    configurar?: boolean;
    tempo_real: boolean;
    midias: boolean;
    whatsapp: boolean;
    /** canal de notificação configurado no servidor (notificação com o app fechado) */
    notificacoes: boolean;
    /** por onde saem as notificações (sempre um só): "ably" → este aparelho ativa o Web Push da Ably */
    notificacoes_canal?: "ably" | "onesignal";
};

export type Aba = "tudo" | "equipe" | "grupos" | "clientes";

/* ---------- pacote 4A (15/10/2026): setores e etiquetas ---------- */
/** Contrato da Unymos vinculado ao contato (selo na conversa); situação e etiquetas vêm da cópia diária. */
export type ContratoVinculado = { contrato: string; plano: string; situacao: string; tags: { nome: string; cor: string | null }[] };

export type EtiquetaCurta = { id: number; nome: string; cor: string };
export type Etiqueta = EtiquetaCurta & { pessoal: boolean; uso: number; quando_usar?: string | null };
export type HorarioSetor = { dia: number; inicio: string; fim: string };
export type ExcecaoSetor = { data: string; descricao: string | null; fechado: boolean; inicio: string | null; fim: string | null };
export type Setor = {
    id: number;
    nome: string;
    cor: string;
    ativo: boolean;
    plantao: boolean;
    ordem: number;
    msg_boas_vindas: string | null;
    msg_fora_horario: string | null;
    /** texto que o cliente vê no menu (se vazio, o nome do setor) */
    texto_menu?: string | null;
    /** orientação para a Aurora: o que este setor atende */
    descricao_ia?: string | null;
    /** aparece no menu de opções (false = só para transferência e para a Aurora) */
    no_menu?: boolean;
    membros: { id: number; nome: string }[];
    horarios: HorarioSetor[];
    excecoes: ExcecaoSetor[];
    aberto: boolean;
    situacao: string;
};

/** Fundo claro e texto escuro a partir da cor da etiqueta/setor (para o selo ficar legível). */
export function tonsDaCor(hex: string): { fundo: string; texto: string } {
    const n = parseInt((hex || "#3D6A99").slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mistura = (c: number, alvo: number, p: number) => Math.round(c + (alvo - c) * p);
    const fundo = `rgb(${mistura(r, 255, 0.84)}, ${mistura(g, 255, 0.84)}, ${mistura(b, 255, 0.84)})`;
    const texto = `rgb(${mistura(r, 0, 0.45)}, ${mistura(g, 0, 0.45)}, ${mistura(b, 0, 0.45)})`;
    return { fundo, texto };
}
