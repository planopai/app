"use client";

import { escapeCsvCell } from "../formato";

// PDF e CSV da conferência (repaginada): lista para contar e conferência concluída.

const LOGO_URL = "https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1";

async function logo(): Promise<string | null> {
    try {
        const r = await fetch(LOGO_URL, { mode: "cors", cache: "no-store" });
        const b = await r.blob();
        return await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = () => reject(new Error("logo"));
            fr.onload = () => resolve(String(fr.result || ""));
            fr.readAsDataURL(b);
        });
    } catch {
        return null;
    }
}

export async function pdfConferencia(o: { titulo: string; linhas: string[]; cabecalho: string[]; corpo: string[][]; direita: number[]; arquivo: string }) {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const marginX = 12;
    let y = 12;
    const img = await logo();
    if (img) doc.addImage(img, "PNG", marginX, y, 48, 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(49, 60, 85);
    doc.text(o.titulo, marginX + (img ? 54 : 0), y + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    o.linhas.forEach((l, i) => doc.text(l, marginX + (img ? 54 : 0), y + 13 + i * 5));
    y += Math.max(20, 15 + o.linhas.length * 5);

    const colunas: Record<number, { halign: "right" }> = {};
    o.direita.forEach((c) => (colunas[c] = { halign: "right" }));

    autoTable(doc, {
        startY: y,
        head: [o.cabecalho],
        body: o.corpo,
        margin: { left: marginX, right: marginX },
        styles: { font: "helvetica", fontSize: 9.3, cellPadding: 2.4, valign: "middle", lineColor: [227, 232, 240], lineWidth: 0.2 },
        headStyles: { fillColor: [233, 239, 246], textColor: [49, 60, 85], fontStyle: "bold" },
        columnStyles: colunas,
    });
    doc.save(`${o.arquivo}.pdf`);
}

export function csvConferencia(cabecalho: string[], corpo: string[][], arquivo: string) {
    const linhas = [cabecalho, ...corpo].map((l) => l.map((c) => escapeCsvCell(c, ";")).join(";"));
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${arquivo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
