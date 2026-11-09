/* =====================================================================
   termoVelorioOnline.ts — Termo de Responsabilidade do Velório On-line (09/11/2026)

   Antes era um papel preenchido à caneta. Agora é assinado no app (Compartilhar → Velório Online →
   Assinar Termo) e vira PDF para ver, baixar e compartilhar. O mesmo desenho entra no PDF do
   Relatório do Histórico de Sepultamentos.

   No banco (tabela sepultamentos, SQL termo_velorio_online_2026-11-09.sql):
     assinatura_velorio_online (imagem) · _nome · _cpf · _em (data/hora) · _por (quem coletou) · _versao

   Texto: o do termo em papel, sem a ADIAU (o serviço é da própria PAI), sem testemunhas e com os
   erros de digitação corrigidos ("força maior", "pelas prestadoras"). Se o texto mudar um dia,
   crie uma versão nova em TEXTOS_TERMO e mude VERSAO_TERMO_VELORIO: o termo já assinado continua
   sendo mostrado na versão em que foi assinado.
   Sem React, para poder ser usado no app e no relatório.
   ===================================================================== */

export const VERSAO_TERMO_VELORIO = "v1-2026-11-09";

const CONTRATADA = "PAI - Plano Assistencial Integrado Ltda";
const CNPJ_CONTRATADA = "03.726.651/0001-51";

export type DadosTermoVelorio = {
    atendimentoId: string;
    falecido: string;
    /** Data da cerimônia (data de início do velório), dd/mm/aaaa. */
    dataCerimonia: string;
    nome: string;
    cpf: string;
    /** Data e hora da assinatura, "dd/mm/aaaa às hh:mm". */
    assinadoEm: string;
    /** Quem coletou a assinatura no app. */
    coletadoPor: string;
    versao: string;
};

export type SituacaoTermoVelorio = {
    assinado: boolean;
    url: string;
    nome: string;
    cpf: string;
    em: string;
    por: string;
    versao: string;
};

/* ---------------------------- utilitários ---------------------------- */

function txt(v: unknown): string {
    if (v == null || typeof v === "object") return "";
    const s = String(v).trim();
    return s === "null" || s === "undefined" || s === "(vazio)" ? "" : s;
}

