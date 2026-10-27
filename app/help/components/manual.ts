/**
 * Conteúdo do Manual do app PAI (tela Ajuda, rota /help).
 *
 * 27/10/2026: manual escrito a partir do código das telas (versão no ar em 27/10/2026).
 * Cada tópico aponta para o id da tela no menu (components/shell/modulos.tsx → ItemModulo.id).
 * A página usa esses ids para: (1) mostrar só as telas que o usuário pode abrir, (2) agrupar pelo módulo
 * em que a tela está no menu (segue o Organizar menu da Gestão) e (3) montar o botão "Abrir tela".
 *
 * Tela nova ou mudança de tela: acrescente/ajuste o tópico aqui. Texto entre **asteriscos** sai em negrito.
 * Escreva como na tela: os nomes de botões, abas e campos iguais aos do app.
 */

export type Passo = string | { titulo: string; passos: string[] };

export type Pergunta = { p: string; r: string };

export type Topico = {
    /** Id do tópico (âncora: /help#<id>). */
    id: string;
    titulo: string;
    /** Rota da tela (mostrada no cartão). Sem rota = tópico de uso geral. */
    rota?: string;
    /** Ids das telas no menu (modulos.tsx). Vazio = aparece para todos. */
    menuIds: string[];
    /** Módulo onde o tópico fica quando a tela não está em nenhum módulo do menu. */
    modulo: string;
    resumo: string;
    passos: Passo[];
    cores?: string[];
    dicas?: string[];
    faq?: Pergunta[];
    /** Palavras extras para a busca. */
    chaves?: string[];
};

/** Grupo "Primeiros passos" (não é módulo do menu). */
export const GUIA_ID = "primeiros-passos";

/* ============================================================================================
   PRIMEIROS PASSOS
   ============================================================================================ */

const GUIA: Topico[] = [
    {
        id: "entrar",
        titulo: "Entrar no sistema",
        rota: "/login",
        menuIds: [],
        modulo: GUIA_ID,
        resumo: "Como entrar no app com o seu usuário e a sua senha.",
        passos: [
            "Abra o app. Aparece a tela **App Plano PAI**.",
            "Digite o seu **Usuário** e a sua **Senha**.",
            "Se quiser que o aparelho lembre o seu usuário, ligue **Lembrar usuário**. A senha nunca fica guardada.",
            "Toque em **Entrar**. Enquanto o sistema confere, o botão mostra \"Entrando...\".",
        ],
        dicas: [
            "\"Preencha usuário e senha.\": algum campo ficou vazio.",
            "\"Dados incorretos. Tente novamente.\": o usuário ou a senha estão errados. Se esqueceu a senha, peça à Gestão (tela Usuários).",
            "Se aparecer \"Sessão expirada\" em alguma tela, entre de novo.",
        ],
        chaves: ["login", "senha", "acesso", "logar"],
    },
    {
        id: "inicio",
        titulo: "Tela Início",
        rota: "/",
        menuIds: [],
        modulo: GUIA_ID,
        resumo: "A primeira tela depois de entrar: resumo do dia, pesquisa de funções, acesso rápido e módulos.",
        passos: [
            "No topo aparecem a data, a saudação com o seu nome e o relógio.",
            "**Novo atendimento** e **Orçamentos** (para quem tem permissão) abrem essas telas direto.",
            "No campo **Pesquise**, digite o começo do nome de uma função (ex.: \"Rel\"). Só aparecem as telas que você pode abrir. O **X** apaga a pesquisa.",
            "Os cartões do **Resumo** mostram os números do dia: **Serviços funerários**, **Coroas de flores**, **Requisições para separar** e **Alertas de estoque**. Toque no cartão para abrir a tela. \"—\" quer dizer que o número não carregou.",
            "**Acesso rápido** traz as telas fixas escolhidas pela Gestão. A bolinha amarela com número mostra o que está pendente.",
            "**Módulos** são os grupos de telas (Atendimento, Comunicação, Requisições, Estoque, Financeiro, Plano, Administrativo e Gestão).",
        ],
        chaves: ["home", "inicio", "resumo", "painel"],
    },
    {
        id: "menu",
        titulo: "Menu lateral e módulos (computador)",
        menuIds: [],
        modulo: GUIA_ID,
        resumo: "Como achar as telas pelo menu do lado esquerdo.",
        passos: [
            "Clique no logo **Plano PAI** para voltar ao Início.",
            "No alto do menu ficam os seus **Atalhos**.",
            "Abaixo ficam os **módulos**. Clique em um módulo para abrir as telas dele. Fica um módulo aberto por vez; clicar de novo fecha.",
            "A tela em que você está tem uma faixa amarela à esquerda. Números em amarelo mostram pendências.",
            "Clicar no nome do módulo abre a **página do módulo**, com todas as telas dele que você pode abrir.",
            "No rodapé do menu ficam o seu nome e três botões: **Menu** (Personalizar menu), **Ajuda** (esta tela) e **Sair**.",
        ],
        dicas: [
            "Você só vê as telas que o seu cargo tem permissão para abrir. Se faltar uma tela, peça à Gestão (tela Permissões).",
            "\"Nenhuma opção disponível para o seu usuário neste módulo.\": você não tem nenhuma tela liberada nesse módulo.",
        ],
        chaves: ["sidebar", "navegação", "atalhos", "módulo"],
    },
    {
        id: "celular",
        titulo: "Usar no celular: barra de baixo e Menu",
        menuIds: [],
        modulo: GUIA_ID,
        resumo: "No celular e no tablet o menu lateral vira uma barra de atalhos embaixo da tela.",
        passos: [
            "A **barra de baixo** tem até 5 atalhos e o botão **Menu**, sempre por último.",
            "Messenger, Avisos, Estoque e Coroas mostram o número de pendências no atalho.",
            "Toque em **Menu** para abrir o menu em tela inteira: **Acesso rápido**, **Módulos** (cada um com \"Visão geral de…\" e as telas), **Personalizar barra**, **Ajuda** e **Sair da conta**.",
            "Para fechar, toque no **X**, fora do menu ou de novo em **Menu**.",
        ],
        dicas: [
            "Em algumas telas a barra de baixo some (ex.: Chat da Aurora ou uma conversa aberta no Messenger). Use o botão ☰ do cabeçalho.",
            "O app pode ser instalado na tela inicial do celular e funciona na vertical e na horizontal.",
        ],
        chaves: ["mobile", "celular", "barra", "tablet"],
    },
    {
        id: "busca",
        titulo: "Pesquisar uma tela ou função",
        menuIds: [],
        modulo: GUIA_ID,
        resumo: "Ache qualquer tela pelo nome, sem passar pelo menu.",
        passos: [
            "No computador, clique em **Pesquisar tela ou função** no cabeçalho ou aperte **Ctrl+K** (no Mac, **⌘K**).",
            "Digite parte do nome ou da descrição da tela. Aparecem até 8 resultados.",
            "Use as setas ↑ ↓ e **Enter**, ou clique no resultado. **Esc** fecha a pesquisa.",
            "No celular, use o campo **Pesquise** da tela Início.",
        ],
        dicas: ["A pesquisa acha telas, não registros. Para achar um atendimento ou associado, use a busca dentro da própria tela."],
        chaves: ["ctrl k", "procurar", "buscar"],
    },
    {
        id: "cabecalho",
        titulo: "Cabeçalho: Online, tema e avisos",
        menuIds: [],
        modulo: GUIA_ID,
        resumo: "O que significa cada item no alto da tela.",
        passos: [
            "**Online / Offline**: mostra se o aparelho tem internet. Fica vermelho quando está **Offline**.",
            "**Tema**: troca entre claro e escuro.",
            "**Sino (Avisos)**: aparece para quem tem a tela Avisos. A bolinha amarela mostra avisos novos; clique para abrir.",
        ],
        dicas: [
            "Sem internet, algumas etapas do atendimento continuam funcionando e são enviadas quando a conexão volta. Corpo Pronto, Fim da Ornamentação, transportes e mudanças de coroa precisam de internet.",
        ],
        chaves: ["offline", "internet", "escuro", "claro", "sino", "notificação"],
    },
    {
        id: "personalizar",
        titulo: "Personalizar barra e meu menu",
        rota: "/personalizar-barra",
        menuIds: [],
        modulo: GUIA_ID,
        resumo: "Escolha os seus atalhos e organize o seu menu. Vale só para você.",
        passos: [
            {
                titulo: "Aba Atalhos",
                passos: [
                    "Em **Aparelho**, escolha **Celular** ou **Computador**. Cada aparelho tem a sua barra.",
                    "Use **Procurar tela** e toque em **+** para pôr uma tela na barra. Limite: 5 atalhos no celular e 8 no computador.",
                    "Use as setas para mudar a ordem e o botão de tirar para remover. Toque no ícone de um atalho para trocá-lo.",
                    "Confira na **Prévia** e toque em **Salvar**. A barra acompanha você em qualquer aparelho.",
                    "**Restaurar padrão do cargo** volta à barra padrão do seu cargo.",
                ],
            },
            {
                titulo: "Aba Meu menu",
                passos: [
                    "Mude a ordem dos módulos e das telas com **Subir** e **Descer**.",
                    "Esconda ou mostre um módulo ou uma tela. As escondidas aparecem riscadas.",
                    "Toque em **Salvar**. Enquanto não salvar, aparece \"Mudanças ainda não salvas.\".",
                    "**Voltar à organização da Gestão** desfaz o que você mudou.",
                ],
            },
        ],
        dicas: [
            "\"A barra … está completa. Tire um para pôr outro.\": a barra chegou ao limite.",
            "Administradores também veem **Padrão por cargo (administrador)**, para montar a barra inicial de cada cargo.",
            "Esconder uma tela no seu menu não tira a sua permissão: ela continua na pesquisa.",
        ],
        chaves: ["atalho", "barra", "favoritos", "organizar"],
    },
    {
        id: "sair",
        titulo: "Sair da conta",
        menuIds: [],
        modulo: GUIA_ID,
        resumo: "Como sair com segurança, principalmente em aparelho compartilhado.",
        passos: [
            "No computador, clique em **Sair** no rodapé do menu lateral.",
            "No celular, toque em **Menu** e depois em **Sair da conta**.",
            "O app apaga deste aparelho os dados guardados para uso sem internet e volta para o login. Funciona mesmo sem internet.",
        ],
        dicas: ["Em aparelho de uso coletivo (TV, computador da recepção), sempre saia da conta ao terminar."],
        chaves: ["logout", "deslogar"],
    },
];

/* ============================================================================================
   ATENDIMENTO
   ============================================================================================ */

