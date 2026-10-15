// aplicar-nome-cadastrado.mjs (15/10/2026)
// Troca o login ("Dimarjunior") pelo nome cadastrado ("Dimar Júnior") em:
//   - components/app-sidebar.tsx  (nome no rodapé do menu)
//   - coroas.php                  (nome gravado nos pedidos de coroa)
// Uso (na raiz do projeto do front):
//   node ferramentas/aplicar-nome-cadastrado.mjs                      -> só o app-sidebar.tsx
//   node ferramentas/aplicar-nome-cadastrado.mjs caminho/do/coroas.php -> app-sidebar.tsx + coroas.php
// Confere o trecho antes; se estiver diferente, não mexe e avisa com ✘. Pode rodar duas vezes.
import fs from "node:fs";
import path from "node:path";

const MARCA = "nome cadastrado (15/10/2026)";
let falhas = 0;

function aplicar(arquivo, alteracoes) {
    if (!fs.existsSync(arquivo)) { console.log(`✘ ${arquivo}: arquivo não encontrado`); falhas++; return; }
    let txt = fs.readFileSync(arquivo, "utf8");
    if (txt.toLowerCase().includes(MARCA)) { console.log(`• ${arquivo}: já estava alterado`); return; }
    const crlf = txt.includes("\r\n");
    if (crlf) txt = txt.replace(/\r\n/g, "\n");
    for (const { nome, busca, troca } of alteracoes) {
        const achados = txt.match(new RegExp(busca.source, busca.flags.includes("g") ? busca.flags : busca.flags + "g"));
        if (!achados || achados.length !== 1) {
            console.log(`✘ ${arquivo}: trecho "${nome}" ${achados ? "aparece " + achados.length + " vezes" : "não encontrado"}. Nada foi alterado neste arquivo.`);
            falhas++;
            return;
        }
        txt = txt.replace(busca, troca);
    }
    if (crlf) txt = txt.replace(/\n/g, "\r\n");
    fs.writeFileSync(arquivo + ".antes-nome-cadastrado", fs.readFileSync(arquivo));
    fs.writeFileSync(arquivo, txt, "utf8");
    console.log(`✔ ${arquivo}: alterado (cópia do original em ${path.basename(arquivo)}.antes-nome-cadastrado)`);
}

/* ---------- app-sidebar.tsx ---------- */
// O useContadores já busca o whoami (usuarios.nome) em numeros.nome. O cookie continua como
// valor inicial; quando o nome cadastrado chega, ele substitui o login.
aplicar("components/app-sidebar.tsx", [
    {
        nome: "uso do useContadores (const numeros = useContadores(...))",
        busca: /const numeros = useContadores\(/,
        troca: "const numeros = useContadores(",
    },
    {
        nome: "fim do efeito do nome (setDisplayName(formatted); }, []);)",
        busca: /(\n([ \t]*)setDisplayName\(formatted\);\n[ \t]*\}, \[\]\);\n)/,
        troca: (_m, bloco, ind) => {
            const fora = ind.length >= 2 ? ind.slice(2) : "";
            return `${bloco}\n${fora}/* Nome cadastrado (15/10/2026): o whoami (usuarios.nome) vale sobre o login do cookie. */\n${fora}React.useEffect(() => {\n${ind}const completo = String(numeros.nome || "").trim();\n${ind}if (completo) setDisplayName(completo);\n${fora}}, [numeros.nome]);\n`;
        },
    },
]);

/* ---------- coroas.php ---------- */
const coroas = process.argv.slice(2).find((a) => /coroas\.php$/i.test(a));
if (coroas) {
    aplicar(coroas, [
        {
            nome: "function usuario_atual()",
            busca: /function usuario_atual\(\): string \{\n/,
            troca: `/**
 * Nome cadastrado (15/10/2026): o pedido grava usuarios.nome (ex.: "Dimar Júnior"),
 * não o login ("Dimarjunior"). Procura pelo id (sessão ou cookie pai_uid) e pelo login (pai_user).
 */
function nome_cadastrado_usuario_logado(): string {
    $pdo = $GLOBALS['pdo'] ?? null;
    if (!($pdo instanceof PDO)) return '';
    $id = (int)($_SESSION['user_id'] ?? $_SESSION['usuario_id'] ?? $_COOKIE['pai_uid'] ?? 0);
    $login = trim((string)($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));
    try {
        $row = null;
        if ($id > 0) {
            $st = $pdo->prepare("SELECT nome, usuario FROM usuarios WHERE id = :id LIMIT 1");
            $st->execute([':id' => $id]);
            $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
            if ($row && $login !== '' && strcasecmp((string)($row['usuario'] ?? ''), $login) !== 0) $row = null;
        }
        if (!$row && $login !== '') {
            $st = $pdo->prepare("SELECT nome, usuario FROM usuarios WHERE usuario = :u LIMIT 1");
            $st->execute([':u' => $login]);
            $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
        }
    } catch (Throwable $e) {
        return '';
    }
    return trim((string)($row['nome'] ?? ''));
}

function usuario_atual(): string {
    $cadastrado = normalizar_nome_usuario(nome_cadastrado_usuario_logado());
    if ($cadastrado !== '') return $cadastrado;

`,
        },
    ]);
} else {
    console.log("• coroas.php não informado: passe o caminho dele para alterar também (ex.: node ferramentas/aplicar-nome-cadastrado.mjs ../api/coroas.php)");
}

console.log(falhas ? `\n${falhas} arquivo(s) com ✘: me mande esse(s) arquivo(s) que eu ajusto.` : "\nPronto.");
