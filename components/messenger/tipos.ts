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
    contato: { id: number; nome: string | null; telefone: string } | null;
    status_atendimento: "aguardando" | "em_atendimento" | "encerrado" | null;
    responsavel: { id: number; nome: string | null } | null;
    janela_ate: string | null;
    janela_aberta: boolean | null;
    atendimento_id: number | null;
    /** Gestão vendo um atendimento em andamento sem participar: pode transferir e encerrar, não responde */
    gestao_acompanha?: boolean;
};

export type Perfil = {
    id: number;
    nome: string;
    atendente: boolean;
    gestao: boolean;
    tempo_real: boolean;
    midias: boolean;
    whatsapp: boolean;
    /** canal de notificação configurado no servidor (notificação com o app fechado) */
    notificacoes: boolean;
    /** por onde saem as notificações (sempre um só): "ably" → este aparelho ativa o Web Push da Ably */
    notificacoes_canal?: "ably" | "onesignal";
};

export type Aba = "equipe" | "grupos" | "clientes";
