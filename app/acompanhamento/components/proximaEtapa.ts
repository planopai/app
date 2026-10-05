import { Registro } from "./types";
import { acaoToStatus, proximaFaseDoRegistro } from "./helpers";
import { fases } from "./constants";

function ehTerceiro(r: Registro) {
    return String((r as any).tipo_atendimento ?? "").trim().toLowerCase() === "terceiro";
}

/** Código da próxima fase (ex.: "fase05") do registro, pela mesma regra do "Registrar ação". null = nada a registrar. */
export function proximaFaseCodigo(r: Registro): string | null {
    try {
        if (ehTerceiro(r)) {
            const ordem = ["fase08", "fase09", "fase10"];
            const i = ordem.indexOf(String(r.status || ""));
            return (i < 0 ? ordem[0] : ordem[i + 1]) ?? null;
        }
        const prox = proximaFaseDoRegistro(
            {
                status: (r.status as string) ?? "fase00",
                local_velorio: (r as any).local_velorio,
                sala_velorio: (r as any).sala_velorio,
                tanato: (r as any).tanato,
                ornamentacao: (r as any).ornamentacao,
                assistencia: (r as any).assistencia,
                realiza_velorio: (r as any).realiza_velorio,
                realiza_sepultamento: (r as any).realiza_sepultamento,
            },
            fases as readonly string[],
        );
        return prox ? String(prox) : null;
    } catch {
        return null;
    }
}

/** Texto da próxima etapa (ex.: "Início da Ornamentação"), ou "—". */
export function proximaEtapaDoRegistro(r: Registro): string {
    const f = proximaFaseCodigo(r);
    return f ? acaoToStatus(f) : "—";
}
