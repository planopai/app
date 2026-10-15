#!/usr/bin/env node
/**
 * conferir-imports.mjs — roda ANTES do git push, na raiz do projeto Next (a pasta que tem app/, components/ e package.json):
 *
 *     node conferir-imports.mjs
 *
 * Acha os três erros que derrubam o build da Vercel e que no Windows/VS Code passam despercebidos:
 *   1) "Module not found: Can't resolve './arquivo'"  → o import aponta para um arquivo que NÃO existe na pasta;
 *   2) letra maiúscula/minúscula diferente (o Windows aceita, a Vercel/Linux não);
 *   3) pacote importado que NÃO está no package.json (ex.: "ably").
 *
 * Não altera nada. Sai com código 1 se achar problema. Opcional: --git  (também avisa arquivos que existem na pasta mas não estão no Git).
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const raiz = process.cwd();
const usarGit = process.argv.includes("--git");
const PASTAS = ["app", "components", "lib", "hooks", "worker"].filter((p) => fs.existsSync(path.join(raiz, p)));
const EXT_CODIGO = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const TENTAR = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".css"];
const NATIVOS = new Set(["fs", "path", "os", "crypto", "http", "https", "url", "util", "stream", "events", "zlib", "buffer", "child_process"]);

if (!fs.existsSync(path.join(raiz, "package.json"))) {
    console.error("Não achei package.json aqui. Rode na raiz do projeto Next.");
    process.exit(2);
}
const pkg = JSON.parse(fs.readFileSync(path.join(raiz, "package.json"), "utf8"));
const declarados = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {}), ...Object.keys(pkg.peerDependencies || {}), ...Object.keys(pkg.optionalDependencies || {})]);

function listar(dir, saida = []) {
    for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
        if (nome.name === "node_modules" || nome.name === ".next" || nome.name.startsWith(".")) continue;
        const p = path.join(dir, nome.name);
        if (nome.isDirectory()) listar(p, saida);
        else if (EXT_CODIGO.has(path.extname(nome.name)) && !nome.name.endsWith(".d.ts")) saida.push(p);
    }
    return saida;
}

/** Existe o caminho com a CAIXA EXATA? Devolve { achou, caixaDiferente } */
function existeExato(p) {
    const partes = path.relative(raiz, p).split(path.sep);
    let atual = raiz;
    for (const parte of partes) {
        let entradas;
        try {
            entradas = fs.readdirSync(atual);
        } catch {
            return { achou: false };
        }
        if (entradas.includes(parte)) {
            atual = path.join(atual, parte);
            continue;
        }
        const alt = entradas.find((e) => e.toLowerCase() === parte.toLowerCase());
        return alt ? { achou: true, caixaDiferente: path.join(path.relative(raiz, atual), alt) } : { achou: false };
    }
    return { achou: true };
}

function resolverArquivo(base) {
    let diferente = null;
    for (const ext of TENTAR) {
        const r = existeExato(base + ext);
        if (r.achou && fs.statSync(r.caixaDiferente ? path.join(raiz, r.caixaDiferente) : base + ext).isFile()) return { ok: true, diferente: r.caixaDiferente || diferente };
        if (r.achou && r.caixaDiferente) diferente = r.caixaDiferente;
    }
    for (const idx of ["index.ts", "index.tsx", "index.js", "index.jsx"]) {
        const r = existeExato(path.join(base, idx));
        if (r.achou) return { ok: true, diferente: r.caixaDiferente || diferente };
    }
    return { ok: false, diferente };
}

const RE = [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s+["']([^"']+)["']/g, /\bimport\(\s*["']([^"']+)["']\s*\)/g, /\brequire\(\s*["']([^"']+)["']\s*\)/g];
const faltando = [];
const caixa = [];
const pacotes = new Map();

for (const pasta of PASTAS) {
    for (const arq of listar(path.join(raiz, pasta))) {
        const texto = fs.readFileSync(arq, "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");
        const vistos = new Set();
        for (const re of RE) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(texto))) vistos.add(m[1]);
        }
        for (const spec of vistos) {
            const rel = path.relative(raiz, arq).split(path.sep).join("/");
            if (spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@/")) {
                const base = spec.startsWith("@/") ? path.join(raiz, spec.slice(2)) : path.resolve(path.dirname(arq), spec);
                if (/\.(css|svg|png|jpg|jpeg|webp|ico|json)$/.test(spec) && fs.existsSync(base)) continue;
                const r = resolverArquivo(base);
                if (!r.ok) faltando.push(`${rel}  →  ${spec}`);
                else if (r.diferente) caixa.push(`${rel}  →  ${spec}   (no disco está como: ${r.diferente.split(path.sep).join("/")})`);
            } else if (!spec.startsWith("node:") && !NATIVOS.has(spec)) {
                const nome = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
                if (!declarados.has(nome)) {
                    if (!pacotes.has(nome)) pacotes.set(nome, []);
                    pacotes.get(nome).push(rel);
                }
            }
        }
    }
}

let naoGit = [];
if (usarGit) {
    try {
        const rastreados = new Set(execSync("git ls-files", { cwd: raiz, encoding: "utf8" }).split("\n").filter(Boolean));
        const ignorados = new Set(execSync("git ls-files --others --ignored --exclude-standard", { cwd: raiz, encoding: "utf8" }).split("\n").filter(Boolean));
        for (const pasta of PASTAS) {
            for (const arq of listar(path.join(raiz, pasta))) {
                const rel = path.relative(raiz, arq).split(path.sep).join("/");
                if (!rastreados.has(rel)) naoGit.push(rel + (ignorados.has(rel) ? "   (IGNORADO pelo .gitignore)" : "   (ainda não está no Git: git add)"));
            }
        }
    } catch {
        naoGit = ["(não consegui rodar o git aqui)"];
    }
}

const ok = !faltando.length && !caixa.length && !pacotes.size;
console.log(`Conferi ${PASTAS.join(", ")}.`);
if (faltando.length) {
    console.log(`\n✖ ARQUIVO NÃO EXISTE (${faltando.length}) — é o "Module not found" da Vercel:`);
    faltando.forEach((l) => console.log("   " + l));
}
if (caixa.length) {
    console.log(`\n✖ LETRA MAIÚSCULA/MINÚSCULA DIFERENTE (${caixa.length}) — funciona no Windows, quebra na Vercel:`);
    caixa.forEach((l) => console.log("   " + l));
}
if (pacotes.size) {
    console.log(`\n✖ PACOTE FORA DO package.json (${pacotes.size}) — rode npm install <pacote>:`);
    for (const [n, lista] of pacotes) console.log(`   ${n}   (usado em ${lista.length} arquivo(s), ex.: ${lista[0]})`);
}
if (usarGit && naoGit.length) {
    console.log(`\n⚠ ARQUIVOS DE CÓDIGO QUE O GIT NÃO ESTÁ LEVANDO (${naoGit.length}):`);
    naoGit.forEach((l) => console.log("   " + l));
}
if (ok) console.log("\n✔ Todos os imports resolvem, com a caixa certa e com os pacotes no package.json.");
process.exit(ok ? 0 : 1);
