export function createVehicle(THREE, paint, lightsLevel = 0) {
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: paint,
        metalness: 0.58,
        roughness: 0.3,
    });
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x263e4a,
        metalness: 0.32,
        roughness: 0.2,
    });
    const wheelMaterial = new THREE.MeshStandardMaterial({
        color: 0x101419,
        roughness: 0.85,
    });
    const vehicle = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 3.65), bodyMaterial);
    body.position.y = 0.66;
    vehicle.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.37, 0.55, 1.65), glassMaterial);
    cabin.position.set(0, 1.13, -0.13);
    vehicle.add(cabin);

    const bonnet = new THREE.Mesh(
        new THREE.BoxGeometry(1.46, 0.14, 0.72),
        new THREE.MeshStandardMaterial({ color: paint, metalness: 0.55, roughness: 0.3 }),
    );
    bonnet.position.set(0, 0.97, -1.28);
    vehicle.add(bonnet);

    const wheels = [];
    for (const x of [-0.91, 0.91]) {
        for (const z of [-1.18, 1.18]) {
            const wheel = new THREE.Mesh(
                new THREE.CylinderGeometry(0.35, 0.35, 0.24, 14),
                wheelMaterial,
            );
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(x, 0.36, z);
            vehicle.add(wheel);
            wheels.push(wheel);
        }
    }

    const headlightMaterial = new THREE.MeshStandardMaterial({
        color: 0xfff0c1,
        emissive: 0xffd36b,
        emissiveIntensity: 0.7 + lightsLevel * 0.55,
    });
    const headlights = [];
    for (const x of [-0.55, 0.55]) {
        const lamp = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.12, 0.07),
            headlightMaterial,
        );
        lamp.position.set(x, 0.75, -1.85);
        vehicle.add(lamp);
        const light = new THREE.PointLight(0xffe6aa, 1.3 + lightsLevel * 0.9, 24 + lightsLevel * 12);
        light.position.set(x, 0.84, -2.05);
        vehicle.add(light);
        headlights.push(light);
    }
    const taillightMaterial = new THREE.MeshStandardMaterial({
        color: 0xff4b43,
        emissive: 0xff251d,
        emissiveIntensity: 0.7,
    });
    for (const x of [-0.55, 0.55]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.07), taillightMaterial);
        lamp.position.set(x, 0.75, 1.86);
        vehicle.add(lamp);
    }

    vehicle.traverse((part) => {
        if (part.isMesh) part.castShadow = false;
    });
    return { group: vehicle, wheels, headlights, bodyMaterial };
}

