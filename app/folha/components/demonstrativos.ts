/**
 * Demonstrativos em PDF (folha e comissões) gerados no próprio aparelho com o jsPDF + jspdf-autotable — 10/11/2026.
 *
 * Uma página A4 por colaborador: logo, cabeçalho (o que é e de quando), dados do colaborador e do pagamento,
 * seções com o detalhamento (descrição · valor), total a pagar e a linha de assinatura de recebimento.
 * Folha ainda não conferida (ou comissão não liberada) sai com a faixa "PRÉVIA".
 * LGPD: sem CPF; chave Pix que é CPF sai mascarada (***.456.789-**).
 * Usado por /folha e /folha-comissoes. No celular abre o compartilhar (WhatsApp etc.); no computador baixa o arquivo.
 * 10/11/2026: envio pelo chat interno (Messenger): cada pessoa recebe o próprio PDF na conversa individual com quem enviou
 * (abrir_individual → upload_url/PUT no R2 → enviar tipo documento), pelas funções de components/messenger/api.
 */
import type { jsPDF as JsPDF } from 'jspdf';
import { enviarArquivo, msgPost, novoUuid } from '@/components/messenger/api';

export type DemoLinha = {
    descricao: string;
    detalhe?: string | null;
    valor?: number | null;
    /** texto no lugar do valor (ex.: "9,00%", "nota 94,0") */
    texto?: string | null;
    destaque?: boolean;
};
export type Demonstrativo = {
    titulo: string;
    referencia: string;
    previa?: string | null;
    colaborador: { nome: string; funcao?: string | null; equipe?: string | null; pagamento?: string | null };
    dataPagamento?: string | null;
    secoes: { titulo: string; linhas: DemoLinha[] }[];
    total: number;
    rotuloTotal?: string;
    saldoNegativo?: number;
    observacao?: string | null;
};

const PAG_W = 210;
const PAG_H = 297;
const MARG = 15;
const LARG = PAG_W - 2 * MARG;
const AZUL: [number, number, number] = [49, 60, 85];
const CINZA: [number, number, number] = [91, 100, 120];
const LINHA: [number, number, number] = [227, 232, 240];
const FUNDO: [number, number, number] = [246, 248, 251];
const AMARELO: [number, number, number] = [242, 203, 63];
const VERMELHO: [number, number, number] = [180, 35, 24];
const EMPRESA = 'Plano Assistencial Integrado · Av. Dr. Clériston Andrade, 135, Centro, Barreiras-BA · CNPJ 03.726.651/0001-51 · (77) 3611-3248';

/** Só caracteres que a Helvetica do PDF tem (WinAnsi). */
const FORA_DA_FONTE = /[^\x09\x0a\x0d\x20-\x7e -ÿ–—‘’“”•…€]/gu;
function limpar(s: string | null | undefined): string {
    return String(s ?? '')
        .replace(/[    ]/g, ' ')
        .replace(/−/g, '-')
        .replace(/[‐‑]/g, '-')
        .replace(FORA_DA_FONTE, (c) => {
            const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
            return base && !new RegExp(FORA_DA_FONTE.source, 'u').test(base) ? base : '';
        })
        .replace(/\s+/g, ' ')
        .trim();
}

export const brlPdf = (v: number) => limpar(Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const valorTxt = (v: number) => (v < 0 ? `- ${brlPdf(-v)}` : brlPdf(v));
const dataBR = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/** Chave Pix que é CPF sai mascarada; as outras (telefone, e-mail, aleatória) ficam como estão. */
export function mascararPix(pix?: string | null): string | null {
    if (!pix) return null;
    const s = String(pix).trim();
    const ehCpf = /^cpf\b/i.test(s) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(s.replace(/^\S+\s+/, ''));
    if (!ehCpf) return s;
    return s.replace(/(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})/, (_m, _a, b, c) => `***.${b}.${c}-**`);
}

let logoCache: Promise<string | null> | null = null;
function logo(): Promise<string | null> {
    if (!logoCache) {
        logoCache = fetch('/logo.png')
            .then((r) => (r.ok ? r.blob() : null))
            .then(
                (b) =>
                    b &&
                    new Promise<string | null>((ok) => {
                        const fr = new FileReader();
                        fr.onload = () => ok(String(fr.result));
                        fr.onerror = () => ok(null);
                        fr.readAsDataURL(b);
                    }),
            )
            .catch(() => null);
    }
    return logoCache;
}