const ATENDIMENTO: Topico[] = [
    {
        id: "atendimentos",
        titulo: "Atendimentos",
        rota: "/acompanhamento",
        menuIds: ["atendimentos"],
        modulo: "atendimento",
        resumo:
            "Registro de cada atendimento funerário e das etapas dele, da remoção ao recolhimento do material. Aqui ficam o cadastro, os termos assinados, a OS, o compartilhamento com a família e a visita de avaliação.",
        passos: [
            {
                titulo: "Achar um atendimento",
                passos: [
                    "Digite o nome do falecido ou o status em **Buscar por nome ou status**.",
                    "No computador a lista mostra **Status**, **Falecido(a)**, **Próxima etapa** e **Ações**. No celular, os botões extras ficam no **⋯**.",
                ],
            },
            {
                titulo: "Novo registro",
                passos: [
                    "Toque em **+ Novo registro** e preencha as abas. Na aba Atendimento, o **Convênio** é o primeiro campo.",
                    "Na parte de itens, responda **Sim** ou **Não** para cada um: primeiro os **Itens principais** (Urna, Roupa, Coroa de flores), depois os **Demais itens e serviços** (Véu, Cordão, Invol, Kit lanche, Assistência, Tanatopraxia, Ornamentação, Velório, Sepultamento).",
                    "Com **Sim**, escolha o produto e o local de saída do estoque.",
                    "**Coroa de flores**: de 1 a 20 coroas. Para cada uma escolha **Natural** ou **Artificial**, o modelo e a frase (na artificial, também o depósito).",
                    "**Tanatopraxia = Sim**: abra **Selecionar Itens…**, marque os insumos e as quantidades e toque em **Salvar Arrumação**.",
                    "**Assistência = Sim**: use **Selecionar Materiais…**.",
                    "**Foto do falecido** (opcional): JPG, PNG ou WEBP de até 5 MB. Ela aparece no obituário, no painel e nas homenagens.",
                    "Toque em **Salvar**.",
                ],
            },
            {
                titulo: "Aba Velório",
                passos: [
                    "Escolha o **Local do Velório** (Memorial Senhor do Bonfim, Residência, Igreja, Capela do cemitério etc.).",
                    "Fora do Memorial, preencha o **Endereço da Cerimônia** ou toque em **Usar GPS**. **Limpar** apaga o campo.",
                    "No Memorial, escolha a **Sala do Velório** (Sala 01, 02 ou 03) e responda **Velório Online** (Sim/Não).",
                ],
            },
            {
                titulo: "Editar registro",
                passos: [
                    "Toque em **Editar** (lápis amarelo) na linha do atendimento.",
                    "A coluna da direita mostra **Documentos** (os termos), o **Resumo da OS** e a **Próxima etapa**.",
                    "**Atualizar OS** salva o registro e refaz a OS sem fechar a tela. **Ver OS e assinar** abre a OS por cima.",
                    "Termine com **Salvar alterações**.",
                ],
            },
            {
                titulo: "Registrar ação (avançar a etapa)",
                passos: [
                    "Toque em **Registrar ação** (seta no círculo). Abre a lista de **Etapas**.",
                    "Toque na etapa em destaque e confirme.",
                    "Etapas de veículo (retirada, transporte para o velório e para o sepultamento) pedem os dados do veículo.",
                    "Fim da Ornamentação e chegada ao velório pedem foto.",
                    "**Corpo Pronto** mostra a \"Baixa automática no estoque\". Confira os itens e toque em **Confirmar Corpo Pronto**.",
                    "**Material Recolhido** abre a conferência dos materiais.",
                ],
            },
            {
                titulo: "Compartilhar com a família",
                passos: [
                    "Toque em **Compartilhar** (verde) e escolha **Velório Online**, **Portal da Família** ou **Legado de Luz**.",
                    "**Acessar** abre o link; **Compartilhar** prepara a mensagem no WhatsApp.",
                ],
            },
            {
                titulo: "Termos e assinaturas",
                passos: [
                    "No quadro **Documentos**, toque no termo para colher a assinatura.",
                    "O termo de recebimento de material aparece com Assistência; o de requisição de veículo, com Sepultamento. Uma assinatura vale para os dois.",
                ],
            },
        ],
        cores: [
            "**Ordem das etapas:** Removendo → Aguardando Procedimento → Preparando → Aguardando Ornamentação → Ornamentando → Aguardando Corpo Pronto → Corpo Pronto → Transportando P/ Velório → Velando → Transportando P/ Sepultamento → Sepultamento Concluído → Material Recolhido.",
            "Etapas de serviço não contratado somem sozinhas (ex.: sem tanatopraxia não há conservação; velório no Memorial não tem transporte para o velório).",
            "**No Registrar ação:** amarelo = etapa a registrar agora; verde com ✓ = já registrada; cinza = aguarda as anteriores.",
            "**Documentos:** verde com ✓ = assinado; \"Salvo no aparelho · aguardando envio\" = assinado sem internet; \"Pendente de assinatura\" = falta assinar.",
            "**Botões da linha:** seta azul = Registrar ação; lápis amarelo = Editar; verde = Compartilhar; olho = Visita (contorno = visitar, azul = em andamento, verde = visitado).",
            "Faixa vermelha = erro; verde = salvo; amarela = itens travados.",
        ],
        dicas: [
            "Se faltar campo obrigatório, aparece \"Não foi possível salvar. Falta preencher:\" com botões que levam direto ao campo.",
            "O **Salvar** fica bloqueado até responder Sim ou Não em **Assistência**.",
            "Depois do **Corpo Pronto**, urna, roupa, véu, cordão, invol, tanatopraxia, ornamentação, kit lanche e coroa ficam travados (o estoque já foi baixado). Só a Gestão altera.",
            "Se faltar estoque no Corpo Pronto, a etapa não avança. Faça a reposição e tente de novo.",
            "Só tanatopraxistas autorizados iniciam ou finalizam a conservação.",
            "O **Início da Ornamentação** só libera com o cadastro completo. Use **Abrir o cadastro completo** para ver o que falta.",
            "A Gestão pode voltar uma etapa ou cancelar o atendimento pelo Registrar ação.",
            "Atendimento de terceiro tem só Velando, Transporte P/ Sepultamento e Sepultamento Concluído, e não gera OS.",
        ],
        faq: [
            { p: "Qual é a senha do Velório Online e do Portal da Família?", r: "Velório Online: o primeiro nome do falecido. Portal da Família: os 6 primeiros números do CPF do responsável." },
            { p: "Por que o atendimento sumiu da lista?", r: "Atendimentos concluídos saem da lista, como no Quadro. Consulte em Histórico de sepultamentos." },
            { p: "Dá para começar a partir de um orçamento?", r: "Sim. Em Orçamento, \"Virar atendimento\" abre o Novo registro já preenchido. Confira os itens e complete o resto." },
            { p: "Não consigo tocar em Visita.", r: "A visita só libera durante o velório e para usuários autorizados." },
        ],
        chaves: ["registro", "wizard", "falecido", "etapa", "corpo pronto", "velório", "sepultamento", "termo", "assinatura", "gps"],
    },
    {
        id: "quadro",
        titulo: "Quadro de Atendimentos",
        rota: "/quadro-acompanhamento",
        menuIds: ["quadro"],
        modulo: "atendimento",
        resumo: "Painel em tempo real com os atendimentos em andamento, as coroas em confecção e os avisos. Pode ser exibido numa TV.",
        passos: [
            "No topo aparecem os totais: em andamento, parados há mais de 24 h e coroas em confecção.",
            "Cada cartão mostra a situação **Agora**, há quanto tempo está nela, o responsável, as etapas, o **Tempo ocioso** e o **Tempo total**.",
            "Toque num atendimento para abrir **Informações do atendimento** (Resumo, Tempos, Etapas registradas, Locais, Itens, Observações, Faltam dados). **Copiar informações** copia os dados; **Linha do tempo** mostra o histórico.",
            "No rodapé da janela ficam **Registrar ação**, **Editar**, **OS** e **Visita**.",
            "**Modo TV** abre o quadro em tela cheia para a televisão.",
            "No celular, use as abas **Atendimentos**, **Coroas** e **Avisos**.",
        ],
        cores: [
            "**Vermelho:** mais de 24 h na mesma situação.",
            "**Âmbar:** passou do horário marcado e o velório ou o sepultamento ainda não começou; ou coroa atrasada (natural com mais de 2 h, artificial com mais de 1 h).",
            "Na TV, a etapa atual pisca em verde. Etapa vazia ainda não aconteceu; tracejada não se aplica.",
            "**\"Últimos dados mantidos\"**: a atualização falhou e o quadro mostra os dados anteriores.",
        ],
        dicas: [
            "Mostra até os 60 atendimentos mais recentes; os concluídos não aparecem.",
            "A fila de coroas se atualiza a cada 3 segundos.",
            "O Registrar ação do Quadro segue as mesmas regras de Atendimentos (fotos, estoque, permissões).",
        ],
        faq: [
            { p: "Dá para editar pelo Quadro?", r: "Sim. O botão Editar abre o registro na tela de Atendimentos." },
            { p: "A internet caiu. O quadro está certo?", r: "Ele mantém os últimos dados e se atualiza sozinho quando a conexão volta." },
        ],
        chaves: ["tv", "painel", "tempo real", "quadrotv"],
    },
    {
        id: "minhas-os",
        titulo: "Minhas OS e Ver OS e assinar",
        rota: "/os/minhas",
        menuIds: ["minhasos"],
        modulo: "atendimento",
        resumo:
            "As Ordens de Serviço que você abriu e as suas pendências. Pela OS de um atendimento você confere a folha, ajusta valores, conclui a venda e colhe a assinatura do responsável.",
        passos: [
            "Na aba **Minhas OS**, use **Filtros** (período, tipo, situação e pagamento) e veja os cartões **Em aberto**, **Concluídas**, **Assinadas** e **Convertidas**. Toque numa OS para abrir.",
            "Na aba **Pendências** fica a situação de hoje das suas OS. **Imprimir** imprime a lista.",
            "Pelo botão **OS** do atendimento (em Atendimentos ou no Quadro) abre a **OS do atendimento**, com uma aba para cada OS (Prefeitura, Convênio, Família ou Diferença da família).",
            "Ajuste valores pelo ícone de cada item ou pelo **Desconto geral**.",
            {
                titulo: "Concluir venda",
                passos: [
                    "Toque em **+ Lançar pagamento** (e **+ Outra forma de pagamento**, se precisar).",
                    "Escolha a forma. No cartão de crédito, escolha as **Parcelas no cartão** (1x a 12x).",
                    "Anexe a foto do comprovante e toque em **Concluir venda**.",
                ],
            },
            {
                titulo: "Colher assinatura",
                passos: [
                    "Confira o **Nome do responsável** (o CPF é opcional; já vem do atendimento).",
                    "O responsável assina no quadro. Errou? **Limpar**.",
                    "Toque em **Assinar**.",
                ],
            },
            "**PDF** gera o arquivo da OS (no celular vai para o compartilhamento; no computador é baixado).",
        ],
        cores: [
            "**ABERTA** (creme): venda não concluída.",
            "**CONCLUÍDA** (azul): venda fechada, falta assinar.",
            "**ASSINADA** (verde): fechada e assinada.",
            "**CONVERTIDA**: OS particular que passou para a Prefeitura. **CANCELADA**: não vale mais.",
            "**A RECEBER R$ x** (amarelo): há saldo a receber. **QUITADA** (verde): tudo pago.",
        ],
        dicas: [
            "O valor de um item só pode subir; o desconto é lançado à parte.",
            "Todos os descontos juntos vão até 8% do valor. Só Gestão e Financeiro passam desse limite.",
            "Todas as formas de pagamento, menos **Dinheiro**, pedem comprovante (foto ou PDF de até 15 MB).",
            "A soma dos pagamentos não pode passar do total da OS. Se sobrar saldo, a assinatura gera uma **nota promissória** desse valor.",
            "Uma assinatura vale para todas as OS concluídas do atendimento.",
            "Depois de concluída, os valores ficam travados. Para mudar, o Financeiro reabre a OS.",
            "A OS da Prefeitura não mostra valores; a OS de convênio não recebe pagamento.",
        ],
        faq: [
            { p: "O atendimento não tem OS.", r: "Salve o registro do atendimento: é o salvamento que gera a OS." },
            { p: "Venda quitada precisa de assinatura?", r: "Não. Na venda quitada a assinatura é opcional." },
            { p: "Errei um valor depois de concluir.", r: "Peça ao Financeiro para reabrir a OS (com motivo). A assinatura e a nota promissória anteriores deixam de valer." },
        ],
        chaves: ["ordem de serviço", "os", "assinatura", "pagamento", "nota promissória", "np", "desconto"],
    },
    {
        id: "orcamento",
        titulo: "Orçamento",
        rota: "/orcamento",
        menuIds: ["orcamento"],
        modulo: "atendimento",
        resumo: "Orçamento para a família com as mesmas regras da OS (sempre Particular). Vale 7 dias e pode virar atendimento.",
        passos: [
            "Toque em **Novo orçamento**.",
            "Em **Dados**, preencha **Nome do falecido**, **Contato** e **Telefone** (com DDD).",
            "Em **Itens**, responda Sim ou Não para Urna, Roupa (ou \"Roupa própria\"), Véu, Cordão São Francisco e Invol, e escolha os produtos.",
            "Em **Serviços**: Tanatopraxia, Ornamentação, Translado (**Distância (km)**, **Saindo de**, **Indo para**), **Velório no Memorial** (sala) e **Coroa de flores** (**Adicionar coroa** / **Tirar**).",
            "Em **Forma de pagamento combinada**, marque as formas (no crédito, as parcelas) e, se quiser, a observação.",
            "Confira o resumo, que é calculado na hora. Ajuste valores pelo ícone do item ou pelo desconto geral.",
            "Toque em **Salvar orçamento** (na edição: **Salvar e atualizar a folha**).",
            "Na lista, abra o orçamento para imprimir ou **Virar atendimento**.",
        ],
        cores: ["Filtros da lista: **Em aberto**, **Vencidos**, **Viraram atendimento**, **Cancelados** e **Todos**. A busca aceita falecido, contato, telefone ou número."],
        dicas: [
            "Obrigatórios: nome do falecido, contato, telefone com DDD, resposta em Urna, Roupa, Velório no Memorial e Coroa, e pelo menos uma forma de pagamento.",
            "O orçamento não mexe no estoque. A baixa só acontece no atendimento, no Corpo Pronto.",
        ],
        faq: [
            { p: "Por quanto tempo vale?", r: "7 dias depois de salvo. Depois disso aparece em Vencidos." },
            { p: "Virei o orçamento em atendimento. Preciso redigitar?", r: "Não. O Novo registro já abre preenchido; só complete o que falta." },
        ],
        chaves: ["orçamento", "proposta", "preço", "família"],
    },
    {
        id: "homenagens",
        titulo: "Homenagens",
        rota: "/mensagens",
        menuIds: ["homenagens"],
        modulo: "atendimento",
        resumo: "Moderação das mensagens enviadas pela família e pelos amigos (Legado de Luz) e geração do Livro de Homenagens.",
        passos: [
            "Escolha o filtro **Ativos**, **Sala 01**, **Sala 02**, **Sala 03** ou **Atendimento Externo**. Nas salas, o atendimento ativo abre sozinho; nos outros, busque e toque em **Buscar**.",
            "Em **Mensagens Pendentes**, toque em **Aprovar** ou **Excluir**.",
            "Em **Mensagens Aprovadas** fica o que já está publicado (também dá para excluir).",
            "**Baixar Mensagens** abre o \"Gerar Livro de Homenagens\": preencha o **Nome do falecido** (e, se quiser, Nascimento e Falecimento) e toque em **Gerar Livro de Homenagens**.",
            "**Abrir Legado de Luz** abre a página pública. **Atualizar mensagens** recarrega.",
        ],
        cores: [
            "Velório: **Em andamento** (verde), **Agendado** (azul), **Encerrado** (cinza), **Sem horário** (âmbar).",
            "**Aprovado pela Aurora**: aprovação automática, com o percentual de confiança.",
        ],
        dicas: [
            "Excluir pede confirmação e não pode ser desfeito.",
            "O livro usa só as mensagens aprovadas. Sem nenhuma aprovada, o botão fica desativado.",
        ],
        faq: [
            { p: "Por que a sala aparece vazia?", r: "Ela só mostra o atendimento em andamento no horário do velório." },
            { p: "Mensagem sem texto?", r: "Aparece como \"Homenagem enviada sem texto\" e pode trazer áudio, vídeo ou foto." },
        ],
        chaves: ["legado de luz", "livro", "mensagens", "moderação"],
    },
    {
        id: "avaliacao",
        titulo: "Visita de avaliação e Pós-atendimento",
        rota: "/avaliacao",
        menuIds: ["visita-avaliacao", "pos-atendimento"],
        modulo: "atendimento",
        resumo: "Painel das notas da Visita (feita durante a cerimônia) e do Pós-atendimento, com cobertura e desempenho dos colaboradores.",
        passos: [
            "Defina **Data inicial** e **Data final** (padrão: do dia 1º até hoje).",
            "Em **Tipo de avaliação**, escolha Visita + Pós, Somente Visita ou Somente Pós-Atendimento. Escolha o **Avaliador** ou deixe Todos.",
            "Ajuste o **Peso consolidado** (divide o peso entre Visita e Pós; padrão 50%/50%) e toque em **Atualizar**.",
            "Leia os cartões e as seções: Visita × Pós por etapa, Distribuição das notas, Desempenho por colaborador, Maiores divergências, Notas de atenção e Evolução das médias.",
            {
                titulo: "Fazer a visita (botão Visita, em Atendimentos)",
                passos: [
                    "Informe o **Nome do responsável** e o parentesco.",
                    "Dê nota a cada pergunta (1 · Muito ruim a 5 · Excelente, ou Não sei). A observação é opcional.",
                    "Se quiser, **Adicionar registro** tira fotos com legenda.",
                    "Escreva a **Conclusão** e toque em **Salvar rascunho** ou **Concluir visita**.",
                ],
            },
        ],
        cores: ["Notas: vermelho abaixo de 2,5; âmbar abaixo de 3,5; azul abaixo de 4,2; verde de 4,2 para cima."],
        dicas: [
            "\"Não sei\" e perguntas que não se aplicam não entram na média.",
            "Para concluir a visita, preencha responsável, parentesco e todas as notas aplicáveis.",
        ],
        faq: [
            { p: "O que é a Amostra?", r: "A quantidade de notas usadas na média de cada colaborador." },
            { p: "Posso terminar a visita depois?", r: "Sim. Salve o rascunho; o botão Visita fica \"Em andamento\"." },
        ],
        chaves: ["nota", "satisfação", "visita", "pós"],
    },
    {
        id: "coroas",
        titulo: "Coroa de Flores",
        rota: "/coroa-de-flores",
        menuIds: ["coroas"],
        modulo: "atendimento",
        resumo: "Pedidos de coroa (venda direta, loja on-line e coroas dos atendimentos), da confecção até a entrega.",
        passos: [
            {
                titulo: "Novo pedido",
                passos: [
                    "Toque em **NOVO**.",
                    "Escolha o **Atendimento** (preenche o falecido e o local do velório) ou digite o **Falecido(a)**.",
                    "Informe o **Local de Entrega** e a **Quantidade de Coroas**.",
                    "Para cada coroa: **Tipo**, **Depósito** (se artificial), **Modelo** e **Frase**. Há **Sugestões de frases**.",
                    "Escolha o **Convênio**: Particular ou uma Prefeitura. Na Prefeitura, responda \"A Prefeitura autorizou a coroa?\".",
                    "Preencha **Solicitante** e **Telefone** e toque em **Criar Pedido**.",
                ],
            },
            "Na aba **Confecção**, filtre e toque em **Buscar**. **Ver** mostra os detalhes; **Ações** avança o pedido (Confeccionando Coroa → Confeccionando Faixa → Coroa Finalizada → Entregue).",
            "A aba **Finalizadas** filtra por status, origem (Venda Direta, Loja On-line) e período, e traz o resumo de coroas por tipo.",
            "No detalhe: **Copiar Pedido**, **Notificar (WhatsApp)**, **Concluir venda** (ou **Ver OS**, se já pago) e **Comprovante**.",
        ],
        cores: ["Aguardando Confecção (cinza) → Coroa em Confecção (azul) → Faixa em Confecção (roxo) → Finalizada e Entregue (verde)."],
        dicas: [
            "De 1 a 20 coroas por pedido. A artificial exige o depósito (MEMORIAL ou FUNERÁRIA) e pula a etapa \"Confeccionando Coroa\".",
            "Para **Coroa Finalizada** é obrigatória a foto da coroa pronta (até 12 MB).",
            "Prefeitura autorizou = **Sim**: a coroa vai para a Prefeitura; modelo fora do pacote gera só a diferença para a família. **Não**: vira venda direta pelo preço particular.",
            "No particular, depois de salvar, a OS abre para **Concluir venda**.",
            "Pedidos da loja on-line já chegam pagos.",
            "Só a Gestão cancela pedido. A coroa de um atendimento é cancelada pelo registro do atendimento.",
        ],
        faq: [
            { p: "Até quando a coroa aparece no Quadro?", r: "Até ser marcada como Entregue." },
            { p: "Por que aparece atrasada?", r: "Natural com mais de 2 h sem ficar pronta, ou artificial com mais de 1 h." },
        ],
        chaves: ["coroa", "flores", "faixa", "pedido", "loja"],
    },
];

