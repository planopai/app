#!/usr/bin/env node
/**
 * aplicar-salas-tv.mjs — acrescenta a tela "Salas do Memorial" (chave salas-tv), autorizada em 13/11/2026.
 *
 * Não reescreve nenhum arquivo: só ACRESCENTA uma linha depois de um trecho conhecido.
 * Confere o trecho antes; se estiver diferente, não mexe e avisa com ✘. Pode rodar duas vezes.
 *
 * Uso (na raiz do projeto do app):
 *   node aplicar-salas-tv.mjs                          → menu (components/shell/modulos.tsx)
 *   node aplicar-salas-tv.mjs --pai-api caminho/pai_api.php  → também a chave nas 2 listas do pai_api.php
 *     (baixe o pai_api.php do servidor, rode, confira e suba de volta)
 */
import fs from "node:fs";
import path from "node:path";

let falhas = 0;

function acrescentar(arquivo, descricao, ancora, novo, jaTem) {
    if (!fs.existsSync(arquivo)) {
        console.log(`✘ ${descricao}: arquivo não encontrado (${arquivo})`);
        falhas++;
        return;
    }
    let s = fs.readFileSync(arquivo, "utf8");
    if (s.includes(jaTem)) {
        console.log(`• ${descricao}: já estava feito`);
        return;
    }
    const n = s.split(ancora).length - 1;
    if (n !== 1) {
        console.log(`✘ ${descricao}: trecho de referência ${n === 0 ? "não encontrado" : "aparece " + n + " vezes"}; não mexi.`);
        console.log(`   Trecho procurado: ${ancora.trim().slice(0, 120)}`);
        falhas++;
        return;
    }
    s = s.replace(ancora, ancora + novo);
    fs.writeFileSync(arquivo, s, "utf8");
    console.log(`✔ ${descricao}`);
}

// ---------------------------------------------------------------- menu (módulo Atendimento)
const modulos = path.join(process.cwd(), "components", "shell", "modulos.tsx");
acrescentar(
    modulos,
    "Menu: item Salas do Memorial no módulo Atendimento",
    `            { id: "coroas", titulo: "Coroa de Flores", desc: "Coroas naturais e artificiais", href: "/coroa-de-flores", slugs: ["coroa-de-flores"], icone: IconFlower, selo: "coroas" },\n`,
    `            // 13/11/2026: TVs das salas (painel de fora + TV de dentro) pelo app, via agente do PC do Memorial\n` +
        `            { id: "salas-tv", titulo: "Salas do Memorial", desc: "Ligar e desligar as TVs das salas", href: "/salas-tv", slugs: ["salas-tv"], icone: IconDeviceTv },\n`,
    `href: "/salas-tv"`,
);
acrescentar(
    modulos,
    "Menu: import do ícone IconDeviceTv",
    `    IconDeviceDesktopAnalytics,\n`,
    `    IconDeviceTv,\n`,
    `    IconDeviceTv,\n`,
);

// ---------------------------------------------------------------- pai_api.php (opcional)
const i = process.argv.indexOf("--pai-api");
if (i > 0) {
    const api = process.argv[i + 1] || "";
    acrescentar(
        api,
        "pai_api.php: chave salas-tv na list_pages",
        `    ["key"=>"messenger-historico", "label"=>"Messenger · Histórico de clientes"],\n`,
        `    // Salas do Memorial (TVs pelo app), autorizada em 13/11/2026\n    ["key"=>"salas-tv",            "label"=>"Salas do Memorial (TVs)"],\n`,
        `"key"=>"salas-tv"`,
    );
    acrescentar(
        api,
        "pai_api.php: chave salas-tv no $allowedPages",
        `    'messenger-historico',\n`,
        `    'salas-tv',\n`,
        `    'salas-tv',\n`,
    );
}

console.log(falhas ? `\n${falhas} item(ns) não aplicado(s): veja as linhas com ✘ e acrescente à mão (LEIA-ME).` : "\nPronto.");
process.exit(falhas ? 1 : 0);
