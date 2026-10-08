#!/usr/bin/env node
/**
 * Quadro de Atendimentos (08/10/2026): botão da OS do atendimento (documento com cifrão) no rodapé da janela
 * "Informações do atendimento", logo depois do Editar. Leva para /os/minhas?atendimento=<id> (a OS do atendimento).
 *
 * Mexe só em app/quadro-acompanhamento/page.tsx, na SUA versão, e em dois pontos:
 *   1) acrescenta BotaoOS no import de "@/components/atendimentos/BotoesAtendimento";
 *   2) acrescenta <BotaoOS href=... /> logo depois de <BotaoEditar href={rotaEditar(backendId)} />.
 * Se não encontrar um dos dois pontos, não grava nada e avisa. Rodar de novo não duplica.
 *
 * Uso (na raiz do projeto):  node ferramentas/quadro-botao-os.mjs
 */
import fs from "node:fs";

const arq = "app/quadro-acompanhamento/page.tsx";
if (!fs.existsSync(arq)) {
    console.error(`Não achei ${arq}. Rode na raiz do projeto.`);
    process.exit(1);
}
let s = fs.readFileSync(arq, "utf8");
if (s.includes("<BotaoOS")) {
    console.log("O botão da OS já está no Quadro. Nada a fazer.");
    process.exit(0);
}
const imp = /import\s*\{([^}]*)\}\s*from\s*["']@\/components\/atendimentos\/BotoesAtendimento["'];?/;
const m = s.match(imp);
if (!m) {
    console.error("Não achei o import de @/components/atendimentos/BotoesAtendimento. Nada foi alterado.");
    process.exit(1);
}
const editar = /(\n([ \t]*)<BotaoEditar href=\{rotaEditar\(backendId\)\}\s*\/>)/;
const e = s.match(editar);
if (!e) {
    console.error("Não achei <BotaoEditar href={rotaEditar(backendId)} /> no rodapé da janela. Nada foi alterado. Mande o arquivo para ajuste.");
    process.exit(1);
}
const nomes = m[1].split(",").map((x) => x.trim()).filter(Boolean);
if (!nomes.includes("BotaoOS")) nomes.push("BotaoOS");
s = s.replace(imp, `import { ${nomes.join(", ")} } from "@/components/atendimentos/BotoesAtendimento";`);
s = s.replace(editar, `$1\n$2<BotaoOS href={\`/os/minhas?atendimento=\${backendId}\`} />`);
fs.writeFileSync(arq, s);
console.log("Pronto: botão da OS acrescentado no rodapé da janela do Quadro (depois do Editar).");
