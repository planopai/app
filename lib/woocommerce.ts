// lib/woocommerce.ts
import WooCommerceRestApi, { IWooCommerceRestApiOptions } from "@woocommerce/woocommerce-rest-api";

const DEV = process.env.NODE_ENV !== "production";

// ⚠️ APENAS PARA TESTE LOCAL. NÃO COMMITAR COM VALORES REAIS.
const DEV_URL = "https://planoassistencialintegrado.com.br"; // sem barra no final
const DEV_CONSUMER_KEY = "ck_d65b95d5005585ee759c8a1b7ff4492b359eec1c";
const DEV_CONSUMER_SECRET = "cs_a3870ee1e8b3a703d7f91e41e607047cd28ad7f9";

export function getWC() {
    const urlEnv = process.env.WC_URL;
    const keyEnv = process.env.WC_CONSUMER_KEY;
    const secretEnv = process.env.WC_CONSUMER_SECRET;

    // Em produção, OBRIGA env. Em dev, faz fallback para DEV_*.
    const url = (urlEnv || (DEV ? DEV_URL : "")).replace(/\/+$/, "");
    const consumerKey = keyEnv || (DEV ? DEV_CONSUMER_KEY : "");
    const consumerSecret = secretEnv || (DEV ? DEV_CONSUMER_SECRET : "");

    if (!url || !consumerKey || !consumerSecret) {
        throw new Error(
            "WooCommerce: defina WC_URL/WC_CONSUMER_KEY/WC_CONSUMER_SECRET (prod) ou preencha DEV_* (somente dev)."
        );
    }

    const opts: IWooCommerceRestApiOptions = {
        url,
        consumerKey,
        consumerSecret,
        version: "wc/v3",
        // evita bloqueio do header Authorization em alguns hosts
        ...({ queryStringAuth: true } as any),
    };

    return new WooCommerceRestApi(opts);
}