/* ============================================================================================
   COMUNICAÇÃO
   ============================================================================================ */

const COMUNICACAO: Topico[] = [
    {
        id: "messenger",
        titulo: "Messenger",
        rota: "/messenger",
        menuIds: ["messenger"],
        modulo: "comunicacao",
        resumo: "Conversas da equipe (individuais e em grupo) e atendimento dos clientes pelo WhatsApp. Funciona como o WhatsApp.",
        passos: [
            "Filtre a lista por **Tudo**, **Clientes**, **Grupos** e **Equipe**, ou use **Pesquisar**.",
            "**Conversar com um colega:** botão de nova conversa ou **Nova conversa**. **Criar grupo:** aba **Grupos** → **+ Criar grupo**.",
            "**Atender um cliente:** na aba **Clientes**, em **Aguardando atendimento**, toque em **Assumir**. A conversa passa a ser sua.",
            "**Escrever:** o clipe (**Anexar**) envia foto, documento, localização, contato ou **Nota interna**. Também há **Tirar foto**, **Emojis** e **Gravar áudio** (até 5 min).",
            "**Responder, reagir, encaminhar, fixar ou apagar:** abra as **Opções da mensagem**.",
            "**Passar para outra pessoa:** **Transferir**. **Terminar:** **Encerrar** (a conversa vai para o histórico).",
            "No topo da conversa com cliente: **Buscar**, **Cliente · contrato e parcelas**, **Etiquetas** e **Salvar contato**.",
            {
                titulo: "Painel do cliente",
                passos: [
                    "Veja o contrato, a **Situação**, as **Mensalidades em aberto** e os **Beneficiários**.",
                    "Gere **Link de Pagamento** ou **Pix**: o texto vai para o campo de mensagem para você revisar e enviar.",
                    "Envie o boleto de uma parcela ou marque **antecipar** para incluir parcelas futuras.",
                    "Em **Histórico ›** ficam os pagamentos (dá para mandar o recibo).",
                    "Telefone sem contrato? **Vincular a um contrato** (busca por contrato, CPF ou nome).",
                ],
            },
            "Fixar ou marcar como lida/não lida: no celular deslize a conversa; no computador use **Opções da conversa**.",
        ],
        cores: [
            "**⚠️ Falecimento** (vermelho): prioridade. **Na fila** (amarelo): cliente esperando. **Com Fulano**: outra pessoa atende.",
            "Envio: relógio = enviando; ✓ = enviada; ✓✓ = entregue; ✓✓ azuis = lida; **Falhou** = não enviada.",
            "Faixa verde **Janela de 24 h aberta até…**. Faixa amarela **Janela fechada**: só dá para mandar **Modelo** aprovado.",
            "**🤖 Mensagem automática**: enviada pela Aurora. Use 👍 ou 👎 para avaliar.",
        ],
        dicas: [
            "Só o responsável pelo atendimento responde ao cliente. Quem acompanha escreve só **Nota interna** (que o cliente não vê).",
            "Você só apaga mensagens suas, em conversas internas, até 15 minutos depois de enviar.",
            "Boleto e recibo pedem confirmação antes de sair.",
            "Se aparecer **Ativar notificações**, toque para receber aviso neste aparelho.",
            "Quando a Aurora prepara um orçamento, aparece uma faixa: confira e toque em **Conferido · colocar na mensagem** ou **Descartar**.",
        ],
        faq: [
            { p: "Não consigo responder o cliente.", r: "Confira se tocou em Assumir. Com a janela de 24 h fechada, envie um Modelo." },
            { p: "Onde está a conversa que encerrei?", r: "No Histórico de clientes (ícone de relógio no topo)." },
            { p: "Como mando o Pix da mensalidade?", r: "Painel do cliente → Pix → revise o texto e envie." },
        ],
        chaves: ["whatsapp", "chat equipe", "grupo", "cliente", "fila", "assumir", "transferir", "pix", "boleto"],
    },
    {
        id: "chat",
        titulo: "Chat (Aurora)",
        rota: "/chat",
        menuIds: ["chat"],
        modulo: "comunicacao",
        resumo:
            "Assistente interna. Consulta atendimentos, estoque, coroas e a Base de Conhecimento, gera arquivos e prepara ações que só acontecem depois da sua confirmação.",
        passos: [
            "Toque numa sugestão pronta ou escreva em **Pergunte à Aurora...**.",
            "Para falar, segure o microfone e solte para enviar o áudio.",
            "Para mandar imagem ou PDF (até 15 MB), use **Anexar imagem ou PDF** ou **Tirar foto**.",
            "Quando a Aurora prepara uma ação, aparece um cartão: **Confirmar** (ou **Criar requisição**) ou **Cancelar**. Também vale responder \"sim\" ou \"não\".",
            "Arquivos gerados (PDF, Excel, CSV): **Baixar**. Links de pagamento: **Abrir** ou **Copiar**.",
            "**Novo chat** começa uma conversa do zero.",
        ],
        cores: ["Cartões de ação: **Aguardando confirmação**, **Executando**, **Concluída**, **Cancelada** ou **Expirada**. Em erro: **Tentar novamente**."],
        dicas: [
            "A Aurora só faz o que o seu usuário tem permissão (definido em Permissões › Funções Aurora).",
            "Confirmação expirada não vale: peça para preparar a ação de novo.",
        ],
        faq: [
            { p: "A Aurora faz algo sem eu mandar?", r: "Não. Ações só acontecem depois da sua confirmação." },
            { p: "De onde vem a resposta?", r: "Quando usa a Base de Conhecimento, ela mostra as fontes consultadas." },
        ],
        chaves: ["aurora", "ia", "inteligência artificial", "assistente", "perguntar"],
    },
    {
        id: "avisos",
        titulo: "Avisos",
        rota: "/avisos",
        menuIds: ["avisos"],
        modulo: "comunicacao",
        resumo: "Mural de avisos da equipe, com avisos gerais e observações dos atendimentos em andamento.",
        passos: [
            "Escreva o aviso e envie. Ele é publicado como aviso \"Geral\".",
            "Para um atendimento, escolha o falecido e use **Adicionar Observação** → digite → **Adicionar**.",
            "Edite ou exclua um aviso quando precisar (excluir pede confirmação).",
        ],
        dicas: [
            "Aviso vazio não é enviado.",
            "Observação só pode ser feita em atendimento que ainda está no Quadro; ela some quando o atendimento sai do Quadro.",
            "O sino do cabeçalho mostra quando há avisos novos.",
        ],
        chaves: ["mural", "comunicado", "observação", "sino"],
    },
    {
        id: "messenger-config",
        titulo: "Configurações do Messenger",
        rota: "/messenger-config",
        menuIds: ["messenger-config"],
        modulo: "comunicacao",
        resumo: "Cadastros e regras usados pelo Messenger e pela Aurora. As mudanças valem na hora.",
        passos: [
            "Abas: **Respostas rápidas**, **Setores**, **Etiquetas**, **Mensagens automáticas** e **Geral**.",
            "**Respostas rápidas:** **+ Nova** → **Atalho** e **Texto** → **Salvar**. Na conversa, digite \"/\" e escolha. **Da empresa** aparece para todos; **Minhas respostas** só para você.",
            "**Mensagens automáticas:** boas-vindas e menu de setores, comprovantes, quem manda áudio, fora do horário, avaliação, **Aurora no atendimento** (ligada/desligada, orientações) e **Encerrar conversa parada**. Termine em **Salvar mensagens automáticas**.",
            "**Geral:** nome do atendente para o cliente, limites de conversas fixadas e etiquetas, preços da Meta, cópia dos contratos da Unymos (**Atualizar contratos agora**) e como salvar fotos e documentos neste aparelho.",
        ],
        dicas: [
            "Só quem tem \"Messenger · Configurações\" altera os itens da empresa.",
            "Avaliação e mensagem de encerramento só saem com a janela de 24 h aberta.",
            "Com um só setor ativo, o menu de setores não aparece.",
            "O encerramento automático nunca encerra falecimento nem cliente na fila.",
        ],
        chaves: ["resposta rápida", "setor", "etiqueta", "boas-vindas", "horário"],
    },
    {
        id: "messenger-habilidades",
        titulo: "Habilidades da Aurora",
        rota: "/messenger-habilidades",
        menuIds: ["messenger-habilidades"],
        modulo: "comunicacao",
        resumo: "Como a Aurora atende em cada setor: o que orienta, quais dados pede, se pode resolver sozinha e que parte da Base consulta.",
        passos: [
            "Escolha um setor.",
            "Preencha as **Instruções do setor** e os **Dados a coletar antes de passar** (um por linha).",
            "Ligue ou desligue **Pode resolver sozinha** e marque os departamentos em **Base de Conhecimento deste setor**.",
            "Toque em **Salvar habilidade**.",
        ],
        dicas: [
            "Falecimento ou pedido de atendente passa para uma pessoa na hora. Reclamação e cancelamento sempre vão para uma pessoa.",
            "Com a Aurora desligada, as habilidades só valem quando ela for ligada.",
            "Sem setores na lista? Cadastre em Configurações do Messenger › Setores.",
        ],
        chaves: ["aurora", "setor", "robô"],
    },
    {
        id: "messenger-testes",
        titulo: "Testes da Aurora",
        rota: "/messenger-testes",
        menuIds: ["messenger-testes"],
        modulo: "comunicacao",
        resumo: "Teste a Aurora antes de ela falar com clientes: converse como se fosse um cliente ou rode cenários avaliados automaticamente.",
        passos: [
            "**Conversar:** escreva em \"Escreva como se fosse o cliente…\". Para simular um associado, preencha **Simular associado (nº do contrato)**; para um anúncio, **Simular lead de anúncio**. **Reiniciar conversa** começa do zero.",
            "**Cenários:** marque os cenários (ou use **Marcar:** Todos, Só os fixos, Reprovados…) e toque em **Rodar** ou **Comparar com o último**.",
            "**Criar cenário:** **+ Criar cenário** → descreva a situação → **Gerar cenário** → **Salvar** ou **Salvar e rodar agora**.",
            "Em **Última rodada** veja **O que falhou** e os **Pontos fortes**. **Copiar relatório** copia o resultado.",
        ],
        cores: ["**última nota** verde = aprovado; vermelho = reprovado. **novo** = nunca rodado."],
        dicas: ["Nada é enviado de verdade: coroa, proposta e link de pagamento são só simulados."],
        chaves: ["simulador", "cenário", "teste"],
    },
    {
        id: "messenger-aprendizado",
        titulo: "Aprendizado da Aurora",
        rota: "/messenger-aprendizado",
        menuIds: ["messenger-aprendizado"],
        modulo: "comunicacao",
        resumo: "Melhorias propostas a partir dos testes, atendimentos e avaliações. Nada muda na Aurora sem aprovação aqui.",
        passos: [
            "Toque em **Analisar agora** (até 2 minutos) ou espere a análise da noite.",
            "**Comandos da Gestão:** escreva o comando e o **Assunto** → **Conferir conflitos** → **Salvar comando**.",
            "**Lições:** **Aprovar** ou **Rejeitar**. Aprovada pode ser **Desativar**/**Reativar**.",
            "**Para a Base:** complete os trechos [PREENCHER], copie para a Base de Conhecimento e toque em **Publicado na Base** (ou **Descartar**).",
            "Nas abas **Exemplos** e **Cenários de teste**, aprove o que vale a pena. **Avaliações da equipe** mostra os 👍/👎.",
        ],
        cores: ["Verde = aprovada/ativa/publicada. Amarelo = aguardando decisão. Cinza = rejeitada ou desativada."],
        dicas: ["Comando que conflita com regra fixa ou com a Base não é salvo. Comandos valem na hora e pesam mais que lições."],
        chaves: ["lição", "comando", "aurora"],
    },
    {
        id: "messenger-monitor",
        titulo: "Monitoramento do atendimento",
        rota: "/messenger-monitor",
        menuIds: ["messenger-monitor"],
        modulo: "comunicacao",
        resumo: "Situação do atendimento do WhatsApp agora e no período. Atualiza sozinho a cada 30 segundos.",
        passos: [
            "Escolha o **Período** (Hoje, 7 dias, 30 dias, Este mês). **Atualizar agora** atualiza na hora.",
            "Indicadores: **Na fila agora**, **Maior espera**, **Em atendimento**, **Atendentes online** e **Nota média**.",
            "Seções: Setores, Fila de espera, Atendentes (1ª resposta, encerrados, nota), Atendimentos por dia, Por etiqueta, Avaliações, Mensagens e **Custos da Meta**.",
            "Em **O que os clientes perguntam**, veja as perguntas mais frequentes e a lista **Falta na Base**.",
        ],
        dicas: ["As primeiras 1.000 mensagens de serviço do mês são grátis na Meta. Os preços ficam em Configurações › Geral."],
        chaves: ["fila", "indicadores", "custo meta"],
    },
    {
        id: "messenger-comprovantes",
        titulo: "Comprovantes",
        rota: "/messenger-comprovantes",
        menuIds: ["messenger-comprovantes"],
        modulo: "comunicacao",
        resumo: "Comprovantes de pagamento enviados pelos clientes no WhatsApp. A Aurora lê valor e data; uma pessoa dá a baixa; o Financeiro confere na conta.",
        passos: [
            "Filtre: **1 · Aguardando baixa**, **2 · Conferir na conta**, **Concluídos**, **Divergentes**, **Não é comprovante**, **Todos**, **Retirados**.",
            "Abra o comprovante e confira **Valor** e **Pago em** com o contrato. Sem contrato? Busque e **Vincular**.",
            "Dê a baixa no UnyPax e toque em **Baixa registrada** (ou **Baixa registrada e enviar recibo**, escolhendo a parcela).",
            "Algo errado? **Divergente** ou **Não é comprovante**.",
            "**Financeiro:** em **2 · Conferir na conta**, marque e toque em **Conferido na conta** ou **Não caiu na conta**.",
        ],
        cores: ["Azul = Aurora lendo / baixa feita. Amarelo = aguardando baixa. Verde = conferido. Vermelho = divergente. Cinza = não é comprovante / retirado."],
        dicas: [
            "Sem contrato vinculado não dá para registrar a baixa.",
            "Só Financeiro ou Gestão usam **Retirar da lista** (com motivo) e **Devolver para a lista**.",
            "Fora da janela de 24 h, o recibo fica guardado e sai quando o cliente escrever de novo.",
        ],
        chaves: ["baixa", "pagamento", "recibo", "unypax"],
    },
    {
        id: "messenger-disparos",
        titulo: "Monitor de disparos",
        rota: "/messenger-disparos",
        menuIds: ["messenger-disparos"],
        modulo: "comunicacao",
        resumo: "Campanhas de mensagens automáticas pelo WhatsApp (ex.: lembrete de mensalidade) e o histórico dos envios.",
        passos: [
            "**Nova campanha:** **Nome**, **Tipo**, **Quando dispara** (dias antes/depois do vencimento; 0 = no dia), **Nome do modelo aprovado na Meta** e **Texto do modelo**.",
            "**Situação:** **Desligada**, **Teste (só a lista)** ou **Ligada (todos)**.",
            "Antes de ligar, use **Prévia de hoje** e **Envio de teste**.",
            "**Rodar agora** dispara na hora (com confirmação). **Arquivar** guarda a campanha.",
            "Em **Histórico por dia** (30 dias), veja execuções, envios e falhas.",
        ],
        cores: ["Verde = Ligada. Amarelo = Em teste. Cinza = Desligada/Arquivada."],
        dicas: [
            "Criar, mudar e disparar é só para a Gestão.",
            "As campanhas rodam sozinhas uma vez por dia; ninguém recebe duas vezes pela mesma mensalidade.",
            "Contratos cancelados, suspensos ou sem celular aparecem como \"pulados\".",
        ],
        chaves: ["campanha", "lembrete", "cobrança", "mensalidade"],
    },
    {
        id: "messenger-funil",
        titulo: "Funil de vendas",
        rota: "/messenger-funil",
        menuIds: ["messenger-funil"],
        modulo: "comunicacao",
        resumo: "Interessados em plano (leads) por etapa: Novo → Em conversa → Proposta enviada → Ficha preenchida → Fechado ou Perdido.",
        passos: [
            "Use a busca ou o filtro **Responsável**.",
            "**Novo lead:** nome, telefone, plano, **Próximo contato**, **Próximo passo** e **Anotações** → **Incluir no funil**.",
            "Mude a etapa arrastando o cartão (computador) ou em **Mover para…**. **Perdido** exige o motivo.",
            "**Abrir conversa** leva ao WhatsApp. **Histórico** mostra as mudanças do cartão.",
        ],
        cores: ["Data de próximo contato em vermelho = já chegou ou passou. Cartão \"Aurora\" = criado pela Aurora, ainda sem responsável."],
        dicas: ["Proposta, Ficha e Fechado/Perdido mudam sozinhos a partir das Propostas de adesão."],
        chaves: ["lead", "venda", "plano", "kanban"],
    },
    {
        id: "messenger-funil-gestao",
        titulo: "Gestão do funil",
        rota: "/messenger-funil-gestao",
        menuIds: ["messenger-funil-gestao"],
        modulo: "comunicacao",
        resumo: "Resultados das vendas pelo WhatsApp: conversão, origem dos leads, desempenho por atendente e perdas.",
        passos: [
            "Escolha o período (Este mês, Mês passado, 90 dias, Este ano), defina quantos dias contam como \"parado\" e toque em **Atualizar**.",
            "Veja **Funil do período**, **Origem dos leads**, **Desempenho por atendente**, **Motivos de perda** e **Leads parados**.",
            "**Abrir o funil** volta ao quadro de cartões.",
        ],
        dicas: ["A porcentagem de cada etapa mostra quantos passaram da etapa anterior. A Aurora aparece como uma linha própria."],
        chaves: ["conversão", "vendas", "relatório"],
    },
    {
        id: "messenger-propostas",
        titulo: "Propostas de adesão",
        rota: "/messenger-propostas",
        menuIds: ["messenger-propostas"],
        modulo: "comunicacao",
        resumo: "Vendas fechadas pelo WhatsApp: o cliente preenche a ficha e o Administrativo lança na Unymos.",
        passos: [
            "Filtre: **Todas**, **Para lançar**, **Aguardando ficha**, **Cadastradas**, **Desistências**.",
            "Abra a proposta. Os dados vêm na ordem do cadastro da Unymos, com **Copiar** em cada campo.",
            "Depois de lançar, preencha o **Número do contrato na Unymos** e toque em **Marcar como cadastrada**.",
            "Desistiu? **Desistiu**. **Imprimir ficha** gera a ficha em papel.",
        ],
        cores: ["Amarelo = Ficha preenchida · lançar. Azul = Aguardando a ficha. Verde = Cadastrada. Cinza = Desistiu."],
        chaves: ["adesão", "ficha", "unymos", "contrato"],
    },
    {
        id: "messenger-ocorrencias",
        titulo: "Ocorrências",
        rota: "/messenger-ocorrencias",
        menuIds: ["messenger-ocorrencias"],
        modulo: "comunicacao",
        resumo: "Problemas encontrados pela Aurora nos atendimentos encerrados (reclamação, risco de cancelamento, erro de cobrança, falha) para a Gestão tratar.",
        passos: [
            "Em **Aurora acompanhante**, ligue ou desligue **Ligada**, **Etiquetar**, **Ocorrências** e **Leads**.",
            "Filtre por situação, **Gravidade** ou **Tipo**.",
            "Abra a ocorrência, defina o **Responsável**, registre **O que foi feito** e toque em **Em tratamento**, **Resolvida** ou **Descartar** (**Reabrir** volta a tratar).",
        ],
        cores: ["Vermelho = gravidade alta (notifica a Gestão). Amarelo = média. Cinza = baixa."],
        dicas: ["Para resolver ou descartar é obrigatório escrever o que foi feito."],
        chaves: ["reclamação", "problema", "cancelamento"],
    },
    {
        id: "historico-clientes",
        titulo: "Histórico de clientes",
        rota: "/messenger-historico",
        menuIds: ["historico-clientes"],
        modulo: "gestao",
        resumo: "Atendimentos de clientes do WhatsApp já encerrados, só para leitura.",
        passos: [
            "Busque por nome ou telefone e toque em **Buscar**.",
            "A lista mostra **Cliente**, **Responsável** e **Encerrado**. **Carregar mais** traz os mais antigos.",
            "Escolha um atendimento para ler a conversa e as transferências.",
            "**Voltar ao Messenger** retorna às conversas.",
        ],
        chaves: ["encerrados", "conversas antigas", "whatsapp"],
    },
    {
        id: "conhecimento",
        titulo: "Conhecimento IA (Base da Aurora)",
        rota: "/conhecimento",
        menuIds: ["conhecimento"],
        modulo: "gestao",
        resumo: "Regras, procedimentos e manuais que a Aurora usa para responder.",
        passos: [
            "**Adicionar conhecimento:** **Título**, **Departamento**, **Natureza** e, se quiser, **Descrição**.",
            "Em **Origem**, escolha **Arquivo** (PDF, TXT, Markdown ou DOCX) ou **Texto** e toque em **Criar conhecimento**.",
            "Abra o documento e toque em **Publicar** para a Aurora passar a usar. Também há **Editar**, **Analisar conflitos**, **Reprocessar**, **Arquivar**, **Reativar** e **Nova versão**.",
            "Abas: **Documentos**, **Ativos**, **Em análise**, **Rascunhos**, **Alertas** e **Arquivos**.",
            "Em **Alertas**, **Resolver** ou **Ignorar** cada possível conflito.",
        ],
        cores: ["Verde = Ativo. Azul = Em análise/Processando. Amarelo = Rascunho. Cinza = Arquivado/Substituído. Vermelho = erro."],
        dicas: [
            "Arquivo só pode ser publicado depois de processado. Se der erro, **Reprocessar**.",
            "Para atualizar sem perder o antigo, use **Nova versão** (nasce como rascunho).",
            "Quais departamentos a Aurora usa para cada pessoa é definido em Permissões › Conhecimento IA.",
        ],
        chaves: ["base de conhecimento", "documento", "manual", "aurora"],
    },
];

