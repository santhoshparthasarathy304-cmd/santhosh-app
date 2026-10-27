(() => {
    "use strict";

    const board = document.getElementById("game-board");
    if (!board) return;

    const scoreUrl = board.closest(".game-shell").dataset.scoreUrl;
    const canvas = document.getElementById("race-canvas");
    const ctx = canvas.getContext("2d");
    const configElement = document.getElementById("game-config");
    const gameConfig = configElement ? JSON.parse(configElement.textContent || "{}") : {};
    const carSpecs = gameConfig.specs || {};
    const playerPaint = /^#[0-9a-f]{6}$/i.test(carSpecs.paint || "")
        ? carSpecs.paint
        : "#51f2dc";
    const maxSpeed = Number(carSpecs.top_speed) || 260;
    const accelerationRate = 2.7 * ((Number(carSpecs.acceleration) || 6) / 6);
    const grip = Math.max(0.5, Number(carSpecs.grip) || 1);
    const brakeStrength = Math.max(0.5, Number(carSpecs.braking) || 1);
    const lightsLevel = Math.max(0, Number(carSpecs.lights_level) || 0);
    const loadingScreen = document.getElementById("loading-screen");
    const loadingProgress = document.getElementById("loading-progress");
    const loadingMessage = document.getElementById("loading-message");
    const laneCenters = [144, 240, 336];
    const road = { left: 82, right: 398, top: 0, bottom: canvas.height };
    const player = { lane: 1, x: laneCenters[1], y: 604, width: 48, height: 88, angle: 0 };
    const trafficColors = ["#ff795f", "#a99aff", "#ffc857", "#54a8ff", "#e6eef3"];
    const state = {
        mode: "ready",
        distance: 0,
        coins: 0,
        score: 0,
        speed: 110,
        elapsed: 0,
        roadOffset: 0,
        hazardTimer: 5,
        skidTimer: 0,
        skidVelocity: 0,
        shake: 0,
        warningTimer: 0,
        spawnTimer: 0,
        coinTimer: 0,
        lastTime: 0,
        obstacles: [],
        pickups: [],
        playerName: "Racer",
        best: readBest(),
        soundEnabled: true,
        audioContext: null,
        submitted: false,
        hazards: [],
        braking: false,
    };

    const startOverlay = document.getElementById("start-overlay");
    const pauseOverlay = document.getElementById("pause-overlay");
    const gameoverOverlay = document.getElementById("gameover-overlay");
    const nameInput = document.getElementById("player-name");
    const saveStatus = document.getElementById("save-status");
    const scoreDisplay = document.getElementById("score-display");
    const distanceDisplay = document.getElementById("distance-display");
    const coinsDisplay = document.getElementById("coins-display");
    const speedDisplay = document.getElementById("speed-display");
    const bestDisplay = document.getElementById("best-display");
    const roadWarning = document.getElementById("road-warning");

    function setLoading(percent, message) {
        if (loadingProgress) {
            loadingProgress.style.width = `${percent}%`;
            loadingProgress.setAttribute("aria-valuenow", String(percent));
        }
        if (loadingMessage) loadingMessage.textContent = message;
        loadingScreen?.classList.remove("is-loading");
    }

    function pulse(element) {
        element.classList.remove("is-updated");
        void element.offsetWidth;
        element.classList.add("is-updated");
        window.setTimeout(() => element.classList.remove("is-updated"), 340);
    }

    function readBest() {
        try {
            return Number(window.localStorage.getItem("neonRushBest") || 0);
        } catch (error) {
            console.warn("Could not read the local high score.", error);
            return 0;
        }
    }

    function saveBest(score) {
        try {
            window.localStorage.setItem("neonRushBest", String(score));
        } catch (error) {
            console.warn("Could not save the local high score.", error);
        }
    }

    function show(element) {
        element.classList.remove("is-hidden");
    }

    function hide(element) {
        element.classList.add("is-hidden");
    }

    function formatScore(value) {
        return String(Math.max(0, Math.floor(value))).padStart(6, "0");
    }

    function updateHud() {
        const previousScore = state.score;
        state.score = Math.floor(state.distance / 10) + state.coins * 100;
        scoreDisplay.textContent = formatScore(state.score);
        distanceDisplay.textContent = String(Math.floor(state.distance));
        coinsDisplay.textContent = String(state.coins).padStart(2, "0");
        speedDisplay.textContent = String(Math.floor(state.speed));
        bestDisplay.textContent = formatScore(state.best);
        if (state.mode === "running" && state.score > previousScore) {
            pulse(document.querySelector(".hud-score"));
        }
    }

    function startGame() {
        const enteredName = nameInput.value.trim();
        if (!enteredName) {
            nameInput.focus();
            nameInput.setCustomValidity("Enter a driver name to start.");
            nameInput.reportValidity();
            return;
        }
        nameInput.setCustomValidity("");
        state.playerName = enteredName.slice(0, 20);
        state.mode = "running";
        state.distance = 0;
        state.coins = 0;
        state.score = 0;
        state.speed = 110;
        state.braking = false;
        state.elapsed = 0;
        state.roadOffset = 0;
        state.hazardTimer = 4;
        state.skidTimer = 0;
        state.skidVelocity = 0;
        state.shake = 0;
        state.warningTimer = 0;
        state.spawnTimer = 0;
        state.coinTimer = 0;
        state.obstacles = [];
        state.pickups = [];
        state.hazards = [];
        state.submitted = false;
        player.lane = 1;
        player.x = laneCenters[1];
        player.angle = 0;
        hide(startOverlay);
        hide(pauseOverlay);
        hide(gameoverOverlay);
        updateHud();
        state.lastTime = performance.now();
        hideRoadWarning();
        playTone(420, 0.07, "sine");
    }

    function pauseGame() {
        if (state.mode !== "running") return;
        state.mode = "paused";
        show(pauseOverlay);
    }

    function resumeGame() {
        if (state.mode !== "paused") return;
        state.mode = "running";
        hide(pauseOverlay);
        state.lastTime = performance.now();
    }

    function setLane(direction) {
        if (state.mode !== "running") return;
        player.lane = Math.max(0, Math.min(laneCenters.length - 1, player.lane + direction));
    }

    function playTone(frequency, duration, type) {
        if (!state.soundEnabled) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            if (!state.audioContext) state.audioContext = new AudioContextClass();
            if (state.audioContext.state === "suspended") state.audioContext.resume();
            const oscillator = state.audioContext.createOscillator();
            const gain = state.audioContext.createGain();
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, state.audioContext.currentTime);
            gain.gain.setValueAtTime(0.075, state.audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, state.audioContext.currentTime + duration);
            oscillator.connect(gain);
            gain.connect(state.audioContext.destination);
            oscillator.start();
            oscillator.stop(state.audioContext.currentTime + duration);
        } catch (error) {
            console.warn("Audio could not be played.", error);
        }
    }

    function addTraffic() {
        const availableLanes = laneCenters.map((_, lane) => lane)
            .filter((lane) => !state.obstacles.some((car) => car.lane === lane && car.y < 210));
        if (!availableLanes.length) return;
        const lane = availableLanes[Math.floor(Math.random() * availableLanes.length)];
        state.obstacles.push({
            lane,
            x: laneCenters[lane],
            y: -105,
            width: 48,
            height: 82,
            color: trafficColors[Math.floor(Math.random() * trafficColors.length)],
            multiplier: 0.78 + Math.random() * 0.42,
        });
    }

    function addCoin() {
        const lane = Math.floor(Math.random() * laneCenters.length);
        state.pickups.push({ lane, x: laneCenters[lane], y: -30, radius: 13, spin: 0 });
    }

    function addOilSlick() {
        const lane = Math.floor(Math.random() * laneCenters.length);
        state.hazards.push({ lane, x: laneCenters[lane], y: -40, radiusX: 24, radiusY: 17, hit: false });
    }

    function showRoadWarning(message) {
        roadWarning.textContent = message;
        roadWarning.classList.remove("is-hidden");
    }

    function hideRoadWarning() {
        roadWarning.classList.add("is-hidden");
    }

    function overlaps(a, b, inset = 7) {
        return a.x - a.width / 2 + inset < b.x + b.width / 2 - inset
            && a.x + a.width / 2 - inset > b.x - b.width / 2 + inset
            && a.y - a.height / 2 + inset < b.y + b.height / 2 - inset
            && a.y + a.height / 2 - inset > b.y - b.height / 2 + inset;
    }

    function crash() {
        if (state.mode !== "running") return;
        state.mode = "over";
        playTone(100, 0.28, "sawtooth");
        const flash = document.getElementById("crash-flash");
        flash.classList.remove("is-active");
        void flash.offsetWidth;
        flash.classList.add("is-active");
        document.getElementById("final-score").textContent = formatScore(state.score);
        document.getElementById("final-distance").textContent = String(Math.floor(state.distance));
        document.getElementById("final-coins").textContent = String(state.coins);
        document.getElementById("result-kicker").textContent = state.score > state.best ? "NEW PERSONAL BEST" : "RUN COMPLETE";
        if (state.score > state.best) {
            state.best = state.score;
            saveBest(state.best);
        }
        updateHud();
        show(gameoverOverlay);
        saveRun();
    }

    async function saveRun() {
        if (state.submitted) return;
        state.submitted = true;
        saveStatus.classList.remove("is-error");
        saveStatus.textContent = "Saving your run…";
        const csrfToken = document.querySelector("[name=csrfmiddlewaretoken]").value;
        const body = new URLSearchParams({
            player_name: state.playerName,
            distance: String(Math.floor(state.distance)),
            coins: String(state.coins),
        });
        try {
            const response = await fetch(scoreUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "X-CSRFToken": csrfToken,
                },
                body,
                mode: "same-origin",
                credentials: "same-origin",
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
                throw new Error(result.error || "The score could not be saved.");
            }
            saveStatus.textContent = "Run saved to the leaderboard.";
        } catch (error) {
            console.error("Could not save the game score.", error);
            saveStatus.textContent = "Could not save this run. Check your connection and try another race.";
            saveStatus.classList.add("is-error");
        }
    }

    function update(dt) {
        if (state.mode !== "running") return;
        state.elapsed += dt;
        const cruisingSpeed = Math.min(maxSpeed, 110 + state.elapsed * accelerationRate);
        if (state.braking) {
            state.speed = Math.max(0, state.speed - 150 * brakeStrength * dt);
        } else {
            state.speed = Math.min(cruisingSpeed, state.speed + 60 * (accelerationRate / 2.7) * dt);
        }
        const roadSpeed = state.speed * 2.1;
        state.distance += (state.speed / 3.6) * dt;
        state.roadOffset = (state.roadOffset + roadSpeed * dt) % 64;
        state.skidTimer = Math.max(0, state.skidTimer - dt);
        state.warningTimer = Math.max(0, state.warningTimer - dt);
        state.shake = Math.max(0, state.shake - dt);
        if (state.skidTimer === 0 && state.warningTimer === 0 && state.hazards.every((hazard) => hazard.y > player.y - 190)) {
            hideRoadWarning();
        }
        const targetX = laneCenters[player.lane];
        const steeringGrip = state.skidTimer > 0 ? 4 * grip : 13 * grip;
        player.x += (targetX - player.x) * Math.min(1, dt * steeringGrip);
        player.x += state.skidVelocity * dt;
        state.skidVelocity *= Math.exp(-dt * (state.skidTimer > 0 ? 1.1 : 7));
        player.x = Math.max(road.left + player.width / 2 + 5, Math.min(road.right - player.width / 2 - 5, player.x));
        const laneDifference = targetX - player.x;
        const turnAngle = Math.abs(laneDifference) < 2 ? 0 : Math.sign(laneDifference) * 0.1;
        const skidAngle = Math.max(-0.23, Math.min(0.23, state.skidVelocity / 650));
        player.angle += (turnAngle + skidAngle - player.angle) * Math.min(1, dt * (state.skidTimer > 0 ? 3 : 8));

        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
            addTraffic();
            if (state.elapsed > 12 && Math.random() < Math.min(0.55, (state.elapsed - 12) * 0.025)) {
                addTraffic();
            }
            state.spawnTimer = Math.max(0.43, 1.18 - state.elapsed * 0.016) * (0.82 + Math.random() * 0.38);
        }
        state.coinTimer -= dt;
        if (state.coinTimer <= 0) {
            addCoin();
            state.coinTimer = 1.4 + Math.random() * 1.4;
        }

        state.hazardTimer -= dt;
        if (state.hazardTimer <= 0) {
            addOilSlick();
            state.hazardTimer = Math.max(3.4, 7 - state.elapsed * 0.035) + Math.random() * 2;
        }

        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        for (const car of state.obstacles) {
            car.y += roadSpeed * car.multiplier * dt;
            if (overlaps(playerRect, car)) {
                crash();
                return;
            }
        }
        state.obstacles = state.obstacles.filter((car) => car.y < canvas.height + 100);

        for (const hazard of state.hazards) {
            hazard.y += roadSpeed * dt;
            if (!hazard.hit && Math.abs(hazard.y - player.y) < player.height / 2 + hazard.radiusY
                && Math.abs(hazard.x - player.x) < player.width / 2 + hazard.radiusX) {
                hazard.hit = true;
                state.skidTimer = 0.85;
                state.skidVelocity = (Math.random() < 0.5 ? -1 : 1) * (155 + state.speed * 0.32);
                state.shake = 0.42;
                state.warningTimer = 1.4;
                showRoadWarning("GRIP LOST — STEER AGAINST THE SLIDE");
                playTone(145, 0.13, "sawtooth");
            }
        }
        state.hazards = state.hazards.filter((hazard) => hazard.y < canvas.height + 50);
        if (state.skidTimer > 0) {
            showRoadWarning("GRIP LOST — STEER AGAINST THE SLIDE");
        } else if (state.warningTimer > 0) {
            showRoadWarning("OIL SLICK — CHANGE LANES");
        } else if (state.hazards.some((hazard) => hazard.y > 75 && hazard.y < player.y - 135)) {
            showRoadWarning("OIL SLICK AHEAD — CHANGE LANES");
        }

        for (const coin of state.pickups) {
            coin.y += roadSpeed * dt;
            coin.spin += dt * 7;
            const coinRect = { x: coin.x, y: coin.y, width: 30, height: 30 };
            if (!coin.collected && overlaps(playerRect, coinRect, 3)) {
                coin.collected = true;
                state.coins += 1;
                pulse(document.querySelector(".hud-coins"));
                playTone(740, 0.09, "triangle");
            }
        }
        state.pickups = state.pickups.filter((coin) => !coin.collected && coin.y < canvas.height + 40);
        updateHud();
    }

    function roundedRect(x, y, width, height, radius) {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radius);
    }

    function drawRoad() {
        const gradient = ctx.createLinearGradient(road.left, 0, road.right, 0);
        gradient.addColorStop(0, "#202930");
        gradient.addColorStop(0.5, "#252e35");
        gradient.addColorStop(1, "#202930");
        ctx.fillStyle = "#11191d";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = gradient;
        ctx.fillRect(road.left, road.top, road.right - road.left, road.bottom);
        ctx.fillStyle = "#77e8d6";
        ctx.globalAlpha = 0.55;
        ctx.fillRect(road.left + 2, 0, 2, canvas.height);
        ctx.fillRect(road.right - 4, 0, 2, canvas.height);
        ctx.globalAlpha = 1;

        const laneWidth = (road.right - road.left) / 3;
        ctx.strokeStyle = "rgba(214, 232, 235, .55)";
        ctx.lineWidth = 3;
        ctx.setLineDash([28, 36]);
        ctx.lineDashOffset = -state.roadOffset;
        for (let lane = 1; lane < 3; lane += 1) {
            const x = road.left + laneWidth * lane;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        const shoulderOffset = state.roadOffset % 42;
        for (let y = -42 + shoulderOffset; y < canvas.height; y += 42) {
            ctx.fillStyle = "rgba(255, 114, 89, .7)";
            ctx.fillRect(road.left - 7, y, 4, 18);
            ctx.fillRect(road.right + 3, y, 4, 18);
        }

        const shade = ctx.createLinearGradient(0, 65, 0, canvas.height);
        shade.addColorStop(0, "rgba(6, 10, 14, .68)");
        shade.addColorStop(0.2, "rgba(6, 10, 14, 0)");
        shade.addColorStop(1, "rgba(6, 10, 14, .15)");
        ctx.fillStyle = shade;
        ctx.fillRect(road.left, 0, road.right - road.left, canvas.height);
    }

    function drawCar(car, isPlayer = false) {
        ctx.save();
        ctx.translate(car.x, car.y);
        if (isPlayer) ctx.rotate(player.angle);
        const x = -car.width / 2;
        const y = -car.height / 2;
        if (isPlayer) {
            ctx.shadowColor = "#43ffe2";
            ctx.shadowBlur = 19;
        }
        roundedRect(x - 4, y + 16, 7, 19, 3);
        ctx.fillStyle = "#11161c";
        ctx.fill();
        roundedRect(x + car.width - 3, y + 16, 7, 19, 3);
        ctx.fill();
        roundedRect(x - 4, y + car.height - 35, 7, 19, 3);
        ctx.fill();
        roundedRect(x + car.width - 3, y + car.height - 35, 7, 19, 3);
        ctx.fill();

        const body = ctx.createLinearGradient(x, 0, x + car.width, 0);
        body.addColorStop(0, isPlayer ? shadeColor(playerPaint, -36) : shadeColor(car.color, -36));
        body.addColorStop(0.5, isPlayer ? playerPaint : car.color);
        body.addColorStop(1, isPlayer ? shadeColor(playerPaint, -45) : shadeColor(car.color, -45));
        roundedRect(x, y, car.width, car.height, 12);
        ctx.fillStyle = body;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = isPlayer ? "rgba(183, 255, 246, .76)" : "rgba(255, 255, 255, .25)";
        ctx.stroke();

        roundedRect(x + 8, y + 17, car.width - 16, 23, 7);
        ctx.fillStyle = isPlayer ? "#203b43" : "#273744";
        ctx.fill();
        ctx.fillStyle = "rgba(175, 233, 238, .22)";
        ctx.fillRect(x + 11, y + 20, 2, 16);
        ctx.fillRect(x + car.width - 13, y + 20, 2, 16);
        roundedRect(x + 8, y + car.height - 28, car.width - 16, 10, 4);
        ctx.fillStyle = "#202b31";
        ctx.fill();
        ctx.fillStyle = isPlayer ? "#ff8172" : "#ff594f";
        ctx.shadowColor = isPlayer ? "#ff756c" : "transparent";
        ctx.shadowBlur = isPlayer ? 9 : 0;
        roundedRect(x + 6, y + car.height - 11, 11, 4, 2);
        ctx.fill();
        roundedRect(x + car.width - 17, y + car.height - 11, 11, 4, 2);
        ctx.fill();
        roundedRect(x + 7, y + 5, 11, 5, 2);
        roundedRect(x + car.width - 18, y + 5, 11, 5, 2);
        ctx.fillStyle = "#fff2c4";
        ctx.shadowColor = isPlayer && lightsLevel ? "#ffe8a6" : "transparent";
        ctx.shadowBlur = isPlayer ? 5 + lightsLevel * 5 : 0;
        ctx.fill();
        ctx.restore();
    }

    function shadeColor(hex, amount) {
        const value = hex.replace("#", "");
        const number = parseInt(value.length === 3 ? value.split("").map((c) => c + c).join("") : value, 16);
        const red = Math.max(0, Math.min(255, (number >> 16) + amount));
        const green = Math.max(0, Math.min(255, ((number >> 8) & 255) + amount));
        const blue = Math.max(0, Math.min(255, (number & 255) + amount));
        return `rgb(${red}, ${green}, ${blue})`;
    }

    function drawCoin(coin) {
        ctx.save();
        ctx.translate(coin.x, coin.y);
        const width = 9 + Math.abs(Math.cos(coin.spin)) * 5;
        ctx.shadowColor = "#ffd66e";
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.ellipse(0, 0, width, coin.radius, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#ffd76d";
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#fff4ba";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#a96526";
        ctx.font = "bold 14px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("+", 0, 1);
        ctx.restore();
    }

    function draw() {
        drawRoad();
        ctx.save();
        if (state.shake > 0) {
            const intensity = state.shake * 13;
            ctx.translate((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
        }
        for (const hazard of state.hazards) drawOilSlick(hazard);
        for (const coin of state.pickups) drawCoin(coin);
        for (const car of state.obstacles) drawCar(car);
        drawCar(player, true);
        ctx.restore();
    }

    function drawOilSlick(hazard) {
        ctx.save();
        ctx.translate(hazard.x, hazard.y);
        ctx.rotate(-0.16);
        ctx.shadowColor = "rgba(255, 174, 75, .45)";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.ellipse(0, 0, hazard.radiusX, hazard.radiusY, 0, 0, Math.PI * 2);
        const oil = ctx.createRadialGradient(-5, -5, 2, 0, 0, hazard.radiusX);
        oil.addColorStop(0, "rgba(157, 111, 181, .85)");
        oil.addColorStop(0.48, "rgba(52, 59, 79, .94)");
        oil.addColorStop(1, "rgba(12, 17, 24, .98)");
        ctx.fillStyle = oil;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 191, 104, .68)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(-7, -4, 7, 3, -0.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(226, 178, 239, .62)";
        ctx.fill();
        ctx.restore();
    }

    function frame(time) {
        const dt = Math.min((time - state.lastTime) / 1000 || 0, 0.05);
        state.lastTime = time;
        update(dt);
        draw();
        window.requestAnimationFrame(frame);
    }

    document.getElementById("start-button").addEventListener("click", startGame);
    document.getElementById("resume-button").addEventListener("click", resumeGame);
    document.getElementById("restart-button").addEventListener("click", startGame);
    document.getElementById("mobile-pause").addEventListener("click", () => {
        if (state.mode === "running") pauseGame();
        else if (state.mode === "paused") resumeGame();
    });
    document.querySelectorAll("[data-steer]").forEach((button) => {
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            setLane(Number(button.dataset.steer));
        });
        document.querySelectorAll("[data-brake]").forEach((button) => {
            const setBraking = (braking) => {
                state.braking = braking;
                button.classList.toggle("is-active", braking);
            };
            button.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                setBraking(true);
                button.setPointerCapture(event.pointerId);
            });
            button.addEventListener("pointerup", () => setBraking(false));
            button.addEventListener("pointercancel", () => setBraking(false));
            button.addEventListener("lostpointercapture", () => setBraking(false));
        });
    });
    document.getElementById("sound-toggle").addEventListener("click", (event) => {
        state.soundEnabled = !state.soundEnabled;
        event.currentTarget.classList.toggle("is-muted", !state.soundEnabled);
        event.currentTarget.setAttribute("aria-label", state.soundEnabled ? "Mute sound" : "Enable sound");
    });
    nameInput.addEventListener("input", () => nameInput.setCustomValidity(""));
    nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && state.mode === "ready") startGame();
    });
    document.addEventListener("keydown", (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowDown" || event.key.toLowerCase() === "s" || event.code === "Space") {
            event.preventDefault();
            state.braking = true;
        } else if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
            event.preventDefault();
            setLane(-1);
        } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
            event.preventDefault();
            setLane(1);
        } else if (event.key.toLowerCase() === "p" || event.key === "Escape") {
            if (state.mode === "running") pauseGame();
            else if (state.mode === "paused") resumeGame();
        } else if (event.key === "Enter" && state.mode === "paused") {
            resumeGame();
        }
    });
    document.addEventListener("keyup", (event) => {
        if (event.key === "ArrowDown" || event.key.toLowerCase() === "s" || event.code === "Space") {
            state.braking = false;
        }
    });

    updateHud();
    setLoading(66, "Warming up the engine…");
    window.requestAnimationFrame((time) => {
        state.lastTime = time;
        frame(time);
        setLoading(100, "Road ready");
        if (loadingScreen) {
            window.setTimeout(() => loadingScreen.classList.add("is-ready"), 180);
        }
    });
})();