export function formatarCpf(v: unknown): string {
    const d = txt(v).replace(/\D+/g, "");
    if (d.length !== 11) return txt(v);
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** "2026-11-09", "2026-11-09 14:32:00" ou "09/11/2026" → "09/11/2026". */
export function formatarData(v: unknown): string {
    const s = txt(v);
    if (!s || s.startsWith("0000-00-00")) return "";
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return br ? `${br[1]}/${br[2]}/${br[3]}` : s;
}

/** "2026-11-09 14:32:05" → "09/11/2026 às 14:32". */
export function formatarDataHora(v: unknown): string {
    const s = txt(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]} às ${m[4]}:${m[5]}`;
    return formatarData(s);
}

/** Situação do termo no registro do atendimento (vindo do servidor). */
export function situacaoTermoVelorio(registro: any): SituacaoTermoVelorio {
    const r = registro || {};
    const url = txt(r.assinatura_velorio_online);
    return {
        assinado: url !== "",
        url,
        nome: txt(r.assinatura_velorio_online_nome),
        cpf: txt(r.assinatura_velorio_online_cpf),
        em: txt(r.assinatura_velorio_online_em),
        por: txt(r.assinatura_velorio_online_por),
        versao: txt(r.assinatura_velorio_online_versao) || VERSAO_TERMO_VELORIO,
    };
}

/** Monta os dados do termo a partir do registro e da assinatura. */
export function dadosTermoVelorio(registro: any, s: { nome: string; cpf: string; em?: string; por?: string; versao?: string }): DadosTermoVelorio {
    const r = registro || {};
    return {
        atendimentoId: txt(r.id ?? r.sepultamento_id),
        falecido: txt(r.falecido ?? r.nome_falecido),
        dataCerimonia: formatarData(r.data_inicio_velorio ?? r.data_velorio),
        nome: txt(s.nome),
        cpf: formatarCpf(s.cpf),
        assinadoEm: formatarDataHora(s.em) || "",
        coletadoPor: txt(s.por),
        versao: txt(s.versao) || VERSAO_TERMO_VELORIO,
    };
}

/* ---------------------------- texto do termo ---------------------------- */

type Bloco = { tipo: "paragrafo" | "item"; texto: string };

function textoV1(d: DadosTermoVelorio): Bloco[] {
    const vazio = "_______________";
    return [
        {
            tipo: "paragrafo",
            texto:
                `Ao optar pela realização da cerimônia de velório virtual, eu, ${d.nome || vazio}, inscrito(a) no CPF ` +
                `sob o número ${d.cpf || vazio}, doravante denominado CONTRATANTE, declaro que:`,
        },
        {
            tipo: "item",
            texto:
                `Assumo total responsabilidade pela autorização da transmissão do velório e cerimônia de despedida de ` +
                `${d.falecido || vazio} e gravação de imagens do ambiente velatório com a participação de todas as pessoas ` +
                `presentes, realizada no dia ${d.dataCerimonia || "____/____/________"}, isentando a ${CONTRATADA} de qualquer responsabilização;`,
        },
        {
            tipo: "item",
            texto: "Possuo total responsabilidade pelo compartilhamento da senha de acesso à cerimônia virtual entre familiares e amigos;",
        },
        {
            tipo: "item",
            texto:
                "Estou ciente de que a senha gerada para acesso às imagens ao vivo não pode ser disponibilizada publicamente em " +
                "mídias sociais, websites ou quaisquer outros meios de divulgação em massa, sob pena de poder ser suspensa " +
                "imediatamente a transmissão cuja senha tenha sido divulgada por tais meios.",
        },
        {
            tipo: "paragrafo",
            texto:
                "As partes declaram, por este instrumento, que cumprem toda a legislação aplicável sobre privacidade e proteção de " +
                "dados, inclusive (sempre e quando aplicáveis) a Constituição Federal, o Código de Defesa do Consumidor, o Código " +
                "Civil, o Marco Civil da Internet (Lei Federal n. 12.965/2014), seu decreto regulamentador (Decreto 8.771/2016), a " +
                "Lei Geral de Proteção de Dados (Lei Federal n. 13.709/2018) e demais normas setoriais ou gerais sobre o tema.",
        },
        {
            tipo: "paragrafo",
            texto:
                "O CONTRATANTE consente, de forma inequívoca, de acordo com o art. 7º, I, da LGPD, quanto à transmissão da " +
                `cerimônia e à captura dos dados biométricos dos presentes no website da ${CONTRATADA}.`,
        },
        {
            tipo: "paragrafo",
            texto:
                "A CONTRATADA compromete-se a manter ativo o serviço por tempo integral, ressalvando-se de falhas eventuais que " +
                "afetem de qualquer maneira a transmissão ao vivo da cerimônia, incluindo-se mas não limitando-se a: casos " +
                "fortuitos ou de força maior; ações de terceiros que, comprovadamente, impeçam a prestação dos serviços; falhas ou " +
                "manutenções, agendadas ou não, ocorridas no(s) ambiente(s) virtual(is) contratado(s) para prestação do serviço; " +
                "falta de fornecimento de energia elétrica; interrupção ou suspensão dos serviços prestados pelas prestadoras de " +
                "serviços de telecomunicações; ocorrências de falhas no sistema de transmissão e/ou roteamento no acesso à " +
                "internet; queima ou avarias dos equipamentos necessários para a transmissão.",
        },
        {
            tipo: "paragrafo",
            texto:
                "As partes deverão manter sigilo em relação aos dados pessoais tratados em virtude deste contrato, garantindo que " +
                "todas as pessoas autorizadas a tratarem tais dados estejam sujeitas ao dever de confidencialidade, bem como " +
                "instruídas e capacitadas para o tratamento de dados pessoais.",
        },
    ];
}

const TEXTOS_TERMO: Record<string, (d: DadosTermoVelorio) => Bloco[]> = {
    "v1-2026-11-09": textoV1,
};

function blocosDoTermo(d: DadosTermoVelorio): Bloco[] {
    return (TEXTOS_TERMO[d.versao] || textoV1)(d);
}

/** Texto do termo para ler na tela antes de assinar (um item por parágrafo; itens começam com "• "). */
export function textoTermoVelorio(d: DadosTermoVelorio): string[] {
    return blocosDoTermo(d).map((b) => (b.tipo === "item" ? `• ${b.texto}` : b.texto));
}

/* ---------------------------- desenho (jsPDF) ---------------------------- */

const COR = { azul: "#313C55", cinza: "#6B7487", linha: "#DCE2EB" };
const PAG_W = 210;
const PAG_H = 297;
const MARG = 18;
const LARG = PAG_W - MARG * 2;
const PT = 0.3528;

type Doc = any;

function fonte(doc: Doc, tam: number, negrito = false, cor = COR.azul) {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tam);
    doc.setTextColor(cor);
}

/**
 * Desenha o termo numa página (o chamador cuida do cabeçalho/rodapé).
 * Começa em `yInicio` e devolve o y final. Usado pelo PDF do termo e pelo PDF do relatório.
 */
export function desenharCorpoTermoVelorio(doc: Doc, d: DadosTermoVelorio, assinaturaB64: string | undefined, yInicio: number, margem = MARG): number {
    const largura = PAG_W - margem * 2;
    let y = yInicio;
    const tam = 9.4;
    const alt = tam * PT * 1.45;

    fonte(doc, 13, true);
    doc.text("TERMO DE RESPONSABILIDADE", PAG_W / 2, y, { align: "center", charSpace: 0.3 });
    y += 5.5;
    fonte(doc, 9, true, COR.cinza);
    doc.text("VELÓRIO ON-LINE", PAG_W / 2, y, { align: "center", charSpace: 0.6 });
    y += 9;

    for (const b of blocosDoTermo(d)) {
        const recuo = b.tipo === "item" ? 6 : 0;
        fonte(doc, tam, false);
        const linhas = doc.splitTextToSize(b.texto, largura - recuo) as string[];
        if (b.tipo === "item") {
            doc.setFillColor(COR.azul);
            doc.circle(margem + 2, y - 1.1, 0.7, "F");
        }
        doc.text(linhas, margem + recuo, y, { lineHeightFactor: 1.45 });
        y += linhas.length * alt + (b.tipo === "item" ? 2.2 : 3.6);
    }

    y += 2;
    fonte(doc, tam, false);
    const dataLocal = (d.assinadoEm || "").split(" às ")[0] || "____/____/________";
    doc.text(`Barreiras – BA, ${dataLocal}.`, margem, y);
    y += 6;

    // CONTRATANTE (assinatura)
    const yLinha = y + 24;
    const w = largura * 0.62;
    const x = margem + (largura - w) / 2;
    if (assinaturaB64) {
        try {
            doc.addImage(assinaturaB64, "PNG", PAG_W / 2 - 32, yLinha - 23, 64, 22, undefined, "FAST");
        } catch {
            /* assinatura ilegível: fica só a linha */
        }
    }
    doc.setDrawColor(COR.azul);
    doc.setLineWidth(0.35);
    doc.line(x, yLinha, x + w, yLinha);
    fonte(doc, 9.2, true);
    doc.text(d.nome || " ", PAG_W / 2, yLinha + 4.6, { align: "center" });
    fonte(doc, 7.8, false, COR.cinza);
    doc.text(`CONTRATANTE${d.cpf ? ` · CPF ${d.cpf}` : ""}`, PAG_W / 2, yLinha + 8.4, { align: "center" });
    y = yLinha + 14;

    // CONTRATADA (impressa)
    fonte(doc, 9.2, true);
    doc.text(CONTRATADA, PAG_W / 2, y + 2, { align: "center" });
    fonte(doc, 7.8, false, COR.cinza);
    doc.text(`CONTRATADA · CNPJ ${CNPJ_CONTRATADA}`, PAG_W / 2, y + 5.8, { align: "center" });
    y += 12;

    // Registro da assinatura digital
    // Sem assinatura (ex.: PDF do relatório de um atendimento com Velório On-line ainda sem o termo assinado).
    const registro = d.assinadoEm
        ? `Assinado digitalmente em ${d.assinadoEm}` +
          `${d.atendimentoId ? `, no atendimento nº ${d.atendimentoId}` : ""}` +
          `${d.coletadoPor ? `, coletado por ${d.coletadoPor}` : ""}. Versão do termo: ${d.versao}.`
        : `Termo ainda não assinado no app${d.atendimentoId ? ` (atendimento nº ${d.atendimentoId})` : ""}. Versão do termo: ${d.versao}.`;
    doc.setDrawColor(COR.linha);
    doc.setFillColor("#F6F8FB");
    fonte(doc, 7.4, false, COR.cinza);
    const linhasReg = doc.splitTextToSize(registro, largura - 8) as string[];
    const hReg = linhasReg.length * 7.4 * PT * 1.4 + 4;
    doc.roundedRect(margem, y, largura, hReg, 1.5, 1.5, "FD");
    doc.text(linhasReg, margem + 4, y + 4.2, { lineHeightFactor: 1.4 });
    return y + hReg;
}

/** Logo do cabeçalho: o SVG do /public vira PNG (o jsPDF não desenha SVG). */
export async function carregarLogoPai(caminho = "/logo-pai-horizontal.svg"): Promise<string | undefined> {
    try {
        const res = await fetch(caminho, { cache: "force-cache" });
        if (!res.ok) return undefined;
        let svg = await res.text();
        const vb = svg.match(/viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/);
        const vbW = vb ? Number(vb[1]) : 796;
        const vbH = vb ? Number(vb[2]) : 214;
        if (!/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace("<svg", `<svg width="${vbW}" height="${vbH}"`);
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = url;
            });
            const w = 1072;
            const h = Math.round((w * vbH) / vbW);
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
            return canvas.toDataURL("image/png");
        } finally {
            URL.revokeObjectURL(url);
        }
    } catch {
        return undefined;
    }
}

function desenharMolduraTermo(doc: Doc, d: DadosTermoVelorio, logoPng?: string) {
    if (logoPng) {
        try {
            doc.addImage(logoPng, "PNG", MARG, 8, 33.5, 9, undefined, "FAST");
        } catch {
            /* sem logo */
        }
    } else {
        fonte(doc, 12, true);
        doc.text("PAI", MARG, 14);
    }
    fonte(doc, 6.8, false, COR.cinza);
    doc.text(`${d.atendimentoId ? `Atendimento nº ${d.atendimentoId} · ` : ""}${d.falecido}`, PAG_W - MARG, 13.5, { align: "right" });

    const yr = PAG_H - 14;
    doc.setDrawColor(COR.linha);
    doc.setLineWidth(0.2);
    doc.line(MARG, yr - 3, PAG_W - MARG, yr - 3);
    fonte(doc, 6.4, true);
    doc.text("77 3611.3248", MARG, yr);
    doc.text("Plantão 24h · 77 3611.2440", PAG_W - MARG, yr, { align: "right" });
    fonte(doc, 6.4, false);
    doc.text("Av. Dr. Clériston Andrade, 135 – Centro, Barreiras – BA", MARG, yr + 3);
    doc.text(`CNPJ ${CNPJ_CONTRATADA}`, MARG, yr + 6);
    doc.text("Serviços Funerários", PAG_W - MARG, yr + 3, { align: "right" });
}

/** PDF do termo (uma página A4). */
export async function gerarPdfTermoVelorio(d: DadosTermoVelorio, assinaturaB64?: string): Promise<Blob> {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const logo = await carregarLogoPai();
    desenharMolduraTermo(doc, d, logo);
    desenharCorpoTermoVelorio(doc, d, assinaturaB64, 30);
    return doc.output("blob") as Blob;
}

export function nomeArquivoTermoVelorio(d: DadosTermoVelorio): string {
    const base = (d.falecido || "atendimento")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase();
    return `TERMO_VELORIO_ONLINE_${base || "ATENDIMENTO"}.pdf`;
}

/* ---------------------------- imagem da assinatura ---------------------------- */

const PROXY_ASSINATURA = "https://api.planoassistencialintegrado.com.br/proxy_assinatura.php";

/** Baixa a assinatura gravada (pelo proxy, com login) e devolve PNG com fundo branco. */
export async function carregarAssinaturaTermo(url: string): Promise<string | undefined> {
    const m = String(url || "").match(/\/uploads\/assinaturas\/[^\s"'?]+/i);
    if (!m) return undefined;
    try {
        const res = await fetch(`${PROXY_ASSINATURA}?file=${encodeURIComponent(m[0])}`, { credentials: "include", cache: "no-store" });
        if (!res.ok) return undefined;
        const blob = await res.blob();
        const obj = URL.createObjectURL(blob);
        try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = obj;
            });
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            return canvas.toDataURL("image/png");
        } finally {
            URL.revokeObjectURL(obj);
        }
    } catch {
        return undefined;
    }
}
