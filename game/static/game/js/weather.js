(() => {
    "use strict";

    const button = document.getElementById("weather-request");
    const status = document.getElementById("weather-status");
    if (!button || !status) return;

    button.addEventListener("click", () => {
        if (!navigator.geolocation) {
            status.textContent = "Location sharing is not available in this browser.";
            return;
        }
        button.disabled = true;
        status.textContent = "Requesting your permission for approximate location…";
        navigator.geolocation.getCurrentPosition(async (position) => {
            status.textContent = "Checking the weather…";
            try {
                const url = new URL(button.dataset.weatherUrl, window.location.origin);
                url.searchParams.set("lat", String(position.coords.latitude));
                url.searchParams.set("lon", String(position.coords.longitude));
                const response = await fetch(url, { credentials: "same-origin" });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || "Weather could not be loaded.");
                status.textContent = result.available
                    ? `Local temperature: ${result.temperature_c} °C · weather code ${result.weather_code}.`
                    : result.message;
            } catch (error) {
                status.textContent = "Weather unavailable right now. The game is still ready to play.";
            } finally {
                button.disabled = false;
            }
        }, (error) => {
            status.textContent = error.code === error.PERMISSION_DENIED
                ? "Location was not shared. The game does not need location to play."
                : "Could not read location. You can play without weather.";
            button.disabled = false;
        }, { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 });
    });
})();
