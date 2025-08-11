// lib/woocommerce.ts
import WooCommerceRestApi, {
    IWooCommerceRestApiOptions,
} from "@woocommerce/woocommerce-rest-api";

export function getWC() {
    const url = process.env.WC_URL;
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!url || !consumerKey || !consumerSecret) {
        throw new Error(
            "WooCommerce: defina WC_URL, WC_CONSUMER_KEY e WC_CONSUMER_SECRET nas variáveis de ambiente."
        );
    }

    const opts: IWooCommerceRestApiOptions = {
        url,
        consumerKey,
        consumerSecret,
        version: "wc/v3",
        // se quiser usar queryStringAuth, faça um cast:
        // ...( { queryStringAuth: false } as any ),
    };

    return new WooCommerceRestApi(opts);
}