/* ============================================================================================
   REQUISIÇÕES
   ============================================================================================ */

const REQUISICOES: Topico[] = [
    {
        id: "requisicoes-fluxo",
        titulo: "Como funciona uma requisição",
        rota: "/requisicao",
        menuIds: ["solicitar-produto", "minhas-solicitacoes", "requisicoes", "dashboard-requisicoes"],
        modulo: "requisicoes",
        resumo: "O caminho do material entre setores, do pedido à entrega. A página Requisição de Material reúne as suas requisições abertas e os atalhos do módulo.",
        passos: [
            "Quem precisa pede em **Solicitar Produto** → status **Pendente**.",
            "O estoque, em **Requisições**, escolhe a origem e toca em **Iniciar** → **Em separação**.",
            "Depois de separar, toca em **Enviar** → **Em trânsito**.",
            "Quem pediu confirma em **Requisição de Material** → **Confirmar recebimento** → **Entregue**.",
            {
                titulo: "Na Requisição de Material",
                passos: [
                    "Em **Suas requisições abertas** veja as Pendentes, Em separação e Em trânsito.",
                    "**Cancelar minha requisição:** preencha o motivo e **Confirmar cancelamento** (só enquanto Pendente ou Em separação).",
                    "**Confirmar recebimento:** em transferência, digite o **Estoque atualizado** de cada item (já somando o que chegou). Veio quantidade diferente? **Chegou quantidade diferente?** O botão libera com **Tudo preenchido**.",
                ],
            },
        ],
        cores: [
            "Pendente (azul-claro) · Em separação (azul) · Em trânsito (azul-escuro) · Entregue (verde) · Recusada (vermelho) · Cancelada (cinza).",
            "Selo amarelo **+24h** = requisição atrasada.",
        ],
        dicas: [
            "O estoque pode **Recusar** (com motivo) enquanto a requisição está Pendente ou Em separação.",
            "Requisições automáticas (reposição) não podem ser canceladas; quem recebe o material confirma.",
            "No recebimento a contagem é \"às cegas\": a tela não mostra o saldo do sistema.",
        ],
        faq: [
            { p: "Não aparece Confirmar recebimento.", r: "Ele só aparece quando a requisição está Em trânsito." },
            { p: "Posso cancelar depois do envio?", r: "Não. Só enquanto está Pendente ou Em separação." },
        ],
        chaves: ["requisição", "material", "pedido", "transferência", "recebimento", "status"],
    },
    {
        id: "solicitar-produto",
        titulo: "Solicitar Produto",
        rota: "/solicitar-produto",
        menuIds: ["solicitar-produto"],
        modulo: "requisicoes",
        resumo: "Criar uma nova requisição de material.",
        passos: [
            "Escolha o **Destino ou Setor**.",
            "Em **Produto**, digite o nome ou o código. A lista mostra o saldo total.",
            "Confira **Quantidade total**, **Valor de venda** e **Distribuição por local**.",
            "Preencha a **Quantidade** (e a **Observação**, se quiser) e toque em **Adicionar item**.",
            "Repita para cada produto e toque em **Enviar requisição**.",
        ],
        cores: [
            "O primeiro produto define o tipo: **Reposição de Estoque** (transferência), **Consumo Interno** (saída) ou **Insumos Para Atendimentos Funerários** (transferência). Depois, **Somente compatíveis** filtra a lista.",
        ],
        dicas: [
            "Só dá para pedir produto com saldo e quantidade maior que zero.",
            "Não misture tipos diferentes na mesma requisição; abra outra.",
            "Cada produto entra uma vez. Para mudar a quantidade, remova e adicione de novo.",
        ],
        faq: [{ p: "Apareceu \"Este produto pertence ao tipo...\".", r: "Ele é de outro tipo. Faça uma requisição separada para ele." }],
        chaves: ["pedir", "nova requisição", "material"],
    },
    {
        id: "minhas-solicitacoes",
        titulo: "Minhas Solicitações",
        rota: "/minhas-solicitacoes",
        menuIds: ["minhas-solicitacoes"],
        modulo: "requisicoes",
        resumo: "Histórico de todas as suas requisições (só consulta).",
        passos: [
            "Filtre pelo **Status** (no celular, pelos botões Todas, Pendente, Em separação…).",
            "Busque por produto, código ou destino e aperte Enter.",
            "Toque numa requisição para ver Destino, Origem, Justificativa, Itens, **Linha do tempo** e, se houver, o **Motivo da recusa** ou do cancelamento.",
            "**Atualizar** recarrega a lista.",
        ],
        dicas: ["Para cancelar ou confirmar o recebimento, use a tela Requisição de Material."],
        chaves: ["histórico", "minhas requisições"],
    },
    {
        id: "requisicoes",
        titulo: "Requisições (fila do estoque)",
        rota: "/requisicoes",
        menuIds: ["requisicoes"],
        modulo: "requisicoes",
        resumo: "Fila de trabalho do estoque: separar, enviar ou recusar requisições.",
        passos: [
            "Cada cartão mostra itens, solicitante, destino, abertura, atendimento e o \"Próximo passo\".",
            "**Pendente:** toque em **Iniciar**, escolha o **Estoque de origem deste item** de cada item e toque em **Iniciar separação**.",
            "**Em separação:** toque em **Enviar**, confira o depósito de origem e toque em **Enviar**.",
            "Para recusar: **Recusar** → **Motivo da recusa** (obrigatório) → confirmar.",
        ],
        cores: ["Em trânsito o botão mostra **Aguardando recebimento** (desativado). Borda amarela e **+24h** = atrasada."],
        dicas: [
            "Só aparecem como origem os estoques com saldo suficiente; o destino não pode ser origem.",
            "A origem escolhida ao iniciar não muda no envio.",
            "Concluídas, recusadas e canceladas saem da fila sozinhas.",
        ],
        faq: [{ p: "\"Nenhum estoque tem saldo suficiente para este item\".", r: "Faça antes uma entrada ou transferência no Estoque." }],
        chaves: ["separar", "enviar", "recusar", "fila"],
    },
    {
        id: "dashboard-requisicoes",
        titulo: "Dashboard Requisições",
        rota: "/dashboard-requisicoes",
        menuIds: ["dashboard-requisicoes"],
        modulo: "requisicoes",
        resumo: "Visão geral das requisições: contagem por status, atrasos e consulta detalhada.",
        passos: [
            "Toque em **Filtrar** e preencha o que precisar (datas, Status, Atrasadas, Busca, Solicitante, Destino, Origem, ID de atendimento, Produto) → **Aplicar filtros**.",
            "Em **Distribuição por status**, toque num status para filtrar.",
            "Em **Alertas**, **Em trânsito acima de 24h** mostra só as atrasadas.",
            "Na lista, escolha os **Registros por página** e abra os **Detalhes**. Também é possível exportar CSV.",
        ],
        dicas: ["Os filtros ativos aparecem como etiquetas; toque para remover."],
        chaves: ["indicadores", "atraso", "relatório", "csv"],
    },
];

