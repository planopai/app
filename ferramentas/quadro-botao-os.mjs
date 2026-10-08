import fs from "node:fs";

const arq = "app/quadro-acompanhamento/page.tsx";

if (!fs.existsSync(arq)) {
    console.error(`Não achei ${arq}. Rode na raiz do projeto.`);
    process.exit(1);
}

const original = fs.readFileSync(arq, "utf8");
let s = original;

if (s.includes("<BotaoOS")) {
    console.log("O botão da OS já está no Quadro. Nada a fazer.");
    process.exit(0);
}

// Localiza o import dos botões
const imp =
    /import\s*\{([^}]*)\}\s*from\s*["']@\/components\/atendimentos\/BotoesAtendimento["'];?/;

const m = s.match(imp);

if (!m) {
    console.error("Não achei o import dos botões. Nada foi alterado.");
    process.exit(1);
}

// Aceita BotaoEditar com ou sem a propriedade grande
const editar =
    /(\n([ \t]*)<BotaoEditar\s+(?:grande\s+)?href=\{rotaEditar\(backendId\)\}\s*\/>)/;

const e = s.match(editar);

if (!e) {
    console.error("Não achei o botão Editar no rodapé. Nada foi alterado.");
    process.exit(1);
}

// Adiciona BotaoOS ao import
const nomes = m[1]
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

if (!nomes.includes("BotaoOS")) {
    nomes.push("BotaoOS");
}

s = s.replace(
    imp,
    `import { ${nomes.join(", ")} } from "@/components/atendimentos/BotoesAtendimento";`
);

// Insere o botão da OS depois do Editar
s = s.replace(
    editar,
    `$1\n$2<BotaoOS href={\`/os/minhas?atendimento=\${backendId}\`} />`
);

// Grava somente depois de validar tudo
fs.writeFileSync(arq, s, "utf8");

console.log("Pronto! Botão da OS adicionado depois do Editar.");
console.log("Arquivo alterado:", arq);
