const board = document.getElementById("game-board");

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
    try {
        const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js");
        const { start3DGame } = await import("./game-3d.js");
        await start3DGame(THREE);
    } catch (error) {
        console.warn("3D driving could not start; using the existing runner.", error);
        await loadFallback();
    }
}