export async function start3DGame(THREE) {
    const board = document.getElementById("game-board");
    const canvas = document.getElementById("drive-canvas");
    if (!board || !canvas) throw new Error("The driving scene canvas is missing.");

    const config = JSON.parse(document.getElementById("game-config")?.textContent || "{}");
    const specs = config.specs || {};
    const paint = /^#[0-9a-f]{6}$/i.test(specs.paint || "") ? specs.paint : "#51f2dc";
    const topSpeed = Number(specs.top_speed) || 150;
    const acceleration = Math.max(4, Number(specs.acceleration) || 6);
    const grip = Math.max(0.6, Number(specs.grip) || 1);
    const braking = Math.max(0.6, Number(specs.braking) || 1);
    const lightsLevel = Math.max(0, Number(specs.lights_level) || 0);

    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: window.devicePixelRatio < 2,
        powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x071019);
    scene.fog = new THREE.Fog(0x071019, 48, 180);
    const camera = new THREE.PerspectiveCamera(61, 480 / 720, 0.1, 250);
    const hemisphere = new THREE.HemisphereLight(0x8bcbd9, 0x18202b, 1.35);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xc9f0ff, 2.2);
    sun.position.set(-15, 25, -10);
    scene.add(sun);

    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x282e33,
        roughness: 0.96,
        metalness: 0.02,
    });
    const laneMaterial = new THREE.MeshStandardMaterial({
        color: 0xe7eee9,
        emissive: 0x30443f,
        emissiveIntensity: 0.28,
    });
    const shoulderMaterial = new THREE.MeshStandardMaterial({
        color: 0x151d22,
        roughness: 1,
    });
    const roadChunks = [];
    for (let chunkIndex = 0; chunkIndex < 3; chunkIndex += 1) {
        const chunk = new THREE.Group();
        const road = new THREE.Mesh(
            new THREE.PlaneGeometry(14, 110),
            roadMaterial,
        );
        road.rotation.x = -Math.PI / 2;
        road.position.y = -0.04;
        chunk.add(road);
        for (const edge of [-7.08, 7.08]) {
            const line = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.03, 110),
                laneMaterial,
            );
            line.position.set(edge, 0.015, 0);
            chunk.add(line);
        }
        for (const x of [-2.32, 2.32]) {
            for (let index = 0; index < 11; index += 1) {
                const dash = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, 0.025, 4.2),
                    laneMaterial,
                );
                dash.position.set(x, 0.02, -50 + index * 10);
                chunk.add(dash);
            }
        }
        chunk.position.z = -110 + chunkIndex * 110;
        scene.add(chunk);
        roadChunks.push(chunk);
    }

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(240, 430),
        new THREE.MeshStandardMaterial({ color: 0x101b20, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.09, -45);
    scene.add(ground);

    const scenery = [];
    const buildingMaterials = [0x18232e, 0x202c34, 0x222836, 0x182a31].map(
        (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.88 }),
    );
    const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0x426c78,
        emissive: 0x204754,
        emissiveIntensity: 0.6,
        roughness: 0.4,
    });
    for (const side of [-1, 1]) {
        for (let index = 0; index < 10; index += 1) {
            const width = 4 + Math.random() * 5;
            const height = 8 + Math.random() * 26;
            const depth = 7 + Math.random() * 7;
            const building = new THREE.Group();
            const structure = new THREE.Mesh(
                new THREE.BoxGeometry(width, height, depth),
                buildingMaterials[index % buildingMaterials.length],
            );
            structure.position.y = height / 2 - 0.1;
            building.add(structure);
            const windowRows = Math.max(1, Math.floor(height / 5));
            for (let row = 0; row < windowRows; row += 1) {
                const windowPane = new THREE.Mesh(
                    new THREE.BoxGeometry(width * 0.055, 0.65, 0.06),
                    windowMaterial,
                );
                windowPane.position.set(-width * 0.2 + (row % 3) * width * 0.2, 1.8 + row * 3.2, depth / 2 + 0.04);
                building.add(windowPane);
            }
            building.position.set(side * (10 + width / 2 + Math.random() * 8), 0, -120 + index * 23);
            scene.add(building);
            scenery.push(building);
        }
    }

    const streetlights = [];
    for (let index = 0; index < 8; index += 1) {
        const lamp = new THREE.Group();
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.11, 6, 8),
            new THREE.MeshStandardMaterial({ color: 0x697880, metalness: 0.55, roughness: 0.4 }),
        );
        pole.position.y = 3;
        lamp.add(pole);
        const arm = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.09, 0.09),
            pole.material,
        );
        arm.position.set(-0.65, 5.85, 0);
        lamp.add(arm);
        const bulb = new THREE.PointLight(0x85e8e1, 1.5, 20);
        bulb.position.set(-1.25, 5.6, 0);
        lamp.add(bulb);
        lamp.position.set(index % 2 ? 8.6 : -8.6, 0, -100 + index * 26);
        scene.add(lamp);
        streetlights.push(lamp);
    }

    const player = createVehicle(THREE, paint, lightsLevel);
    player.group.position.set(0, 0, 0);
    scene.add(player.group);
    const trafficPool = [];
    const trafficColors = [0xff795f, 0xa799ff, 0xffc857, 0x54a8ff, 0xe6eef3];
    for (let index = 0; index < 6; index += 1) {
        const vehicle = createVehicle(
            THREE,
            trafficColors[index % trafficColors.length],
            0,
        );
        vehicle.group.visible = false;
        scene.add(vehicle.group);
        trafficPool.push({ ...vehicle, active: false, speed: 55, lane: 0 });
    }

    const coinGeometry = new THREE.TorusGeometry(0.55, 0.13, 8, 18);
    const coinMaterial = new THREE.MeshStandardMaterial({
        color: 0xffd56a,
        emissive: 0x6a3711,
        emissiveIntensity: 0.9,
        metalness: 0.74,
        roughness: 0.25,
    });
    const coins = [];
    for (let index = 0; index < 5; index += 1) {
        const coin = new THREE.Mesh(coinGeometry, coinMaterial);
        coin.rotation.x = Math.PI / 2;
        coin.visible = false;
        scene.add(coin);
        coins.push({ mesh: coin, active: false });
    }

    const oilMaterial = new THREE.MeshStandardMaterial({
        color: 0x171628,
        emissive: 0x261b36,
        emissiveIntensity: 0.55,
        roughness: 0.28,
    });
    const oil = new THREE.Mesh(new THREE.CircleGeometry(1.35, 20), oilMaterial);
    oil.rotation.x = -Math.PI / 2;
    oil.position.y = 0.035;
    oil.visible = false;
    scene.add(oil);

    const state = {
        mode: "ready",
        speed: 0,
        x: 0,
        steer: 0,
        distance: 0,
        coins: 0,
        score: 0,
        elapsed: 0,
        trafficTimer: 1.3,
        coinTimer: 3,
        oilTimer: 8,
        skidTimer: 0,
        skid: 0,
        cameraMode: 0,
        night: true,
        submitted: false,
        soundEnabled: true,
        audio: null,
        lastTime: performance.now(),
    };
    const keys = { left: false, right: false, throttle: false, brake: false, handbrake: false };
    const scoreUrl = board.closest(".game-shell").dataset.scoreUrl;
    const csrfToken = document.querySelector(".csrf-source [name=csrfmiddlewaretoken]").value;
    const startOverlay = document.getElementById("start-overlay");
    const pauseOverlay = document.getElementById("pause-overlay");
    const gameoverOverlay = document.getElementById("gameover-overlay");
    const nameInput = document.getElementById("player-name");
    const saveStatus = document.getElementById("save-status");
    const loading = document.getElementById("loading-screen");
    const loadingProgress = document.getElementById("loading-progress");
    const loadingMessage = document.getElementById("loading-message");
    const roadWarning = document.getElementById("road-warning");
    const scoreDisplay = document.getElementById("score-display");
    const distanceDisplay = document.getElementById("distance-display");
    const coinsDisplay = document.getElementById("coins-display");
    const speedDisplay = document.getElementById("speed-display");
    const bestDisplay = document.getElementById("best-display");
    const gearDisplay = document.getElementById("gear-display");
    const readBest = () => {
        try {
            return Number(window.localStorage.getItem("neonRushBest") || 0);
        } catch (error) {
            console.warn("Could not read the local high score.", error);
            return 0;
        }
    };
    let best = readBest();

    const setLoading = (percent, message) => {
        if (loadingProgress) loadingProgress.style.width = `${percent}%`;
        if (loadingProgress) loadingProgress.setAttribute("aria-valuenow", String(percent));
        if (loadingMessage) loadingMessage.textContent = message;
        loading?.classList.remove("is-loading");
    };
    setLoading(35, "Building the road scene…");

    function resize() {
        const width = Math.max(1, board.clientWidth || 480);
        const height = width * 1.5;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }

    function playTone(frequency, duration, type = "sine") {
        if (!state.soundEnabled) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            if (!state.audio) state.audio = new AudioContextClass();
            if (state.audio.state === "suspended") state.audio.resume();
            const oscillator = state.audio.createOscillator();
            const gain = state.audio.createGain();
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, state.audio.currentTime);
            gain.gain.setValueAtTime(0.045, state.audio.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, state.audio.currentTime + duration);
            oscillator.connect(gain);
            gain.connect(state.audio.destination);
            oscillator.start();
            oscillator.stop(state.audio.currentTime + duration);
        } catch (error) {
            console.warn("Driving sound could not be played.", error);
        }
    }

    function setOverlay(element, visible) {
        element.classList.toggle("is-hidden", !visible);
    }

    function updateHud() {
        state.score = Math.floor(state.distance / 10) + state.coins * 100;
        scoreDisplay.textContent = String(state.score).padStart(6, "0");
        distanceDisplay.textContent = String(Math.floor(state.distance));
        coinsDisplay.textContent = String(state.coins).padStart(2, "0");
        speedDisplay.textContent = String(Math.round(Math.abs(state.speed)));
        bestDisplay.textContent = String(best).padStart(6, "0");
        gearDisplay.textContent = state.speed < -2 ? "R" : state.speed > 2 ? "D" : "N";
    }

    function resetWorld() {
        roadChunks.forEach((chunk, index) => {
            chunk.position.z = -110 + index * 110;
        });
        scenery.forEach((item, index) => {
            const side = item.position.x < 0 ? -1 : 1;
            item.position.z = -120 + (index % 10) * 23;
        });
        streetlights.forEach((lamp, index) => {
            lamp.position.z = -100 + index * 26;
        });
        trafficPool.forEach((traffic) => {
            traffic.active = false;
            traffic.group.visible = false;
        });
        coins.forEach((coin) => {
            coin.active = false;
            coin.mesh.visible = false;
        });
        oil.visible = false;
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
        state.mode = "running";
        state.speed = 0;
        state.x = 0;
        state.steer = 0;
        state.distance = 0;
        state.coins = 0;
        state.score = 0;
        state.elapsed = 0;
        state.trafficTimer = 1.5;
        state.coinTimer = 2.6;
        state.oilTimer = 8;
        state.skidTimer = 0;
        state.skid = 0;
        state.submitted = false;
        keys.left = false;
        keys.right = false;
        keys.throttle = false;
        keys.brake = false;
        keys.handbrake = false;
        player.group.position.set(0, 0, 0);
        player.group.rotation.set(0, 0, 0);
        resetWorld();
        setOverlay(startOverlay, false);
        setOverlay(pauseOverlay, false);
        setOverlay(gameoverOverlay, false);
        roadWarning.classList.add("is-hidden");
        updateHud();
        state.lastTime = performance.now();
        playTone(380, 0.08);
    }

    function pauseGame() {
        if (state.mode !== "running") return;
        state.mode = "paused";
        setOverlay(pauseOverlay, true);
        keys.throttle = false;
        keys.brake = false;
    }

    function resumeGame() {
        if (state.mode !== "paused") return;
        state.mode = "running";
        setOverlay(pauseOverlay, false);
        state.lastTime = performance.now();
    }

    function spawnTraffic() {
        const available = trafficPool.find((traffic) => !traffic.active);
        if (!available) return;
        const lanePositions = [-4.5, 0, 4.5].filter((lane) =>
            trafficPool.every(
                (other) => !other.active || Math.abs(other.group.position.x - lane) > 2 || other.group.position.z < -20,
            ),
        );
        if (!lanePositions.length) return;
        const lane = lanePositions[Math.floor(Math.random() * lanePositions.length)];
        available.active = true;
        available.lane = lane;
        available.speed = 48 + Math.random() * 40;
        available.group.position.set(lane, 0, -75 - Math.random() * 18);
        available.group.rotation.set(0, 0, 0);
        available.group.visible = true;
    }

    function spawnCoin() {
        const pickup = coins.find((coin) => !coin.active);
        if (!pickup) return;
        pickup.active = true;
        pickup.mesh.position.set([-4.5, 0, 4.5][Math.floor(Math.random() * 3)], 0.95, -82);
        pickup.mesh.visible = true;
    }

    function spawnOil() {
        if (oil.visible) return;
        oil.position.set([-4.5, 0, 4.5][Math.floor(Math.random() * 3)], 0.035, -95);
        oil.visible = true;
    }

    async function saveRun() {
        if (state.submitted) return;
        state.submitted = true;
        saveStatus.classList.remove("is-error");
        saveStatus.textContent = "Saving your run…";
        const body = new URLSearchParams({
            player_name: nameInput.value.trim().slice(0, 20),
            distance: String(Math.floor(state.distance)),
            coins: String(state.coins),
        });
        try {
            const response = await fetch(scoreUrl, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "X-CSRFToken": csrfToken,
                },
                body,
            });
            const result = await response.json();
            if (!response.ok || !result.ok) throw new Error(result.error || "The score could not be saved.");
            saveStatus.textContent = "Run saved to the leaderboard.";
        } catch (error) {
            console.error("Could not save the game score.", error);
            saveStatus.textContent = "Could not save this run. Check your connection and try another race.";
            saveStatus.classList.add("is-error");
        }
    }

    function finishRun() {
        if (state.mode !== "running") return;
        state.mode = "over";
        keys.throttle = false;
        keys.brake = false;
        playTone(90, 0.3, "sawtooth");
        document.getElementById("final-score").textContent = String(state.score).padStart(6, "0");
        document.getElementById("final-distance").textContent = String(Math.floor(state.distance));
        document.getElementById("final-coins").textContent = String(state.coins);
        document.getElementById("result-kicker").textContent = state.score > best ? "NEW PERSONAL BEST" : "RUN COMPLETE";
        if (state.score > best) {
            best = state.score;
            try {
                window.localStorage.setItem("neonRushBest", String(best));
            } catch (error) {
                console.warn("Could not save the local high score.", error);
            }
        }
        updateHud();
        setOverlay(gameoverOverlay, true);
        saveRun();
    }

    function moveEnvironment(signedDistance) {
        for (const chunk of roadChunks) {
            chunk.position.z += signedDistance;
            if (chunk.position.z > 165) chunk.position.z -= 330;
            if (chunk.position.z < -165) chunk.position.z += 330;
        }
        for (const item of scenery) {
            item.position.z += signedDistance;
            if (item.position.z > 30) item.position.z -= 230;
            if (item.position.z < -200) item.position.z += 230;
        }
        for (const lamp of streetlights) {
            lamp.position.z += signedDistance;
            if (lamp.position.z > 35) lamp.position.z -= 208;
            if (lamp.position.z < -175) lamp.position.z += 208;
        }
    }

    function update(dt) {
        if (state.mode !== "running") return;
        state.elapsed += dt;
        const steerInput = Number(keys.right) - Number(keys.left);
        state.steer += (steerInput - state.steer) * Math.min(1, dt * 7);
        const reverse = keys.brake && state.speed <= 1;
        if (keys.throttle) {
            state.speed = Math.min(topSpeed, state.speed + acceleration * 3.1 * dt);
        } else if (keys.brake && !reverse) {
            state.speed = Math.max(0, state.speed - braking * (keys.handbrake ? 30 : 18) * dt);
        } else if (reverse) {
            state.speed = Math.max(-28, state.speed - acceleration * 1.9 * dt);
        } else if (state.speed > 0) {
            state.speed = Math.max(0, state.speed - 4.5 * dt);
        } else {
            state.speed = Math.min(0, state.speed + 3.5 * dt);
        }
        const driftFactor = state.skidTimer > 0 ? 0.42 : 1;
        const handbrakeFactor = keys.handbrake ? 0.62 : 1;
        state.x += state.steer * (2.1 + Math.abs(state.speed) * 0.034) * grip * driftFactor * handbrakeFactor * dt;
        state.x += state.skid * dt;
        state.skid *= Math.exp(-dt * (state.skidTimer > 0 ? 0.9 : 5));
        state.x = Math.max(-5.4, Math.min(5.4, state.x));
        state.skidTimer = Math.max(0, state.skidTimer - dt);
        player.group.position.x += (state.x - player.group.position.x) * Math.min(1, dt * 9);
        player.group.rotation.y = -state.steer * 0.17;
        player.group.rotation.z = -state.steer * 0.09;
        for (const wheel of player.wheels) wheel.rotation.x += state.speed * dt * 0.045;
        for (const wheel of player.wheels) wheel.rotation.z = Math.PI / 2;

        const signedDistance = state.speed / 3.6 * dt;
        moveEnvironment(signedDistance);
        state.distance += Math.max(0, state.speed) / 3.6 * dt;

        state.trafficTimer -= dt;
        if (state.speed > 32 && state.trafficTimer <= 0) {
            spawnTraffic();
            state.trafficTimer = Math.max(0.75, 1.75 - state.elapsed * 0.012);
        }
        state.coinTimer -= dt;
        if (state.speed > 18 && state.coinTimer <= 0) {
            spawnCoin();
            state.coinTimer = 2.8 + Math.random() * 1.7;
        }
        state.oilTimer -= dt;
        if (state.speed > 30 && state.oilTimer <= 0) {
            spawnOil();
            state.oilTimer = 8 + Math.random() * 5;
        }

        for (const traffic of trafficPool) {
            if (!traffic.active) continue;
            const relativeSpeed = (state.speed - traffic.speed) / 3.6;
            traffic.group.position.z += relativeSpeed * dt;
            for (const wheel of traffic.wheels) wheel.rotation.x += traffic.speed * dt * 0.04;
            if (traffic.group.position.z > 3 && Math.abs(traffic.group.position.x - state.x) < 1.8) {
                finishRun();
                return;
            }
            if (traffic.group.position.z > 17 || traffic.group.position.z < -115) {
                traffic.active = false;
                traffic.group.visible = false;
            }
        }

        for (const pickup of coins) {
            if (!pickup.active) continue;
            pickup.mesh.rotation.z += dt * 2.3;
            pickup.mesh.position.z += signedDistance;
            if (Math.abs(pickup.mesh.position.z) < 1.5 && Math.abs(pickup.mesh.position.x - state.x) < 1.8) {
                pickup.active = false;
                pickup.mesh.visible = false;
                state.coins += 1;
                playTone(740, 0.08, "triangle");
            } else if (pickup.mesh.position.z > 8 || pickup.mesh.position.z < -110) {
                pickup.active = false;
                pickup.mesh.visible = false;
            }
        }

        if (oil.visible) {
            oil.position.z += signedDistance;
            if (Math.abs(oil.position.z) < 1.5 && Math.abs(oil.position.x - state.x) < 1.9) {
                oil.visible = false;
                state.skidTimer = 1.2;
                state.skid = (Math.random() < 0.5 ? -1 : 1) * (1.3 + Math.abs(state.speed) * 0.025);
                roadWarning.textContent = "LOW GRIP — STEER AGAINST THE SLIDE";
                roadWarning.classList.remove("is-hidden");
                window.setTimeout(() => roadWarning.classList.add("is-hidden"), 1200);
            } else if (oil.position.z > 8 || oil.position.z < -115) {
                oil.visible = false;
            }
        }

        for (const light of player.headlights) {
            light.intensity = state.night ? 1.3 + lightsLevel * 0.9 : 0.35 + lightsLevel * 0.35;
        }
        updateHud();
    }

    function updateCamera(dt) {
        const target = new THREE.Vector3(player.group.position.x, 0.8, -9);
        if (state.cameraMode === 0) {
            const chase = new THREE.Vector3(player.group.position.x * 0.32, 5.4, 10.5);
            camera.position.lerp(chase, Math.min(1, dt * 3.2));
            camera.lookAt(target);
        } else {
            const cockpit = new THREE.Vector3(player.group.position.x, 1.45, -0.35);
            camera.position.lerp(cockpit, Math.min(1, dt * 6));
            camera.lookAt(new THREE.Vector3(player.group.position.x, 1.2, -42));
        }
    }

    function setLighting() {
        const background = state.night ? 0x071019 : 0x9dbdca;
        scene.background.setHex(background);
        scene.fog.color.setHex(background);
        scene.fog.near = state.night ? 48 : 78;
        scene.fog.far = state.night ? 180 : 260;
        hemisphere.intensity = state.night ? 1.35 : 2.2;
        sun.intensity = state.night ? 2.2 : 3.8;
        window.document.getElementById("lighting-toggle").textContent = state.night ? "☼" : "☾";
        window.document.getElementById("lighting-toggle").setAttribute(
            "aria-label",
            state.night ? "Switch to daylight" : "Switch to night lighting",
        );
        renderer.toneMappingExposure = state.night ? 1.05 : 1.2;
        for (const lamp of streetlights) {
            lamp.children.find((part) => part.isPointLight).intensity = state.night ? 1.5 : 0.08;
        }
    }

    function renderFrame(time) {
        const dt = Math.min(0.05, Math.max(0, (time - state.lastTime) / 1000));
        state.lastTime = time;
        update(dt);
        updateCamera(dt);
        renderer.render(scene, camera);
        if (loading && !loading.classList.contains("is-ready")) {
            setLoading(100, "3D road ready");
            window.setTimeout(() => loading.classList.add("is-ready"), 180);
        }
        window.requestAnimationFrame(renderFrame);
    }

    function setHeld(button, keyName) {
        const activate = (event) => {
            event.preventDefault();
            keys[keyName] = true;
            button.classList.add("is-active");
            button.setPointerCapture(event.pointerId);
        };
        const release = () => {
            keys[keyName] = false;
            button.classList.remove("is-active");
        };
        button.addEventListener("pointerdown", activate);
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("lostpointercapture", release);
    }

    document.getElementById("start-button").addEventListener("click", startGame);
    document.getElementById("restart-button").addEventListener("click", startGame);
    document.getElementById("resume-button").addEventListener("click", resumeGame);
    document.getElementById("mobile-pause").addEventListener("click", () => {
        if (state.mode === "running") pauseGame();
        else if (state.mode === "paused") resumeGame();
    });
    document.querySelectorAll("[data-steer]").forEach((button) => {
        const key = Number(button.dataset.steer) < 0 ? "left" : "right";
        setHeld(button, key);
    });
    document.querySelectorAll("[data-throttle]").forEach((button) => setHeld(button, "throttle"));
    document.querySelectorAll("[data-brake]").forEach((button) => setHeld(button, "brake"));
    document.getElementById("sound-toggle").addEventListener("click", (event) => {
        state.soundEnabled = !state.soundEnabled;
        event.currentTarget.classList.toggle("is-muted", !state.soundEnabled);
    });
    document.getElementById("camera-toggle").addEventListener("click", (event) => {
        state.cameraMode = (state.cameraMode + 1) % 2;
        event.currentTarget.setAttribute("aria-label", state.cameraMode ? "Switch to chase camera" : "Switch to cockpit camera");
    });
    document.getElementById("lighting-toggle").addEventListener("click", () => {
        state.night = !state.night;
        setLighting();
    });
    nameInput.addEventListener("input", () => nameInput.setCustomValidity(""));
    nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && state.mode === "ready") startGame();
    });
    document.addEventListener("keydown", (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement) return;
        const key = event.key.toLowerCase();
        if (key === "arrowleft" || key === "a") keys.left = true;
        if (key === "arrowright" || key === "d") keys.right = true;
        if (key === "arrowup" || key === "w") keys.throttle = true;
        if (key === "arrowdown" || key === "s") keys.brake = true;
        if (event.code === "Space") keys.handbrake = true;
        if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) event.preventDefault();
        if (key === "p" || key === "escape") {
            if (state.mode === "running") pauseGame();
            else if (state.mode === "paused") resumeGame();
        } else if (key === "enter" && state.mode === "paused") {
            resumeGame();
        }
    });
    document.addEventListener("keyup", (event) => {
        const key = event.key.toLowerCase();
        if (key === "arrowleft" || key === "a") keys.left = false;
        if (key === "arrowright" || key === "d") keys.right = false;
        if (key === "arrowup" || key === "w") keys.throttle = false;
        if (key === "arrowdown" || key === "s") keys.brake = false;
        if (event.code === "Space") keys.handbrake = false;
    });
    window.addEventListener("blur", () => {
        keys.left = false;
        keys.right = false;
        keys.throttle = false;
        keys.brake = false;
        keys.handbrake = false;
    });
    window.addEventListener("resize", resize);
    canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        roadWarning.textContent = "3D graphics paused. Reload the page to restore the scene.";
        roadWarning.classList.remove("is-hidden");
        pauseGame();
    });

    board.classList.add("is-3d");
    setLighting();
    resize();
    updateHud();
    updateCamera(1);
    renderer.render(scene, camera);
    setLoading(100, "3D road ready");
    if (loading) {
        window.setTimeout(() => loading.classList.add("is-ready"), 180);
    }
    window.requestAnimationFrame(renderFrame);
}