/* ============================================================================================
   ESTOQUE
   ============================================================================================ */

const ESTOQUE: Topico[] = [
    {
        id: "estoque",
        titulo: "Estoque",
        rota: "/estoque",
        menuIds: ["estoque"],
        modulo: "estoque",
        resumo: "Gestão completa do estoque em abas: Produtos, Movimentações, Conferência, Histórico e Cadastros.",
        passos: [
            {
                titulo: "Produtos",
                passos: [
                    "Pesquise por nome, código de barras, categoria ou fabricante e use **Filtros**.",
                    "**Exportar**: Planilha CSV, Excel, PDF ou Etiquetas (TAG).",
                    "**Novo produto** cadastra um item novo.",
                ],
            },
            {
                titulo: "Movimentações",
                passos: [
                    "Escolha **Transferência** (Origem, Destino, Solicitante), **Entrada** (Local de entrada, Frete total, e para cada produto **Qtd** e **Custo/un.** → **Adicionar à lista**) ou **Confecção** (insumos usados e quantidade produzida).",
                    "Conclua e toque em **Confirmar**. **Ler código de barras** usa a câmera.",
                ],
            },
            {
                titulo: "Conferência (contagem)",
                passos: [
                    "**+ Nova conferência** → escolha o **Local** (e, se quiser, categoria, fabricante, **Contagem cega** e **Incluir produtos sem saldo**) → **Criar e começar a contar**.",
                    "Conte os itens. **Bipar (+1)** soma uma unidade a cada leitura.",
                    "**Salvar e sair** para continuar depois. Para terminar: **Revisar** → **Concluir** (**Concluir sem ajustar** ou **Concluir e ajustar saldos**).",
                ],
            },
            "**Histórico:** busque por lançamento, produto, depósito ou requisição, no período escolhido.",
            "**Cadastros:** Ajuste de saldos (motivo obrigatório), Materiais de Assistência, Depósitos, Categorias, Fabricantes, exportar e importar CSV.",
        ],
        cores: ["Ponto de alerta = **Abaixo do mínimo**. Conferência: Pendente, Confere, Contado e Concluída."],
        dicas: [
            "Na contagem cega o saldo do sistema fica oculto.",
            "\"Concluir e ajustar saldos\" só aparece quando há diferença.",
        ],
        faq: [
            { p: "Como corrijo um saldo errado?", r: "Cadastros › Ajuste de saldos: informe o novo saldo e o motivo." },
            { p: "Posso pausar uma conferência?", r: "Sim. Salvar e sair; ela fica em Em andamento." },
        ],
        chaves: ["produto", "entrada", "transferência", "confecção", "conferência", "inventário", "contagem", "saldo"],
    },
    {
        id: "consulta",
        titulo: "Consulta de produtos",
        rota: "/produtos",
        menuIds: ["consulta"],
        modulo: "estoque",
        resumo: "Consulta rápida do saldo dos produtos de venda (mercadoria, produto acabado e serviços).",
        passos: [
            "Digite em **Pesquisar produto pelo nome…**.",
            "**Filtros:** **Somente alerta**, **Ocultar zerados**, Depósito, Categoria e Fabricante → **Aplicar filtros**.",
            "Toque num produto para ver fotos, descrição e **Distribuição do estoque** por local.",
            "**Ver preço** mostra o preço (que se esconde de novo a cada produto aberto).",
        ],
        dicas: ["Insumos não aparecem aqui: só produtos de venda."],
        chaves: ["saldo", "preço", "produto"],
    },
    {
        id: "assistencia",
        titulo: "Assistência (materiais)",
        rota: "/assistencia",
        menuIds: ["assistencia"],
        modulo: "estoque",
        resumo: "Lista de materiais de assistência (Categoria › Item › Subitem) e consulta das conferências feitas nos atendimentos.",
        passos: [
            "Em **Materiais**: **+ Categoria**, **+ Item** e **+ Subitem**. Cada um tem **Editar** e **Excluir** (Nome, Ordem, Ativo → **Salvar**).",
            "**Duplicar** copia uma categoria com tudo dentro. **Mostrar inativos** mostra os desativados.",
            "Em **Conferências**, busque por registro, falecido ou observação e abra para ver os itens.",
        ],
        cores: ["Ponto verde / **Conforme** = tudo certo. Ponto âmbar / **Não Conforme** = há pendências."],
        dicas: ["Excluir uma categoria apaga também os itens e subitens dela."],
        chaves: ["materiais", "conferência", "checklist"],
    },
    {
        id: "catalogo",
        titulo: "Catálogo",
        rota: "/catalogo",
        menuIds: ["catalogo"],
        modulo: "estoque",
        resumo: "Monte com a família o orçamento de uma homenagem, com fotos e preços.",
        passos: [
            "Toque em **ELEMENTOS DE HOMENAGEM**.",
            "Escolha o operador e preencha **Responsável**, **Falecido(a)** e **Telefone**.",
            "Navegue pelos menus e escolha os produtos. **Tabela de valores** mostra o preço. **PRÓXIMO PASSO** avança; **Retornar** volta.",
            "Na última etapa, **Concluir** → na **Revisão da Homenagem** informe a forma de pagamento → **FINALIZAR**.",
            "Em **LISTA DE ORÇAMENTOS**, busque e abra o resumo para **Imprimir (PDF)**.",
        ],
        dicas: ["Etapa obrigatória exige pelo menos um item. Crédito aceita de 1 a 24 parcelas."],
        chaves: ["homenagem", "orçamento", "vitrine"],
    },
    {
        id: "config-catalogo",
        titulo: "Configurações do catálogo",
        rota: "/config-catalogo",
        menuIds: ["config-catalogo"],
        modulo: "estoque",
        resumo: "Monte a árvore de menus do Catálogo, os produtos de cada menu e as etapas (Próximo passo).",
        passos: [
            "**Menus e Submenus:** **+ Menu (Raiz)**, **+ Submenu (Filho)**, **Renomear**, **Excluir**, **Expandir**/**Encolher**.",
            "Selecione um menu e, em **Produtos deste menu/submenu**, marque os produtos → **Salvar produtos**.",
            "**Fluxo:** escolha ou **+ Criar fluxo**, adicione etapas com **+ Step** (**Usar nó selecionado**, Obrigatório, Máx. seleção, Ativo), organize com **Subir**/**Descer**/**Remover** e toque em **Salvar fluxo**.",
        ],
        dicas: ["Excluir um menu pode apagar os submenus dele."],
        chaves: ["catálogo", "menu", "fluxo"],
    },
    {
        id: "relatorio-sintetico",
        titulo: "Relatório sintético",
        rota: "/relatorio-sintetico",
        menuIds: ["relatorio-sintetico"],
        modulo: "estoque",
        resumo: "Situação completa de um produto: estoque, saídas, custos e preço.",
        passos: [
            "Digite o nome ou o código de barras e escolha o produto.",
            "Veja **Estoque atual**, **Quantidade de saída**, **Custo médio móvel**, **Preço de venda**, **Margem bruta unitária** e **Valor em estoque**.",
            "Seções: Estoque por depósito, Resumo de saídas (30 dias, cobertura), Memória do custo médio, Lotes atuais e Últimas saídas.",
        ],
        dicas: ["Cobertura = quantos dias o estoque dura no ritmo dos últimos 30 dias. \"Sem consumo\" = não houve saídas."],
        chaves: ["custo médio", "margem", "cobertura"],
    },
];

