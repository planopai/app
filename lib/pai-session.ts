import crypto from "crypto";

export type SessaoPai = {
    usuario: string;
    modo?: "primario" | "contingencia";
    iat: number;
    exp: number;
};

export function validarPaiSession(
    token: string | undefined | null
): SessaoPai | null {
    if (!token) {
        return null;
    }

    const secret = process.env.PAI_SESSION_SECRET;

    if (!secret) {
        return null;
    }

    const partes = token.split(".");

    if (partes.length !== 2) {
        return null;
    }

    const [payloadBase64, assinaturaRecebida] = partes;

    const assinaturaEsperada = crypto
        .createHmac("sha256", secret)
        .update(payloadBase64)
        .digest("base64url");

    const a = Buffer.from(assinaturaRecebida);
    const b = Buffer.from(assinaturaEsperada);

    if (a.length !== b.length) {
        return null;
    }

    if (!crypto.timingSafeEqual(a, b)) {
        return null;
    }

    try {
        const payload = JSON.parse(
            Buffer.from(
                payloadBase64,
                "base64url"
            ).toString("utf8")
        ) as SessaoPai;

        if (
            !payload.usuario ||
            !payload.iat ||
            !payload.exp
        ) {
            return null;
        }

        const agora = Math.floor(Date.now() / 1000);

        if (payload.exp <= agora) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}