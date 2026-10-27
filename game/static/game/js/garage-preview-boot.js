const canvas = document.getElementById("garage-car-preview");
const status = document.getElementById("garage-preview-status");

if (canvas && status) {
    try {
        const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js");
        const { startGaragePreview } = await import("./garage-preview.js");
        startGaragePreview(THREE);
    } catch (error) {
        console.warn("The 3D garage preview could not start.", error);
        status.textContent = "3D preview unavailable on this device. Your garage and vehicle data are still available below.";
    }
}
