import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

export const wc = new WooCommerceRestApi({
    url: process.env.WC_URL!, // https://minhaloja.com
    consumerKey: process.env.WC_CONSUMER_KEY!,
    consumerSecret: process.env.WC_CONSUMER_SECRET!,
    version: "wc/v3",
    queryStringAuth: false, // usa auth HTTP (recomendado em HTTPS)
});
