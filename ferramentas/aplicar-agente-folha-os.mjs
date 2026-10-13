// Folha da OS (13/10/2026): o campo "Agente" passa a mostrar QUEM ABRIU A OS (os_ordens.criado_por),
// e não mais o agente da última ação do atendimento (sepultamentos.agente). Sem quem abriu gravado, continua o de antes.
//
// Uso (na raiz do projeto, ou passando o caminho do arquivo):
//   node ferramentas/aplicar-agente-folha-os.mjs [caminho/do/os_documentos.php]
// Confere o trecho antes; se estiver diferente, não mexe em nada e avisa. Pode rodar duas vezes.
import fs from "node:fs";

const arquivo = process.argv[2] || "backend/os_documentos.php";
if (!fs.existsSync(arquivo)) {
  console.error(`✘ Não achei ${arquivo}. Passe o caminho do os_documentos.php: node ferramentas/aplicar-agente-folha-os.mjs <caminho>`);
  process.exit(1);
}
const antes = "$campo('Agente', $at ? escHtml($at['agente']) : $nd)";
const depois =
  "$campo('Agente', ($quemAbriuOS = nomeUsuario($pdo, $os['criado_por'] !== null ? (int) $os['criado_por'] : null)) !== null ? escHtml($quemAbriuOS) : ($at ? escHtml($at['agente']) : $nd))";

let texto = fs.readFileSync(arquivo, "utf8");
if (texto.includes(depois)) {
  console.log("✔ Já aplicado: a folha mostra quem abriu a OS.");
  process.exit(0);
}
const vezes = texto.split(antes).length - 1;
if (vezes !== 1) {
  console.error(`✘ O trecho do campo Agente não está como esperado (achei ${vezes} vez(es)). Nada foi alterado — mande o os_documentos.php.`);
  process.exit(1);
}
fs.copyFileSync(arquivo, arquivo + ".bak-agente");
texto = texto.replace(antes, depois);
fs.writeFileSync(arquivo, texto);
console.log(`✔ ${arquivo}: o campo Agente da folha agora mostra quem abriu a OS (cópia de segurança em ${arquivo}.bak-agente).`);
