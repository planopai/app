import WooCommerceRestApi, { IWooCommerceRestApiOptions } from "@woocommerce/woocommerce-rest-api";

export function getWC() {
    const url = process.env.WC_URL?.replace(/\/+$/, ""); // remove barra final
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;

    if (!url || !consumerKey || !consumerSecret) {
        throw new Error("WooCommerce: defina WC_URL, WC_CONSUMER_KEY e WC_CONSUMER_SECRET.");
    }
    if (!/^https?:\/\//i.test(url)) {
        throw new Error("WooCommerce: WC_URL precisa incluir http(s)://");
    }

    const opts: IWooCommerceRestApiOptions = {
        url,
        consumerKey,
        consumerSecret,
        version: "wc/v3",
        ...({ queryStringAuth: true } as any), // evita bloqueio do header Authorization
    };

    return new WooCommerceRestApi(opts);
}
