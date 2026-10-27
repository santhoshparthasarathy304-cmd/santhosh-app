import { createVehicle } from "./game-3d.js";

export function startGaragePreview(THREE) {
    const canvas = document.getElementById("garage-car-preview");
    const status = document.getElementById("garage-preview-status");
    if (!canvas || !status) return;

    const paint = /^#[0-9a-f]{6}$/i.test(canvas.dataset.paint || "")
        ? canvas.dataset.paint
        : "#51f2dc";
    const lightsLevel = Math.max(0, Number(canvas.dataset.lights) || 0);
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: window.devicePixelRatio < 2,
        alpha: false,
        powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111b25);
    scene.fog = new THREE.Fog(0x111b25, 16, 42);
    const camera = new THREE.PerspectiveCamera(42, 960 / 420, 0.1, 100);
    camera.position.set(6.7, 3.4, 7.5);
    camera.lookAt(0, 0.85, 0);
    scene.add(new THREE.HemisphereLight(0xbde9ef, 0x18202b, 2.2));

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(-4, 8, 5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x57f0dc, 30, 18);
    rimLight.position.set(4, 2.3, -3);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
        new THREE.CircleGeometry(10, 48),
        new THREE.MeshStandardMaterial({ color: 0x18232c, roughness: 0.8, metalness: 0.12 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.07;
    scene.add(floor);
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(4.4, 0.025, 6, 80),
        new THREE.MeshStandardMaterial({
            color: 0x57f0dc,
            emissive: 0x18766c,
            emissiveIntensity: 1.2,
        }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.035;
    scene.add(ring);

    const car = createVehicle(THREE, paint, lightsLevel);
    scene.add(car.group);
    let dragging = false;
    let lastX = 0;
    let targetRotation = -0.45;

    function resize() {
        const width = Math.max(1, canvas.clientWidth || 960);
        const height = width * 420 / 960;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }

    canvas.addEventListener("pointerdown", (event) => {
        dragging = true;
        lastX = event.clientX;
        canvas.setPointerCapture(event.pointerId);
        status.textContent = "Drag left or right to rotate the car.";
    });
    canvas.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        targetRotation += (event.clientX - lastX) * 0.009;
        lastX = event.clientX;
    });
    const endDrag = () => {
        dragging = false;
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("lostpointercapture", endDrag);
    window.addEventListener("resize", resize);
    resize();
    status.textContent = "Drag the car to inspect it. Upgrade effects are saved to this vehicle.";

    function frame() {
        if (!dragging) targetRotation += 0.0018;
        car.group.rotation.y += (targetRotation - car.group.rotation.y) * 0.08;
        for (const wheel of car.wheels) wheel.rotation.x += 0.008;
        renderer.render(scene, camera);
        window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
}
