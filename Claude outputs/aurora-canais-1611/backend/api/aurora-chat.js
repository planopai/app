/*!
 * aurora-chat.js — Atendimento imediato 24 horas do Plano PAI no site (16/11/2026)
 *
 * Como instalar no WordPress (rodapé do tema ou plugin "Insert Headers and Footers" / WPCode, em "Footer"):
 *   <script src="https://api.planoassistencialintegrado.com.br/aurora-chat.js" defer></script>
 *
 * Opcional: data-api="https://.../aurora_13.php" no <script> para outro endereço da API.
 * O chat conversa com o aurora_13.php: a Aurora responde na hora, com a mesma Base de Conhecimento do WhatsApp, e passa
 * para a equipe quando precisa. A conversa aparece no Messenger do app PAI (aba Clientes, selo "Site").
 * Usa Shadow DOM: o estilo do site não interfere no chat, e o chat não interfere no site.
 */
(function () {
    "use strict";
    if (window.__paiAuroraChat) return;
    window.__paiAuroraChat = true;

    var script = document.currentScript;
    var API = (script && script.getAttribute("data-api")) || "https://api.planoassistencialintegrado.com.br/aurora_13.php";
    var CHAVE = "pai_atendimento_token";
    var WHATS = "https://wa.me/5577988534512";

    var token = "";
    var ultimoId = 0;
    var aberto = false;
    var timer = null;
    var esperando = 0; // até quando mostra "digitando…" depois de enviar
    var enviando = false;
    var iniciado = false;

    function ler() { try { return localStorage.getItem(CHAVE) || ""; } catch (e) { return ""; } }
    function gravar(v) { try { localStorage.setItem(CHAVE, v); } catch (e) { /* navegação privada */ } }
    function abertoAntes() { try { return sessionStorage.getItem(CHAVE + "_aberto") === "1"; } catch (e) { return false; } }
    function marcarAberto(v) { try { sessionStorage.setItem(CHAVE + "_aberto", v ? "1" : "0"); } catch (e) { /* ignora */ } }

    function api(corpo) {
        return fetch(API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo),
            credentials: "omit",
        }).then(function (r) {
            return r.json().catch(function () { return { erro: true, msg: "Não foi possível agora." }; });
        });
    }

    // ---------------- interface ----------------
    var host = document.createElement("div");
    host.id = "pai-atendimento-24h";
    host.style.cssText = "position:fixed;z-index:2147483000;right:0;bottom:0;";
    var raiz = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

    raiz.innerHTML =
        '<style>' +
        ':host{all:initial}' +
        '*{box-sizing:border-box;font-family:"Nunito Sans","Segoe UI",Roboto,Arial,sans-serif}' +
        '.bt{position:fixed;right:18px;bottom:18px;display:flex;align-items:center;gap:10px;height:56px;padding:0 20px 0 14px;border:0;border-radius:28px;background:#313C55;color:#fff;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 8px 24px rgba(31,38,56,.28)}' +
        '.bt:hover{background:#3D6A99}.bt:focus-visible{outline:3px solid #F2CB3F;outline-offset:2px}' +
        '.ico{position:relative;display:flex;width:32px;height:32px;align-items:center;justify-content:center;border-radius:50%;background:#F2CB3F;color:#313C55}' +
        '.ico svg{width:18px;height:18px}' +
        '.vivo{position:absolute;right:-1px;top:-1px;width:11px;height:11px;border-radius:50%;background:#B3CE52;border:2px solid #313C55}' +
        '.vivo:after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid #B3CE52;animation:pulso 1.8s infinite}' +
        '@keyframes pulso{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.6);opacity:0}}' +
        '@media (prefers-reduced-motion:reduce){.vivo:after{animation:none}}' +
        '.sub{display:block;font-size:11.5px;font-weight:700;opacity:.85;line-height:1.1}' +
        '.p{position:fixed;right:18px;bottom:18px;display:none;flex-direction:column;width:380px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 36px);border-radius:18px;overflow:hidden;background:#F4F6F9;box-shadow:0 16px 48px rgba(31,38,56,.32)}' +
        '.p.on{display:flex}' +
        '@media (max-width:520px){.p{right:0;bottom:0;width:100vw;max-width:100vw;height:100%;max-height:100%;border-radius:0}.bt{right:12px;bottom:12px}}' +
        '.hd{display:flex;align-items:center;gap:12px;padding:14px 12px 14px 16px;background:#313C55;color:#fff}' +
        '.hd .ico{width:40px;height:40px}.hd .ico svg{width:22px;height:22px}' +
        '.tt{flex:1;min-width:0}.tt b{display:block;font-size:16.5px;font-weight:800}.tt span{display:block;font-size:12.5px;opacity:.88}' +
        '.x{width:40px;height:40px;border:0;border-radius:12px;background:transparent;color:#fff;font-size:22px;cursor:pointer}.x:hover{background:rgba(255,255,255,.12)}' +
        '.lista{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:8px}' +
        '.m{max-width:85%;padding:9px 12px;border-radius:14px;font-size:15px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;color:#1F2638;background:#fff;box-shadow:0 1px .5px rgba(31,38,56,.13)}' +
        '.m.voce{align-self:flex-end;background:#E3EEDA;border-bottom-right-radius:4px}' +
        '.m.outro{align-self:flex-start;border-bottom-left-radius:4px}' +
        '.m .de{display:block;font-size:12px;font-weight:800;color:#3D6A99;margin-bottom:2px}' +
        '.m a{color:#3D6A99;font-weight:700}' +
        '.dig{align-self:flex-start;display:none;gap:4px;padding:12px 14px;border-radius:14px;background:#fff}.dig.on{display:flex}' +
        '.dig i{width:7px;height:7px;border-radius:50%;background:#8A93A6;animation:pula 1.2s infinite}.dig i:nth-child(2){animation-delay:.15s}.dig i:nth-child(3){animation-delay:.3s}' +
        '@keyframes pula{0%,60%,100%{transform:none;opacity:.5}30%{transform:translateY(-4px);opacity:1}}' +
        '.chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}' +
        '.chip{border:1.5px solid #3D6A99;background:#fff;color:#313C55;border-radius:18px;padding:7px 12px;font-size:13.5px;font-weight:800;cursor:pointer}.chip:hover{background:#EAF1F8}' +
        '.chip.ur{border-color:#B42318;color:#B42318}' +
        '.rod{display:flex;gap:8px;align-items:flex-end;padding:10px 10px 6px;background:#fff;border-top:1px solid #E3E8F0}' +
        'textarea{flex:1;resize:none;min-height:44px;max-height:120px;padding:11px 12px;border:1.5px solid #D5DBE5;border-radius:12px;font-size:15px;color:#1F2638;background:#fff;outline:none}' +
        'textarea:focus{border-color:#3D6A99}' +
        '.env{width:44px;height:44px;flex:none;border:0;border-radius:12px;background:#313C55;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}.env:disabled{opacity:.5;cursor:default}.env svg{width:20px;height:20px}' +
        '.lgpd{padding:0 12px 10px;background:#fff;font-size:11.5px;color:#5B6478;line-height:1.35}.lgpd a{color:#3D6A99}' +
        '.erro{margin:0 12px 8px;padding:8px 10px;border-radius:10px;background:#FDECEA;color:#8A1C12;font-size:13px;font-weight:700;display:none}.erro.on{display:block}' +
        '.isca{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}' +
        '</style>' +
        '<button class="bt" type="button" aria-label="Abrir o atendimento imediato 24 horas do Plano PAI">' +
        '  <span class="ico">' + iconeChat() + '<span class="vivo" aria-hidden="true"></span></span>' +
        '  <span>Atendimento 24h<span class="sub">Respondemos agora</span></span>' +
        '</button>' +
        '<section class="p" role="dialog" aria-label="Atendimento imediato 24 horas">' +
        '  <div class="hd"><span class="ico">' + iconeChat() + '</span>' +
        '    <div class="tt"><b>Atendimento imediato · 24 horas</b><span>Aurora, assistente do Plano PAI · responde na hora</span></div>' +
        '    <button class="x" type="button" aria-label="Fechar o atendimento">×</button></div>' +
        '  <div class="lista" aria-live="polite"></div>' +
        '  <div class="chips"></div>' +
        '  <div class="erro" role="alert"></div>' +
        '  <form class="rod"><input class="isca" name="site" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '    <textarea rows="1" maxlength="1000" placeholder="Escreva sua mensagem" aria-label="Sua mensagem"></textarea>' +
        '    <button class="env" type="submit" aria-label="Enviar">' + iconeEnviar() + '</button></form>' +
        '  <div class="lgpd">Seus dados são usados só para este atendimento. Não envie CPF, cartão ou senha por aqui. Falecimento: plantão 24h <a href="tel:+5577988534512">(77) 98853-4512</a>.</div>' +
        '</section>';

    function iconeChat() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>';
    }
    function iconeEnviar() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>';
    }

    var $ = function (s) { return raiz.querySelector(s); };
    var botao = $(".bt"), painel = $(".p"), lista = $(".lista"), chips = $(".chips"), erroBox = $(".erro");
    var form = $(".rod"), campo = $("textarea"), isca = $(".isca"), btEnviar = $(".env");
    var dig = document.createElement("div");
    dig.className = "dig";
    dig.innerHTML = "<i></i><i></i><i></i>";

    function escapar(t) {
        return String(t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
    }
    function comLinks(t) {
        return escapar(t).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, function (u) {
            return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + "</a>";
        });
    }

    function bolha(de, nome, texto, anexo) {
        var b = document.createElement("div");
        b.className = "m " + (de === "voce" ? "voce" : "outro");
        var html = de === "voce" ? "" : '<span class="de">' + escapar(nome) + "</span>";
        html += comLinks(texto || "");
        if (anexo && anexo.url) {
            var seguro = /^https:\/\//.test(anexo.url) ? anexo.url : "#";
            html += (texto ? "\n" : "") + (/^image\//.test(anexo.mime || "")
                ? '<a href="' + escapar(seguro) + '" target="_blank" rel="noopener noreferrer"><img src="' + escapar(seguro) + '" alt="' + escapar(anexo.nome || "imagem") + '" style="max-width:100%;border-radius:10px;display:block;margin-top:4px"></a>'
                : '📎 <a href="' + escapar(seguro) + '" target="_blank" rel="noopener noreferrer">' + escapar(anexo.nome || "arquivo") + "</a>");
        }
        b.innerHTML = html;
        lista.insertBefore(b, dig);
    }

    function rolar() { lista.scrollTop = lista.scrollHeight; }

    function saudacao() {
        bolha("aurora", "Aurora", "Olá! Eu sou a Aurora, do Plano PAI. Estou aqui 24 horas para tirar suas dúvidas e, se precisar, chamo alguém da equipe. Como posso ajudar?");
        var opcoes = [
            ["Falecimento: preciso de ajuda agora", "Preciso de ajuda agora: houve um falecimento.", true],
            ["Conhecer os planos", "Quero conhecer os planos do PAI."],
            ["Já sou associado", "Já sou associado e tenho uma dúvida."],
            ["Coroa de flores", "Quero encomendar uma coroa de flores."],
        ];
        opcoes.forEach(function (o) {
            var c = document.createElement("button");
            c.type = "button";
            c.className = "chip" + (o[2] ? " ur" : "");
            c.textContent = o[0];
            c.addEventListener("click", function () { enviar(o[1]); });
            chips.appendChild(c);
        });
    }

    function mostrarErro(t) {
        erroBox.innerHTML = escapar(t) + ' <a href="' + WHATS + '" target="_blank" rel="noopener noreferrer" style="color:#8A1C12">Falar pelo WhatsApp</a>';
        erroBox.classList.add("on");
    }

    function aplicar(msgs) {
        var chegouResposta = false;
        var antes = ultimoId; // mensagens antigas, carregadas ao abrir a página, não contam como novas
        (msgs || []).forEach(function (m) {
            if (m.id <= ultimoId) return;
            ultimoId = m.id;
            bolha(m.de, m.nome, m.texto, m.anexo);
            if (m.de !== "voce") chegouResposta = true;
        });
        if (chegouResposta) esperando = 0;
        if (chegouResposta && !aberto && antes > 0) $(".sub").textContent = "Nova mensagem para você";
        dig.classList.toggle("on", esperando > Date.now());
        if (msgs && msgs.length) rolar();
        if (ultimoId > 0) chips.style.display = "none";
    }

    function buscar() {
        if (!token) return Promise.resolve();
        return api({ acao: "mensagens", token: token, depois: ultimoId }).then(function (r) {
            if (r && !r.erro && r.dados) aplicar(r.dados.mensagens);
            else dig.classList.toggle("on", esperando > Date.now());
        }).catch(function () { /* tenta de novo no próximo ciclo */ });
    }

    function agendar() {
        clearTimeout(timer);
        var ms = aberto ? (esperando > Date.now() ? 2000 : 3500) : 20000;
        if (document.hidden) ms = Math.max(ms, 30000);
        timer = setTimeout(function () { buscar().then(agendar); }, ms);
    }

    function iniciar() {
        if (iniciado) return Promise.resolve();
        iniciado = true;
        saudacao();
        return api({ acao: "iniciar", token: ler() }).then(function (r) {
            if (!r || r.erro || !r.dados) { mostrarErro((r && r.msg) || "Não foi possível abrir o atendimento agora."); return; }
            token = r.dados.token;
            gravar(token);
            aplicar(r.dados.mensagens);
            agendar();
        }).catch(function () { mostrarErro("Sem conexão agora."); iniciado = false; });
    }

    function enviar(texto) {
        texto = String(texto || "").trim();
        if (!texto || enviando) return;
        if (!token) { iniciar().then(function () { if (token) enviar(texto); }); return; }
        enviando = true;
        btEnviar.disabled = true;
        erroBox.classList.remove("on");
        chips.style.display = "none";
        var temp = document.createElement("div");
        temp.className = "m voce";
        temp.style.opacity = ".6";
        temp.textContent = texto;
        lista.insertBefore(temp, dig);
        esperando = Date.now() + 45000;
        dig.classList.add("on");
        rolar();
        api({ acao: "enviar", token: token, texto: texto, depois: ultimoId, site: isca.value, pagina: location.pathname }).then(function (r) {
            temp.remove();
            if (!r || r.erro) {
                esperando = 0;
                dig.classList.remove("on");
                mostrarErro((r && r.msg) || "Não foi possível enviar.");
                if (!campo.value) campo.value = texto;
                return;
            }
            aplicar(r.dados && r.dados.mensagens);
        }).catch(function () {
            temp.remove();
            esperando = 0;
            dig.classList.remove("on");
            mostrarErro("Sem conexão agora.");
            if (!campo.value) campo.value = texto;
        }).then(function () {
            enviando = false;
            btEnviar.disabled = false;
            agendar();
        });
    }

    function abrir() {
        aberto = true;
        marcarAberto(true);
        painel.classList.add("on");
        botao.style.display = "none";
        $(".sub").textContent = "Respondemos agora";
        iniciar().then(function () { rolar(); agendar(); });
        setTimeout(function () { campo.focus(); }, 60);
    }
    function fechar() {
        aberto = false;
        marcarAberto(false);
        painel.classList.remove("on");
        botao.style.display = "";
        agendar();
        botao.focus();
    }

    botao.addEventListener("click", abrir);
    $(".x").addEventListener("click", fechar);
    painel.addEventListener("keydown", function (e) { if (e.key === "Escape") fechar(); });
    form.addEventListener("submit", function (e) {
        e.preventDefault();
        var t = campo.value;
        campo.value = "";
        campo.style.height = "";
        enviar(t);
    });
    campo.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit")); }
    });
    campo.addEventListener("input", function () {
        campo.style.height = "";
        campo.style.height = Math.min(campo.scrollHeight, 120) + "px";
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && token) { buscar().then(agendar); } });

    lista.appendChild(dig);
    function montar() {
        document.body.appendChild(host);
        // quem já conversou continua recebendo as respostas com o chat fechado (o botão mostra "Nova mensagem para você")
        if (ler()) iniciar();
        if (abertoAntes()) abrir();
    }
    if (document.body) montar();
    else document.addEventListener("DOMContentLoaded", montar);
})();