function pagina(doc: JsPDF, d: Demonstrativo, autoTable: (doc: JsPDF, o: any) => void, img: string | null) {
    let y = 14;
    // faixa de cima
    doc.setFillColor(...AZUL);
    doc.rect(0, 0, PAG_W, 4, 'F');
    doc.setFillColor(...AMARELO);
    doc.rect(0, 4, PAG_W, 1.2, 'F');
    if (img) doc.addImage(img, 'PNG', MARG, y - 2, 46, 12.8, 'logo-pai', 'FAST');
    doc.setTextColor(...AZUL);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(limpar(d.titulo).toUpperCase(), PAG_W - MARG, y + 3, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...CINZA);
    doc.text(limpar(d.referencia), PAG_W - MARG, y + 8.5, { align: 'right' });
    y += 17;

    if (d.previa) {
        doc.setFillColor(253, 236, 234);
        doc.roundedRect(MARG, y, LARG, 8, 1.5, 1.5, 'F');
        doc.setTextColor(...VERMELHO);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(limpar(d.previa), PAG_W / 2, y + 5.3, { align: 'center' });
        y += 11;
    }

    // colaborador
    doc.setFillColor(...FUNDO);
    doc.setDrawColor(...LINHA);
    doc.roundedRect(MARG, y, LARG, 21, 2, 2, 'FD');
    doc.setTextColor(...CINZA);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('COLABORADOR', MARG + 4, y + 5.5);
    doc.text('PAGAMENTO', MARG + LARG * 0.6, y + 5.5);
    doc.setTextColor(...AZUL);
    doc.setFontSize(11.5);
    doc.text(doc.splitTextToSize(limpar(d.colaborador.nome), LARG * 0.55 - 6)[0] || '', MARG + 4, y + 11.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...CINZA);
    const fe = [d.colaborador.funcao, d.colaborador.equipe].filter(Boolean).map((x) => limpar(x)).join(' · ');
    if (fe) doc.text(doc.splitTextToSize(fe, LARG * 0.55 - 6)[0] || '', MARG + 4, y + 16.5);
    doc.setTextColor(...AZUL);
    doc.setFontSize(9.5);
    const pg = doc.splitTextToSize(limpar(d.colaborador.pagamento || 'Forma de pagamento não cadastrada'), LARG * 0.4 - 6);
    doc.text(pg.slice(0, 2), MARG + LARG * 0.6, y + 11.5);
    if (d.dataPagamento) {
        doc.setTextColor(...CINZA);
        doc.setFontSize(9);
        doc.text(`Data do pagamento: ${dataBR(d.dataPagamento)}`, MARG + LARG * 0.6, y + 17.5);
    }
    y += 26;

    // seções
    for (const s of d.secoes) {
        if (!s.linhas.length) continue;
        autoTable(doc, {
            startY: y,
            margin: { left: MARG, right: MARG },
            theme: 'plain',
            head: [[limpar(s.titulo).toUpperCase(), '']],
            body: s.linhas.map((l) => [
                { content: limpar(l.descricao) + (l.detalhe ? `\n${limpar(l.detalhe)}` : ''), styles: { fontStyle: l.destaque ? 'bold' : 'normal' } },
                { content: l.texto != null ? limpar(l.texto) : l.valor != null ? valorTxt(l.valor) : '', styles: { halign: 'right', fontStyle: l.destaque ? 'bold' : 'normal', textColor: (l.valor ?? 0) < 0 ? VERMELHO : AZUL } },
            ]),
            styles: { font: 'helvetica', fontSize: 9.5, textColor: AZUL, cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 }, lineColor: LINHA, lineWidth: { bottom: 0.2 } },
            headStyles: { fontStyle: 'bold', fontSize: 7.5, textColor: CINZA, fillColor: FUNDO, lineWidth: 0 },
            columnStyles: { 0: { cellWidth: LARG - 42 }, 1: { cellWidth: 42 } },
            didParseCell: (h: any) => {
                // segunda linha (detalhe) em cinza e menor: o autotable não muda estilo no meio da célula, então só deixa a célula mais compacta
                if (h.section === 'body' && h.column.index === 0 && String(h.cell.raw?.content || '').includes('\n')) h.cell.styles.fontSize = 9;
            },
        });
        y = (doc as any).lastAutoTable.finalY + 5;
    }

    // total
    if (y > PAG_H - 70) {
        doc.addPage();
        y = 20;
    }
    doc.setFillColor(...AZUL);
    doc.roundedRect(MARG, y, LARG, 13, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(limpar(d.rotuloTotal || 'Total a pagar'), MARG + 5, y + 8.4);
    doc.setFontSize(14);
    doc.text(brlPdf(d.total), PAG_W - MARG - 5, y + 8.8, { align: 'right' });
    y += 17;
    if (d.saldoNegativo) {
        doc.setTextColor(...VERMELHO);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Os descontos passaram do valor a receber: ${brlPdf(d.saldoNegativo)} ficam como vale para o próximo pagamento.`, MARG, y + 1);
        y += 6;
    }
    if (d.observacao) {
        doc.setTextColor(...CINZA);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        const t = doc.splitTextToSize(limpar(d.observacao), LARG);
        doc.text(t, MARG, y + 1);
        y += t.length * 4 + 3;
    }

    // recibo
    const yr = Math.max(y + 12, PAG_H - 58);
    doc.setTextColor(...AZUL);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const rec = doc.splitTextToSize(
        `Recebi do Plano Assistencial Integrado a importância de ${brlPdf(d.total)}, referente a ${limpar(d.referencia).toLowerCase()}, conforme o detalhamento acima.`,
        LARG,
    );
    doc.text(rec, MARG, yr);
    const ya = yr + rec.length * 4.5 + 16;
    doc.setDrawColor(...CINZA);
    doc.setLineWidth(0.3);
    doc.line(MARG, ya, MARG + 105, ya);
    doc.line(MARG + 125, ya, PAG_W - MARG, ya);
    doc.setFontSize(8.5);
    doc.setTextColor(...CINZA);
    doc.text(limpar(d.colaborador.nome), MARG, ya + 4.5);
    doc.text('Data', MARG + 125, ya + 4.5);

    // rodapé
    doc.setFontSize(7.5);
    doc.text(limpar(EMPRESA), PAG_W / 2, PAG_H - 9, { align: 'center' });
}

/** Monta o PDF (uma página por colaborador). */
export async function montarPdf(lista: Demonstrativo[]): Promise<Blob> {
    if (!lista.length) throw new Error('Nada para gerar.');
    const [{ jsPDF }, { default: autoTable }, img] = await Promise.all([import('jspdf'), import('jspdf-autotable'), logo()]);
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    lista.forEach((d, i) => {
        if (i > 0) doc.addPage();
        pagina(doc, d, autoTable as any, img);
    });
    return doc.output('blob');
}

export const nomeArquivoPdf = (s: string) =>
    `${s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w.-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')}.pdf`;

export type EnvioChat = { usuarioId: number | null; nome: string; demo: Demonstrativo; arquivo: string; texto: string };
export type ResultadoEnvio = { enviados: string[]; falhas: { nome: string; motivo: string }[] };

/**
 * Manda o demonstrativo de cada pessoa pelo chat interno, na conversa individual com quem está enviando.
 * Um por vez (o R2 e o Messenger recebem em sequência); quem não tem login do app ou não tem o Messenger fica na lista de falhas.
 */
export async function enviarPeloChat(envios: EnvioChat[], aoAvancar?: (feitos: number, total: number) => void): Promise<ResultadoEnvio> {
    const r: ResultadoEnvio = { enviados: [], falhas: [] };
    let feitos = 0;
    for (const e of envios) {
        try {
            if (!e.usuarioId) throw new Error('sem login do app ligado ao cadastro');
            const blob = await montarPdf([e.demo]);
            const conversa = (await msgPost('abrir_individual', { usuario_id: e.usuarioId })).dados;
            const chave = await enviarArquivo(blob, 'application/pdf');
            await msgPost('enviar', {
                conversa_id: conversa.id,
                tipo: 'documento',
                texto: e.texto,
                anexo: { chave, nome_original: e.arquivo },
                cliente_uuid: novoUuid(),
            });
            r.enviados.push(e.nome);
        } catch (err: any) {
            let m = String(err?.message || 'falha no envio');
            if (/Colega inválido/i.test(m)) m = 'sem acesso ao Messenger (ou é você mesmo)';
            r.falhas.push({ nome: e.nome, motivo: m });
        }
        feitos++;
        aoAvancar?.(feitos, envios.length);
    }
    return r;
}

/** Gera o PDF (uma página por colaborador) e baixa ou compartilha. */
export async function gerarDemonstrativos(lista: Demonstrativo[], nomeArquivo: string): Promise<void> {
    const nome = `${nomeArquivo.replace(/[^\w.-]+/g, '-')}.pdf`;
    const blob = await montarPdf(lista);
    const arquivo = new File([blob], nome, { type: 'application/pdf' });
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.canShare && window.innerWidth < 1024 && nav.canShare({ files: [arquivo] })) {
        try {
            await nav.share({ files: [arquivo], title: nome });
            return;
        } catch (e: any) {
            if (e?.name === 'AbortError') return;
        }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
