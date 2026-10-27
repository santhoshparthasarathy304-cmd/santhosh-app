(() => {
    "use strict";

    const garage = document.getElementById("garage");
    if (!garage) return;

    const status = document.getElementById("garage-status");
    const notice = document.getElementById("garage-notice");
    const balance = document.getElementById("garage-balance");
    const rewardButton = document.getElementById("daily-reward");
    const csrfToken = document.querySelector(".csrf-source [name=csrfmiddlewaretoken]").value;

    function showNotice(message, isError = false) {
        notice.hidden = false;
        notice.textContent = message;
        notice.classList.toggle("is-error", isError);
        window.clearTimeout(showNotice.timeout);
        showNotice.timeout = window.setTimeout(() => {
            notice.hidden = true;
        }, 3200);
    }

    function requestId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }
        return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    async function post(url, payload) {
        const response = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken,
            },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "The garage action failed.");
        return result;
    }

    async function refreshBalance() {
        const response = await fetch(garage.dataset.profileUrl, { credentials: "same-origin" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Player data could not be refreshed.");
        balance.textContent = String(result.balance);
    }

    function busy(button, value) {
        button.disabled = value;
        button.setAttribute("aria-busy", String(value));
    }

    document.querySelectorAll("[data-buy]").forEach((button) => {
        button.addEventListener("click", async () => {
            const slug = button.dataset.buy;
            const card = button.closest("[data-vehicle-card]");
            const price = card.querySelector(".vehicle-title > strong").textContent;
            if (!window.confirm(`Purchase ${card.querySelector("h3").textContent} for ${price}?`)) return;
            busy(button, true);
            try {
                const result = await post(garage.dataset.buyUrl, {
                    vehicle: slug,
                    request_id: requestId(),
                });
                balance.textContent = String(result.balance);
                showNotice("Vehicle purchased and saved to your garage.");
                window.setTimeout(() => window.location.reload(), 900);
            } catch (error) {
                showNotice(error.message, true);
                busy(button, false);
            }
        });
    });

    document.querySelectorAll("[data-select]").forEach((button) => {
        button.addEventListener("click", async () => {
            busy(button, true);
            try {
                await post(garage.dataset.selectUrl, { vehicle: button.dataset.select });
                showNotice("Selected car saved. Applying vehicle specifications…");
                window.setTimeout(() => window.location.reload(), 700);
            } catch (error) {
                showNotice(error.message, true);
                busy(button, false);
            }
        });
    });

    document.querySelectorAll("[data-upgrade]").forEach((button) => {
        button.addEventListener("click", async () => {
            const card = button.closest(".upgrade-card");
            const upgradeName = card.querySelector("h3").textContent;
            if (!window.confirm(`Install ${upgradeName} for ${card.querySelector(".upgrade-meta > strong").textContent}?`)) return;
            busy(button, true);
            try {
                const result = await post(garage.dataset.upgradeUrl, {
                    vehicle: button.dataset.vehicle,
                    upgrade: button.dataset.upgrade,
                    request_id: requestId(),
                });
                balance.textContent = String(result.balance);
                showNotice(`${upgradeName} installed. Updated vehicle specs saved.`);
                window.setTimeout(() => window.location.reload(), 900);
            } catch (error) {
                showNotice(error.message, true);
                busy(button, false);
            }
        });
    });

    rewardButton.addEventListener("click", async () => {
        busy(rewardButton, true);
        try {
            const result = await post(garage.dataset.rewardUrl, {});
            balance.textContent = String(result.balance);
            status.textContent = result.claimed ? `Daily reward claimed: +${result.reward} credits.` : "Today's reward was already claimed.";
            showNotice(status.textContent);
        } catch (error) {
            showNotice(error.message, true);
        } finally {
            busy(rewardButton, false);
        }
    });

    refreshBalance().catch((error) => {
        showNotice(error.message, true);
    });
})();