/* ============================================================================================
   FINANCEIRO
   ============================================================================================ */

const FINANCEIRO: Topico[] = [
    {
        id: "financeiro",
        titulo: "Financeiro da OS",
        rota: "/os/financeiro",
        menuIds: ["financeiro"],
        modulo: "financeiro",
        resumo: "Vendas e recebimentos das Ordens de Serviço: lançar pagamentos, fechar, reabrir, estornar e converter OS.",
        passos: [
            "Use os **Filtros** (período, tipo, situação, pagamento, agente, convênio). Também dá para exportar.",
            "Cartões: **Total de vendas**, **A receber**, **Recebido no período**, **NPs abertas**, **A concluir** e **Cobertura dos planos**. Toque em **A receber** para filtrar.",
            "Abra uma OS. Em **Registrar recebimento**: **Forma**, **Data**, **Valor**, **Observação** e **Comprovante** → **Lançar recebimento**.",
            "Outras ações: **Ver folha da OS**, **Fechar OS**, **Reabrir OS**, **Converter para Prefeitura** e **Estornar**.",
            "Na OS da Prefeitura aparecem os **Pacotes e serviços da OS** (valores de contrato).",
        ],
        cores: [
            "**PAGO** (verde), **PAGO PARCIAL** (amarelo), **A RECEBER**.",
            "Nota promissória: **NP ABERTA**, **NP BAIXADA**, **NP SUBSTITUÍDA**.",
            "**OS cancelada** (vermelho): não recebe lançamentos nem entra nos totais.",
        ],
        dicas: [
            "Comprovante obrigatório, exceto no Dinheiro (foto ou PDF até 15 MB).",
            "Fechar e reabrir pedem motivo (mínimo 5 caracteres).",
            "Só OS cobradas da família (Particular, Diferenças e Coroa) e já fechadas podem ser reabertas. Ao reabrir, assinatura e nota promissória anteriores deixam de valer.",
            "Converter para Prefeitura só aparece em OS Particular fechada. Estornar e converter são restritos.",
        ],
        faq: [
            { p: "A família pediu troca de item numa OS assinada.", r: "Reabrir OS (com motivo), altere os itens e colha nova assinatura." },
            { p: "Lancei um valor errado.", r: "Peça o estorno. O lançamento fica no histórico marcado como estornado." },
        ],
        chaves: ["recebimento", "pagamento", "estorno", "reabrir", "prefeitura", "np"],
    },
    {
        id: "os-relatorio",
        titulo: "Relatório de OS",
        rota: "/os/relatorio",
        menuIds: ["os-relatorio"],
        modulo: "financeiro",
        resumo: "Relatórios das Ordens de Serviço numa só tela.",
        passos: [
            "Toque em **Relatórios** e escolha: **Particular – Cálculo de Bônus**, **Particular – Completo**, **Prefeitura – Prestação de Contas**, **Sócio – Acompanhamento**, **Coroas** ou **Pendências**.",
            "Use os **Filtros** (período, tipo, situação, agente, convênio).",
            "Toque numa OS para ver o resumo e gerar **PDF** ou **Imprimir**. Exporte o relatório completo quando precisar.",
        ],
        dicas: ["Os relatórios Particular abrem só com OS concluídas e assinadas. Para ver as abertas, inclua essa situação no filtro."],
        chaves: ["bônus", "prestação de contas", "relatório"],
    },
    {
        id: "convenio",
        titulo: "Convênios",
        rota: "/convenio",
        menuIds: ["convenio"],
        modulo: "financeiro",
        resumo: "Cadastro dos convênios (planos e prefeituras) e dos pacotes de cada um, com itens incluídos e valores de contrato.",
        passos: [
            "**Novo convênio** ou **Ver / Editar** um convênio da lista.",
            "Em **Dados do convênio**, preencha nome, ordem, status, observação e como entra na OS → **Criar convênio** / **Salvar dados**.",
            "**Novo pacote:** escolha o tipo **Atendimento** (aparece no registro do atendimento) ou **Produto** (ex.: coroa).",
            "Preencha **Nome do pacote** e **Vigente a partir de**, marque **Inclui no pacote** em cada item e escolha o produto padrão.",
            "Na Prefeitura, preencha os **Valores do contrato**.",
            "Marque **Pacote ativo** (e **Pacote padrão**, se for o caso) → **Salvar pacote**. Também dá para **Duplicar**, **Subir**/**Descer** e **Excluir pacote**.",
        ],
        cores: ["**Ativo** (verde), **Inativo** (cinza), **Padrão** (azul), **OS não configurada** (amarelo)."],
        dicas: [
            "O pacote precisa de pelo menos um item marcado Sim.",
            "Pacote do tipo Produto não pode ser o padrão.",
            "Para excluir convênio ou pacote, digite **EXCLUIR**.",
        ],
        chaves: ["pacote", "prefeitura", "plano", "contrato"],
    },
];

