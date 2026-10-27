const board = document.getElementById("game-board");
const THREE_LOAD_TIMEOUT_MS = 5000;

async function loadFallback() {
    board.classList.remove("is-3d");
    const loadingMessage = document.getElementById("loading-message");
    if (loadingMessage) loadingMessage.textContent = "3D graphics unavailable — loading the classic runner…";
    const legacy = document.createElement("script");
    legacy.src = board.dataset.legacyScript;
    legacy.defer = true;
    document.body.appendChild(legacy);
}

if (board && document.getElementById("drive-canvas")) {
    let loadTimeout;
    try {
        const [THREE, game] = await Promise.race([
            Promise.all([
                import("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js"),
                import("./game-3d.js"),
            ]),
            new Promise((_, reject) => {
                loadTimeout = window.setTimeout(
                    () => reject(new Error("3D startup timed out.")),
                    THREE_LOAD_TIMEOUT_MS,
                );
            }),
        ]);
        window.clearTimeout(loadTimeout);
        const { start3DGame } = game;
        await start3DGame(THREE);
    } catch (error) {
        window.clearTimeout(loadTimeout);
        console.warn("3D driving could not start; using the existing runner.", error);
        await loadFallback();
    }
}
