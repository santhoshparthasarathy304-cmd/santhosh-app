(() => {
    "use strict";

    const dock = document.querySelector(".assistant-dock");
    if (!dock) return;

    const launch = dock.querySelector(".assistant-launch");
    const panel = dock.querySelector(".assistant-panel");
    const close = dock.querySelector(".assistant-close");
    const form = dock.querySelector(".assistant-form");
    const input = form.elements.question;
    const messages = dock.querySelector(".assistant-messages");
    const error = dock.querySelector(".assistant-error");
    const csrfToken = form.elements.csrfmiddlewaretoken.value;

    function setOpen(open) {
        panel.hidden = !open;
        launch.setAttribute("aria-expanded", String(open));
        if (open) input.focus();
    }

    function addBubble(text, type) {
        const bubble = document.createElement("p");
        bubble.className = `assistant-bubble assistant-bubble-${type}`;
        bubble.textContent = text;
        messages.appendChild(bubble);
        messages.scrollTop = messages.scrollHeight;
        return bubble;
    }

    function showError(text) {
        error.hidden = false;
        error.textContent = text;
    }

    async function sendFeedback(messageId, wasHelpful, button) {
        button.disabled = true;
        try {
            const response = await fetch(dock.dataset.feedbackUrl, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken,
                },
                body: JSON.stringify({ message_id: messageId, was_helpful: wasHelpful }),
            });
            const result = await response.json();
            if (!response.ok || !result.ok) throw new Error(result.error || "Feedback could not be saved.");
            button.closest(".assistant-feedback").textContent = "Thanks for the feedback.";
        } catch (feedbackError) {
            button.disabled = false;
            showError(feedbackError.message);
        }
    }

    function addFeedback(messageId) {
        const controls = document.createElement("div");
        controls.className = "assistant-feedback";
        for (const [label, helpful] of [["Helpful", true], ["Not helpful", false]]) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.addEventListener("click", () => sendFeedback(messageId, helpful, button));
            controls.appendChild(button);
        }
        messages.appendChild(controls);
        messages.scrollTop = messages.scrollHeight;
    }

    launch.addEventListener("click", () => setOpen(panel.hidden));
    close.addEventListener("click", () => setOpen(false));
    document.querySelectorAll("[data-open-assistant]").forEach((button) => {
        button.addEventListener("click", () => setOpen(true));
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const question = input.value.trim();
        if (!question) return;
        error.hidden = true;
        addBubble(question, "user");
        input.value = "";
        input.disabled = true;
        const waiting = addBubble("Checking the game guide…", "bot");
        const sendButton = form.querySelector("button[type=submit]");
        sendButton.disabled = true;
        try {
            const response = await fetch(dock.dataset.chatUrl, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken,
                },
                body: JSON.stringify({ question }),
            });
            const result = await response.json();
            if (!response.ok || !result.ok) throw new Error(result.error || "The assistant is unavailable. Try again shortly.");
            waiting.textContent = result.answer;
            if (result.ticket_id) waiting.dataset.ticketId = String(result.ticket_id);
            addFeedback(result.message_id);
        } catch (requestError) {
            waiting.textContent = "I couldn’t reach support right now.";
            showError(requestError.message);
        } finally {
            input.disabled = false;
            sendButton.disabled = false;
            input.focus();
            messages.scrollTop = messages.scrollHeight;
        }
    });
})();