/* ============================================================================================
   PLANO
   ============================================================================================ */

const PLANO: Topico[] = [
    {
        id: "associados",
        titulo: "Associados",
        rota: "/associados",
        menuIds: ["associados"],
        modulo: "plano",
        resumo: "Consulta de contratos e beneficiários e criação do acesso deles ao app do associado.",
        passos: [
            "Em **Buscar (CPF, nome ou contrato)**, digite. A lista se atualiza sozinha.",
            "Se precisar, escolha **Cidade**, **Plano** e **Situação** → **Aplicar filtros**.",
            "Toque em **Ver detalhes** para ver o **Resumo do Plano** e os beneficiários.",
            "**Criar acesso** / **Atualizar acesso**: **CPF**, **E-mail**, **Telefone (DDD + número)** e **Senha** → **Salvar acesso**.",
        ],
        cores: ["Selo verde **Com acesso**; amarelo **Sem acesso**. Tipos: Titular, Dependente, Agregado e Pet."],
        dicas: [
            "CPF com 11 dígitos, e-mail válido, telefone com DDD e senha com no mínimo 6 caracteres.",
            "Pet não recebe acesso. CPF \"Não retornado\" impede criar o acesso.",
        ],
        chaves: ["contrato", "beneficiário", "titular", "app associado", "cpf"],
    },
    {
        id: "novos-planos",
        titulo: "Novos planos",
        rota: "/novos-planos",
        menuIds: ["novos-planos"],
        modulo: "plano",
        resumo: "Adesões feitas pelo site. Depois do pagamento, crie o contrato no UnyPax e informe o número aqui.",
        passos: [
            "Toque num cartão de situação para filtrar (de novo para tirar).",
            "Pesquise por nome, CPF, código, pedido ou contrato, escolha o plano e toque em **Buscar**.",
            "Abra a adesão. Em \"Pago · criar contrato\", digite o **Número do contrato** → **Salvar contrato**.",
            "**Observação da equipe** → **Salvar observação**.",
            "Para corrigir: **Mudar situação** → nova situação + **Motivo** → **Aplicar**.",
            "O link **WhatsApp** abre conversa com o titular, com mensagem pronta.",
        ],
        cores: ["Azul = Aguardando pagamento. Amarelo = Pago · criar contrato. Verde = Contrato criado. Cinza = Cancelado."],
        dicas: ["Tudo o que acontece com a adesão fica no **Histórico**."],
        chaves: ["adesão", "site", "contrato", "unypax"],
    },
    {
        id: "parceiros",
        titulo: "Parceiros",
        rota: "/parceiros",
        menuIds: ["parceiros"],
        modulo: "plano",
        resumo: "Cadastro dos parceiros de desconto que aparecem para os associados.",
        passos: [
            "Use **Pesquisar por nome…** ou o filtro de categorias.",
            "**Adicionar Novo Parceiro:** **Nome**, **Categoria** e **Foto/Logo** (até 5 MB) são obrigatórios. Opcionais: Benefício, Regras, Como usar, Link de Rota, WhatsApp, Telefone e Instagram.",
            "Toque em **Salvar**. **Editar** altera; **Excluir** apaga (com confirmação).",
        ],
        dicas: ["Na edição a foto é opcional: envie só se for trocar."],
        chaves: ["desconto", "benefício", "rede"],
    },
    {
        id: "medicos",
        titulo: "Médicos",
        rota: "/medicos",
        menuIds: ["medicos"],
        modulo: "plano",
        resumo: "Cadastro de médicos, clínicas e convênios de consulta, com categorias e exames.",
        passos: [
            "Busque por nome, especialidade ou endereço e use os filtros de categoria e de ativos.",
            "**+ Novo Convênio:** **Nome** e **Endereço** obrigatórios; o resto é opcional → **Salvar**.",
            "**Gerenciar** (ao lado de Categorias e Exames) permite adicionar, editar, inativar e excluir itens da lista.",
        ],
        dicas: ["Para esconder sem apagar, desmarque **Ativo**. A Descrição é de uso interno."],
        chaves: ["clínica", "consulta", "exame", "rede de atendimento"],
    },
    {
        id: "sorteios",
        titulo: "Sorteios",
        rota: "/sorteios",
        menuIds: ["sorteios"],
        modulo: "plano",
        resumo: "Sorteios entre os associados aptos, com ganhadores e declaração de entrega.",
        passos: [
            "**Novo Sorteio:** o sistema confere os elegíveis.",
            "Preencha o **Nome do sorteio** e cada prêmio (**Nome** e **Quantidade**; **+ Adicionar próximo prêmio**).",
            "**Realizar Agora** → revise → **Confirmar** → **Confirmar e realizar sorteio**.",
            "Na lista, abra o sorteio para ver os ganhadores e gerar a **Declaração de Entrega** (PDF).",
        ],
        dicas: [
            "O resultado fica disponível para todos os associados.",
            "Depois de confirmar, não feche a janela nem clique de novo antes de ler a mensagem.",
            "O total de prêmios não pode passar do número de elegíveis.",
        ],
        chaves: ["prêmio", "ganhador"],
    },
    {
        id: "noticias",
        titulo: "Notícias",
        rota: "/noticias",
        menuIds: ["noticias"],
        modulo: "plano",
        resumo: "Notícias publicadas no app dos associados.",
        passos: [
            "**Nova Notícia:** **Título** e **Conteúdo** obrigatórios; **Publicado em** e **Imagem** (arquivo ou link) opcionais → **Salvar**.",
            "Busque por título ou conteúdo e por data (**De**/**Até**). **Carregar mais** traz as antigas.",
            "**Editar** altera; **Excluir** apaga (com confirmação).",
        ],
        dicas: ["Título com pelo menos 3 caracteres e conteúdo com pelo menos 5. Sem data, vale a hora em que salvar."],
        chaves: ["notícia", "publicar", "app cliente"],
    },
];

/* ============================================================================================
   ADMINISTRATIVO
   ============================================================================================ */

const ADMINISTRATIVO: Topico[] = [
    {
        id: "historico-sepultamentos",
        titulo: "Histórico de sepultamentos",
        rota: "/relatorio",
        menuIds: ["historico-sepultamentos"],
        modulo: "administrativo",
        resumo: "Consulta de todos os atendimentos registrados (os mais recentes primeiro), com detalhes, avaliações e análise geral.",
        passos: [
            "Digite em **Nome do falecido**.",
            "Para um período, informe **Data inicial** e **Data final** (no celular: **Filtros** → **Aplicar**).",
            "Toque num registro para ver os detalhes (10 por página).",
            "**Análise Geral** abre os indicadores dos atendimentos. O relatório também pode ser exportado em PDF.",
        ],
        dicas: ["Registros sem data não aparecem quando há um período escolhido."],
        chaves: ["histórico", "falecidos", "consulta", "relatório"],
    },
    {
        id: "leads",
        titulo: "Leads do velório",
        rota: "/leads",
        menuIds: ["leads"],
        modulo: "administrativo",
        resumo: "Pessoas que deixaram os dados no Velório Online, com exportação da lista.",
        passos: [
            "Busque por nome e use **Ordenar por Nome**, se quiser.",
            "Marque as pessoas (ou **Selecionar itens desta página**).",
            "**Exportar Selecionados** baixa as marcadas; **Exportar Todos** baixa todas.",
        ],
        dicas: ["O arquivo é uma planilha CSV (abre no Excel ou Google Planilhas). Exportar Todos ignora a busca."],
        chaves: ["contatos", "velório online", "exportar"],
    },
    {
        id: "relatorio-guias",
        titulo: "Relatório de consultas",
        rota: "/relatorio-guias",
        menuIds: ["relatorio-guias"],
        modulo: "administrativo",
        resumo: "Guias de consulta emitidas, com números, gráficos e últimas emissões.",
        passos: [
            "O período abre do dia 1º do mês até hoje.",
            "**Filtro:** datas, Status, CPF do associado, Convênio, Titular e Beneficiário → **Aplicar filtros**.",
            "Veja os cartões (total, ativas, utilizadas, convênios, média por dia) e os gráficos.",
            "**Exportar CSV** baixa a lista do filtro.",
        ],
        cores: ["Ativa (verde), Utilizada (azul), Expirada (amarelo), Cancelada (vermelho), Bloqueada (cinza)."],
        chaves: ["guia", "consulta", "médico"],
    },
];

