self.addEventListener("install", () => {
    console.log("Service Worker instalado");
});

self.addEventListener("fetch", (event) => {
    // Pode adicionar lógica de cache aqui
});
