import { useEffect } from "react";

declare global {
    interface Window {
        OneSignalDeferred: any[];
    }
}

const OneSignalInit = () => {
    useEffect(() => {
        window.OneSignalDeferred = window.OneSignalDeferred || [];

        window.OneSignalDeferred.push(async function (OneSignal: any) {
            await OneSignal.init({
                appId: "8f845647-2474-4ede-9e74-96f911bf9c88",
                safari_web_id: "web.onesignal.auto.6514249a-4cb8-451b-a889-88f5913c9a7f",
                notifyButton: {
                    enable: true,
                },
                promptOptions: {
                    slidedown: {
                        enabled: true,
                        actionMessage: "Deseja receber notificações importantes?",
                        acceptButtonText: "Sim!",
                        cancelButtonText: "Não agora",
                    },
                },
            });
        });
    }, []);

    return null;
};

export default OneSignalInit;