/* ============================================================================================
   GESTÃO
   ============================================================================================ */

const GESTAO: Topico[] = [
    {
        id: "usuarios",
        titulo: "Usuários",
        rota: "/usuarios",
        menuIds: ["usuarios"],
        modulo: "gestao",
        resumo: "Cadastro das contas que entram no sistema.",
        passos: [
            "**Novo usuário:** **Nome**, **Usuário** e **Senha** → **Adicionar**.",
            "**Editar** muda os dados (senha em branco mantém a atual) → **Salvar**.",
            "Para apagar: **Editar** → **Excluir** → confirmar.",
        ],
        dicas: ["O que cada pessoa pode abrir é definido em Permissões."],
        faq: [{ p: "Criei o usuário e ele não vê nada.", r: "Libere as telas dele em Permissões." }],
        chaves: ["conta", "senha", "login", "cadastro"],
    },
    {
        id: "permissoes",
        titulo: "Permissões",
        rota: "/permissoes",
        menuIds: ["permissoes"],
        modulo: "gestao",
        resumo: "Quais telas cada usuário pode abrir e o que a Aurora pode consultar ou fazer por ele.",
        passos: [
            "Em **Usuário**, escolha a pessoa.",
            "Aba **Páginas**: marque as telas liberadas.",
            "Aba **Conhecimento IA**: marque os departamentos da Base que a Aurora pode usar com essa pessoa.",
            "Aba **Funções Aurora**: marque as consultas e ações permitidas.",
            "Toque em **Salvar permissões**.",
        ],
        cores: ["Cada função da Aurora tem a etiqueta **Consulta** (só lê) ou **Ação** (faz algo no sistema)."],
        dicas: ["Nada muda antes de **Salvar permissões**. Mudar a tela de lugar no menu não muda a permissão."],
        chaves: ["acesso", "liberar tela", "cargo"],
    },
    {
        id: "auditoria",
        titulo: "Auditoria",
        rota: "/auditoria",
        menuIds: ["auditoria"],
        modulo: "gestao",
        resumo: "Linha do tempo de quem fez o quê nos módulos (atendimentos, estoque, requisições, coroas etc.).",
        passos: [
            "Abre com os últimos 30 dias.",
            "Ajuste **Data inicial**, **Data final**, **Categoria**, **Usuário**, **Ação** e **Buscar** → **Filtrar**.",
            "Em cada evento, **Detalhes** mostra data, usuário, ação, origem e entidade.",
        ],
        dicas: ["Evento sem usuário aparece como \"Aurora\" ou \"Sistema\"."],
        chaves: ["log", "rastreio", "quem fez"],
    },
    {
        id: "organizar-menu",
        titulo: "Organizar menu",
        rota: "/organizar-menu",
        menuIds: ["organizar-menu"],
        modulo: "gestao",
        resumo: "A Gestão define o menu de todos: módulos, seções, posição e nome das telas e os itens fixos.",
        passos: [
            "Escolha **Itens fixos** ou um módulo na coluna da esquerda (as setas mudam a ordem).",
            "Em Itens fixos: **Pôr nos fixos**, setas e tirar (máximo 12).",
            "No módulo: **Nome do módulo**, **Descrição** e **Ícone**. Em **Telas do módulo**: renomear, escolher a seção ou **Mover para…** outro módulo.",
            "**Trazer tela sem módulo**, **Novo módulo** e **Excluir módulo** (só vazio).",
            "Toque em **Salvar** e confirme em **Salvar para todos**.",
        ],
        cores: ["**Histórico** → **Restaurar** versões antigas. **Padrão do sistema** volta ao original. **Descartar** desfaz o que não foi salvo."],
        dicas: ["Mudar a tela de lugar não muda quem pode abri-la. Quem personalizou o próprio menu mantém a ordem dele."],
        chaves: ["menu", "módulo", "organizar", "fixos"],
    },
    {
        id: "balanco",
        titulo: "Balanço",
        rota: "/balanco",
        menuIds: ["balanco"],
        modulo: "gestao",
        resumo: "Receita, custo e retorno dos atendimentos e gastos com materiais.",
        passos: [
            "**Filtros:** Hoje, Semana, Mês, Ano ou datas; e, se quiser, **Convênios** → **Aplicar**.",
            "Escolha a área: **Atendimentos Funerários**, **Alimentação**, **Material de Limpeza** ou **Material Descartável**.",
            "Nos atendimentos, toque numa linha para ver custo, receita e retorno por item. Nos materiais, toque no produto para ver o histórico de saídas.",
        ],
        cores: ["Retorno verde = positivo; vermelho = negativo. Selos **Assistência** e **Tanatopraxia** marcam os atendimentos com esses serviços."],
        chaves: ["custo", "receita", "margem", "lucro"],
    },
    {
        id: "desempenho",
        titulo: "Desempenho",
        rota: "/desempenho",
        menuIds: ["desempenho"],
        modulo: "gestao",
        resumo: "Painel da gerência com volume, tempos, qualidade do cadastro e avaliações dos atendimentos.",
        passos: [
            "Escolha o período (padrão: 30 dias) e, se quiser, convênio e agente.",
            "Abas: **Visão geral**, **Desempenho da equipe**, **Perfil dos atendimentos**, **Visitas e pós-atendimento** e **Lista analítica**.",
            "Na Lista analítica, busque, abra a ficha e use **Exportar CSV**.",
        ],
        cores: ["Avaliações: verde ≥ 90%, azul ≥ 75%, amarelo ≥ 60%, vermelho abaixo. Cadastro: verde ≥ 85%, amarelo ≥ 50%."],
        dicas: ["\"No horário\" = até 15 min de atraso. \"Em lote\" = fases marcadas a menos de 60 s da anterior."],
        chaves: ["indicadores", "equipe", "tempo", "kpi"],
    },
    {
        id: "dashboard-estoque",
        titulo: "Dashboard do estoque",
        rota: "/dashboard-estoque",
        menuIds: ["dashboard-estoque"],
        modulo: "gestao",
        resumo: "Conferência e reposição do estoque em abas: Reposições, Divergências, Atendimentos, Contagem e Relatórios.",
        passos: [
            "**Reposições:** requisições automáticas das últimas 24 h e abertas, e os **Itens que ficaram sem reposição**.",
            "**Divergências:** diferenças achadas no recebimento. **Resolver** ou **Ajustar saldo** (→ **Lançar ajuste e liberar**). **Pausar item** pausa a reposição automática.",
            "**Atendimentos:** confira os materiais usados em cada atendimento e registre **Divergência**, se houver.",
            "**Contagem:** resultado da contagem por local desde a última conferência.",
            "**Relatórios:** movimento por produto (início, entradas, transferências, saídas, ajustes, final, contado) e conferências guardadas, com impressão.",
            "O botão **?** explica **Como funciona a reposição**.",
        ],
        dicas: [
            "A reposição automática roda de segunda a sexta às 16:45 e no sábado às 10:45.",
            "Divergência pausa a reposição automática do item até o ajuste; requisição manual continua liberada.",
            "No recebimento a pessoa digita às cegas o estoque atualizado; sem isso não conclui.",
        ],
        chaves: ["reposição", "divergência", "contagem", "automática"],
    },
    {
        id: "painel-estoque",
        titulo: "Painel do estoque",
        rota: "/painel-estoque",
        menuIds: ["painel-estoque"],
        modulo: "gestao",
        resumo: "Painel de gestão do estoque: valor, consumo, quando acaba, compras e custos.",
        passos: [
            "Abas: **Visão geral**, **Estoque**, **Consumo e tendências**, **Planejar compras**, **Custos**, **Controle** e **Como calcula**.",
            "Filtre por classificação, categoria e depósito.",
            "Em **Planejar compras**, ajuste o período a cobrir e a margem de segurança e marque os itens para compra.",
            "**Como calcula** explica cada número do painel.",
        ],
        cores: ["**Crítico** e **Atenção**: cobertura baixa. **Ruptura**, **No mínimo**, **Acima do máx.** no quadro de reposição por depósito."],
        dicas: ["Valores a custo usam o custo médio móvel (o mesmo da tela Estoque)."],
        chaves: ["compras", "consumo", "ruptura", "curva abc"],
    },
    {
        id: "telemetria",
        titulo: "Telemetria",
        rota: "/telemetria",
        menuIds: ["telemetria"],
        modulo: "gestao",
        resumo: "Frota pelo rastreador: veículos ao vivo, rotas dos atendimentos, motoristas, quilometragem e consumo.",
        passos: [
            "**Veículos ao vivo:** mapa que se atualiza a cada 10 s. Clique no carro para ver detalhes.",
            "**Listar Veículos:** busca por placa, motorista ou local.",
            "**Atendimentos funerários:** filtre (Remoção, Para velório, Para sepultamento) e veja a rota no mapa.",
            "**Motorista** e **Histórico Veicular:** escolha o período e consulte.",
            "**Consumo:** veículo, **Km por litro** e **Preço do combustível** → **Calcular consumo**.",
        ],
        cores: ["Verde = em movimento. Amarelo = ligado/parado. Cinza = desligado. Vermelho = acima de 80 km/h."],
        dicas: ["Atendimento sem placa vinculada não mostra rota. O consumo é uma estimativa."],
        chaves: ["frota", "veículo", "gps", "rota", "rastreador"],
    },
];

/* ============================================================================================ */

export const TOPICOS: Topico[] = [
    ...GUIA,
    ...ATENDIMENTO,
    ...COMUNICACAO,
    ...REQUISICOES,
    ...ESTOQUE,
    ...FINANCEIRO,
    ...PLANO,
    ...ADMINISTRATIVO,
    ...GESTAO,
];

/** Perguntas gerais (rodapé da Ajuda). */
export const FAQ_GERAL: Pergunta[] = [
    { p: "Não encontro uma tela no menu.", r: "O menu mostra só as telas liberadas para o seu usuário. Peça à Gestão para liberar em Permissões." },
    { p: "O app está lento ou mostrando dados antigos.", r: "Confira se está Online no cabeçalho, atualize a página e, se continuar, saia e entre de novo." },
    { p: "Apareceu \"Sessão expirada\".", r: "Entre de novo com o seu usuário e senha. Nada que já foi salvo se perde." },
    { p: "Fiz algo sem internet. Vai ser enviado?", r: "As etapas permitidas sem internet ficam salvas no aparelho e são enviadas quando a conexão volta." },
];
