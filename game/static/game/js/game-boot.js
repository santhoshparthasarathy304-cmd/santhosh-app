const board = document.getElementById("game-board");
const THREE_LOAD_TIMEOUT_MS = 5000;
const loadingScreen = document.getElementById("loading-screen");
const loadingMessage = document.getElementById("loading-message");
const loadingProgress = document.getElementById("loading-progress");

async function loadFallback() {
    board.classList.remove("is-3d");
    if (loadingMessage) {
        loadingMessage.textContent = "3D graphics unavailable — starting the classic runner…";
    }
    if (loadingProgress) {
        loadingProgress.style.width = "72%";
        loadingProgress.removeAttribute("aria-valuenow");
    }
    loadingScreen?.classList.remove("is-loading");

    await new Promise((resolve, reject) => {
        const legacy = document.createElement("script");
        legacy.src = board.dataset.legacyScript;
        legacy.onload = resolve;
        legacy.onerror = () => {
            if (loadingMessage) {
                loadingMessage.textContent = "The game could not load. Check your connection and refresh.";
            }
            reject(new Error("The classic game script could not be loaded."));
        };
        document.body.appendChild(legacy);
    });
}

if (board && document.getElementById("drive-canvas")) {
    let loadTimeout;
    const statusTimeout = window.setTimeout(() => {
        if (loadingMessage) loadingMessage.textContent = "3D graphics are taking a moment…";
    }, 1800);
    loadingScreen?.classList.add("is-loading");
    if (loadingMessage) loadingMessage.textContent = "Loading 3D graphics…";
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
        window.clearTimeout(statusTimeout);
        const { start3DGame } = game;
        await start3DGame(THREE);
    } catch (error) {
        window.clearTimeout(loadTimeout);
        window.clearTimeout(statusTimeout);
        console.warn("3D driving could not start; using the existing runner.", error);
        await loadFallback().catch((fallbackError) => {
            console.error("The classic game could not start.", fallbackError);
        });
    }
}
