# Salas do Memorial pelo App PAI — 13/11/2026

Liga, desliga, atualiza e muda o som das TVs de cada sala pelo celular, de qualquer lugar.

```
Celular (App PAI /salas-tv) ──► salas_tv.php ──► MySQL (fila) ◄── salas_tv_agente.php ◄── PC do Memorial (agente) ──► TVs
```

O PC do Memorial só faz conexões de saída. Não precisa de IP público, porta aberta nem VPN.

## O que tem no pacote

| Pasta | Arquivo | Vai para |
|---|---|---|
| `sql/` | `salas_tv.sql` | phpMyAdmin (cria 3 tabelas novas; não mexe nas existentes) |
| `backend/` | `salas_tv.php`, `salas_tv_agente.php`, `salas_tv_comum.php` | HostGator, mesma pasta dos outros endpoints da API |
| `front/app/salas-tv/` | `page.tsx` | projeto do app: `app/salas-tv/page.tsx` |
| `ferramentas/` | `aplicar-salas-tv.mjs` | raiz do projeto do app (menu) e `pai_api.php` (chave) |
| `agente/` | `agente_salas.pyw`, `instalar_agente.bat/.ps1`, `remover_agente.bat/.ps1` | PC do Memorial, na pasta do `salas_pai.pyw` (ex.: `C:\SalasPAI`) |

## Passo a passo (nesta ordem)

1. **Banco:** rode o `sql/salas_tv.sql` no phpMyAdmin. O último SELECT deve listar `tv_comandos`, `tv_status` e `tv_agente`.

2. **API:** suba os 3 arquivos de `backend/` para a pasta da API (a mesma do `convenio.php`).

3. **Permissão (chave `salas-tv`, autorizada em 13/11):** baixe o `pai_api.php` do servidor, rode
   `node aplicar-salas-tv.mjs --pai-api caminho/do/pai_api.php`, confira e suba de volta.
   O script só acrescenta 2 linhas, logo depois de `tesouraria`, nas duas listas (`list_pages` e `$allowedPages`).
   Se ele avisar ✘, acrescente à mão:
   - na `list_pages`: `["key"=>"salas-tv", "label"=>"Salas do Memorial (TVs)"],`
   - no `$allowedPages`: `'salas-tv',`

4. **App:**
   - Copie `front/app/salas-tv/page.tsx` para `app/salas-tv/page.tsx`.
   - Na raiz do projeto, rode `node aplicar-salas-tv.mjs`. Ele acrescenta o item "Salas do Memorial" no módulo **Atendimento** do `components/shell/modulos.tsx`, depois de "Coroa de Flores", com o ícone de TV.
   - Antes do `git push`, rode `node codigo/ferramentas/conferir-imports.mjs --git` (ou o `conferir-imports.mjs` da raiz).

5. **Quem pode usar:** em **Permissões**, marque "Salas do Memorial (TVs)" nos cargos que vão usar. O fim do `salas_tv.sql` tem um exemplo comentado.

6. **PC do Memorial (o que fica sempre ligado):**
   1. Copie os arquivos de `agente/` para a pasta onde já está o `salas_pai.pyw`. Ela precisa ter também o `tvs-conhecidas.json` (com os MACs) e o `salas.json`.
   2. Clique com o botão direito no `instalar_agente.bat` e escolha **Executar como administrador**. Ele:
      - cria a chave do agente (`agente.json`, que fica só nesse PC; **não compartilhe**);
      - cria o `pai-tv-agente.php` (só o resumo da chave);
      - pede a senha do Windows do usuário, para o agente rodar mesmo sem login;
      - cria a tarefa "PAI Agente Salas": abre quando o PC liga, reabre se fechar e nunca abre duas vezes.
   3. No cPanel, suba o `pai-tv-agente.php` para **`/home2/pla48587/`**, na mesma pasta do `pai-chaves.php` e **fora** do `public_html`. Depois pode apagar a cópia do PC.
   4. Em uns 30 segundos, a tela do app mostra **"Memorial online"**.
   5. Configure o Windows desse PC: **Suspensão = Nunca**. Se o PC dormir, o agente para.

## Como conferir se deu certo

- **No PC:** o `agente.log` (na pasta) mostra "Agente iniciado", as TVs encontradas e cada pedido.
- **Testar a chave:** num Prompt, na pasta, rode `python agente_salas.pyw --testar`. Deve aparecer "OK: a API aceitou a chave".
- **No app:** "Memorial online"; ligar uma sala mostra o andamento ("Painel: ligando pela rede…") e depois "Sala ligada".

## Regras que o sistema segue

- **Ações aceitas:** só ligar, desligar, atualizar e volume, das salas 01 a 03. O servidor recusa qualquer outra coisa.
- **Um pedido por sala de cada vez.** Um novo volume substitui o volume que ainda não foi feito.
- **Memorial offline:** sem sinal do agente há mais de 45 s, o app desativa os botões e não aceita pedidos.
- **Pedido não buscado em 2 min:** vence ("Não chegou") e nunca é executado depois. Pedido em execução sem resposta em 5 min vira "Com problema".
- **Registros:** cada pedido fica em `tv_comandos`, com quem pediu, quando e o resultado. O agente também grava no `historico.txt`, o mesmo do `salas_pai.pyw`.
- **Chave do agente:** o servidor guarda só o resumo SHA-256. Para trocar a chave, apague `agente.json` e `pai-tv-agente.php` do PC, rode o instalador de novo e suba o novo `pai-tv-agente.php`. A chave antiga para de funcionar na hora.
- **Remover o agente:** `remover_agente.bat` (como administrador).

## O que foi testado e o que não foi

- **Testado aqui:**
  - Banco MariaDB e PHP 8.3 locais, com o agente contra TVs simuladas: ligar pela rede, andamento, conclusão, volume, pedido duplicado bloqueado, sala e ação inválidas recusadas, usuário sem permissão, sem login e chave errada.
  - A tela compilou no TypeScript do projeto e foi vista no computador e no celular (claro e escuro), com dados simulados.
  - O script do menu e do `pai_api.php` rodou nas cópias e o `php -l` passou.
- **Não testado:**
  - HostGator, banco real e Vercel.
  - As TVs reais pelo agente.
  - O Agendador de Tarefas e o PowerShell 5.1 do Windows (só a sintaxe foi conferida, no PowerShell 7).
