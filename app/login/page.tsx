"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
    const router = useRouter();
    const search = useSearchParams();
    const next = search.get("next") || "/";

    const [usuario, setUsuario] = React.useState("");
    const [senha, setSenha] = React.useState("");
    const [remember, setRemember] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // preenche lembrados
    React.useEffect(() => {
        const u = localStorage.getItem("usuario") || "";
        const s = localStorage.getItem("senha") || "";
        setUsuario(u);
        if (s) {
            setSenha(s);
            setRemember(true);
        }
    }, []);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!usuario || !senha) {
            setError("Preencha usuário e senha.");
            return;
        }
        setLoading(true);
        try {
            const r = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({ usuario, senha }),
            });

            const data = await r.json().catch(() => ({}));
            if (!r.ok || !data?.sucesso) {
                throw new Error(data?.msg || data?.error || "Dados incorretos. Tente novamente.");
            }

            // lembrar?
            if (remember) {
                localStorage.setItem("usuario", usuario);
                localStorage.setItem("senha", senha);
            } else {
                localStorage.removeItem("usuario");
                localStorage.removeItem("senha");
            }

            router.replace(next);
        } catch (err: any) {
            setError(err.message || "Erro de comunicação com o servidor.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main style={{ minHeight: "100dvh" }}>
            <div className="background-animation" />
            <div className="lock-screen">
                <div className="login-container">
                    <div className="logo">
                        <img
                            src="https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1.png?resize=1024%2C257&ssl=1"
                            alt="Logo Plano PAI"
                        />
                    </div>
                    <h1>App Plano PAI 1.0</h1>
                    <p>Para continuar, faça login abaixo.</p>

                    <form onSubmit={onSubmit} autoComplete="off">
                        <div className="futuristic-border">
                            <input
                                type="text"
                                name="usuario"
                                placeholder="Usuário"
                                value={usuario}
                                onChange={(e) => setUsuario(e.target.value)}
                                required
                                autoComplete="username"
                            />
                        </div>
                        <div className="futuristic-border">
                            <input
                                type="password"
                                name="senha"
                                placeholder="Senha"
                                value={senha}
                                onChange={(e) => setSenha(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                        </div>

                        <div className="remember-me">
                            <label htmlFor="rememberPassword">Memorizar a senha</label>
                            <label className="switch">
                                <input
                                    id="rememberPassword"
                                    type="checkbox"
                                    checked={remember}
                                    onChange={(e) => setRemember(e.target.checked)}
                                />
                                <span className="slider"></span>
                            </label>
                        </div>

                        <div className="futuristic-border">
                            <button id="btnEntrar" type="submit" disabled={loading}>
                                {loading ? "Entrando..." : "Entrar"}
                            </button>
                        </div>

                        <div className="error-message" style={{ display: error ? "block" : "none" }}>
                            {error}
                        </div>
                    </form>

                    <div className="footer">
                        <p>Aplicação em Desenvolvimento.</p>
                    </div>
                </div>
            </div>

            {/* estilos do seu HTML original */}
            <style jsx>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        .background-animation {
          position: fixed; inset: 0;
          background: linear-gradient(45deg, #243551, #0e9ee0, #243551, #0e9ee0);
          background-size: 400% 400%;
          animation: gradientAnimation 10s ease infinite;
          z-index: 0;
        }
        @keyframes gradientAnimation {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .lock-screen {
          position: relative;
          min-height: 100dvh;
          display: grid;
          place-items: center;
          z-index: 1;
        }
        .login-container {
          position: relative;
          background-color: #0e9ee0;
          padding: 40px 30px;
          border-radius: 15px;
          width: min(92vw, 420px);
          text-align: center;
          color: white;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .logo img { width: 100%; max-width: 250px; margin-bottom: 30px; }
        h1 {
          font-size: 26px;
          margin-bottom: 15px;
          color: white;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.4);
        }
        p { margin-bottom: 25px; font-size: 16px; }
        input[type="text"], input[type="password"] {
          width: 100%;
          padding: 12px;
          margin-bottom: 10px;
          border: 2px solid transparent;
          border-radius: 8px;
          background: #243551;
          color: white;
          font-size: 16px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.2);
          transition: all 0.3s ease;
        }
        input[type="text"]:focus, input[type="password"]:focus {
          border: 2px solid #0e9ee0;
          box-shadow: 0 0 10px rgba(14,158,224,0.7);
          outline: none;
        }
        button {
          width: 100%;
          padding: 14px;
          margin-top: 20px;
          background-color: #0e9ee0;
          color: white;
          border: 2px solid transparent;
          border-radius: 8px;
          font-size: 18px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        }
        button:hover { background-color: #007bb5; border: 2px solid #0e9ee0; box-shadow: 0 0 15px rgba(0,123,181,0.7); }
        button:active { background-color: #006a99; }
        button[disabled] { opacity: .7; cursor: not-allowed; }
        .footer { font-size: 12px; color: #ddd; margin-top: 30px; }
        .remember-me {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          margin-top: 10px;
          color: white;
          font-size: 14px;
          gap: 10px;
        }
        .switch { position: relative; display: inline-block; width: 34px; height: 20px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
          position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
          background-color: #ccc; transition: 0.4s; border-radius: 34px;
        }
        .slider:before {
          position: absolute; content: "";
          height: 12px; width: 12px; border-radius: 50%;
          left: 4px; bottom: 4px; background-color: white; transition: 0.4s;
        }
        input:checked + .slider { background-color: #0e9ee0; }
        input:checked + .slider:before { transform: translateX(14px); }
        .error-message { color: #ffcccc; font-size: 14px; margin-top: 10px; min-height: 20px; }
      `}</style>
        </main>
    );
}
