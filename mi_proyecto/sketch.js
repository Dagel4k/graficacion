let video;
let classifier;
let currentLabel = "Esperando Modelo...";
let confidenceScore = 0;
const modelSource = './my_model/';
const CONFIDENCE_THRESHOLD = 0.25;
const UNKNOWN_LABEL = "desconocido";

// Variables de Control desde el Dashboard
let isCameraActive = true;
let particleCountLimit = 300;
let rotationSpeed = 0.015;
let isWobbleActive = true;

// Estado 3D
let bgParticles = [];
let modelRotationY = 0;
let modelRotationX = 0;
let bounceOffset = 0;
let prevLabel = "";
let rippleRadius3D = 0;
let isRippling = false;
let camBuffer; // buffer 2D para preview de cámara

function preload() {
    classifier = ml5.imageClassifier(modelSource + 'model.json');
}

function setup() {
    const mainCanvas = createCanvas(800, 600, WEBGL);
    mainCanvas.parent('canvas-wrapper');

    video = createCapture(VIDEO);
    video.size(320, 240);
    video.hide();

    // Buffer 2D para el preview de cámara (compatible con WEBGL)
    camBuffer = createGraphics(160, 120);
    camBuffer.colorMode(HSB, 360, 255, 255, 255);
    camBuffer.textFont('Courier New');
    camBuffer.textSize(10);

    executeClassificationLoop();

    // Partículas de fondo 3D (espacio estelar)
    for (let i = 0; i < 300; i++) {
        bgParticles.push({
            x: random(-500, 500),
            y: random(-400, 400),
            z: random(-600, 200),
            vx: random(-0.3, 0.3),
            vy: random(-0.3, 0.3),
            vz: random(0.1, 0.5),
            size: random(0.5, 3),
            hue: random(360)
        });
    }
}

function draw() {
    // Fondo
    background(5, 5, 18);

    // Iluminación 3D
    ambientLight(50);
    let lightAngle = frameCount * 0.005;
    directionalLight(255, 255, 255, cos(lightAngle), sin(lightAngle), -1);
    directionalLight(100, 120, 200, -cos(lightAngle), -sin(lightAngle), 1);
    pointLight(200, 150, 255, 0, 0, 100);

    // Partículas estelares de fondo
    push();
    noStroke();
    let maxParticles = min(bgParticles.length, particleCountLimit);
    for (let i = 0; i < maxParticles; i++) {
        let p = bgParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        if (p.z > 200) { p.x = random(-500, 500); p.y = random(-400, 400); p.z = -600; }
        let alpha = map(p.z, -600, 200, 0.1, 0.8);
        fill(100 + p.hue * 0.3, 100 + p.hue * 0.1, 200, alpha * 255);
        sphere(p.size * map(confidenceScore, 0, 1, 0.5, 1.5));
    }
    pop();

    // Efecto ripple 3D en cambio de clase
    if (isRippling) {
        push();
        noFill();
        stroke(200, 150, 255, max(0, 1 - rippleRadius3D / 300) * 0.6);
        strokeWeight(2);
        for (let i = 0; i < 3; i++) {
            let r = rippleRadius3D + i * 30;
            torus(r, 3);
        }
        rippleRadius3D += 4;
        if (rippleRadius3D > 350) isRippling = false;
        pop();
    }

    // Modelo 3D central
    push();
    // Rotación automática
    modelRotationY += rotationSpeed;
    let wobble = isWobbleActive ? sin(frameCount * 0.02) * 0.15 : 0;
    rotateY(modelRotationY);
    rotateX(wobble);

    // Escala pulsante con la confianza
    let scaleFactor = 0.8 + 0.4 * confidenceScore;
    scale(scaleFactor);

    drawClassModel3D(currentLabel.toLowerCase());
    pop();

    // Preview de cámara (picture-in-picture en WEBGL)
    // Obtener color de la clase actual para el marco
    let classHue = getClassParamsFor(currentLabel.toLowerCase()).h;
    let classBright = getClassParamsFor(currentLabel.toLowerCase()).bri;

    // Componer el buffer 2D: video + retícula + scan
    camBuffer.image(video, 0, 0, 160, 120);

    // Marco de color según la clase detectada
    camBuffer.noFill();
    camBuffer.strokeWeight(3);
    camBuffer.stroke(classHue * 0.7, 180, 200, 200);
    camBuffer.rect(0, 0, 160, 120);

    // Barras de esquina (como retícula de targeting)
    camBuffer.strokeWeight(2);
    camBuffer.stroke(0, 0, 255, 200);
    let c = 12, g = 4;
    // ESI
    camBuffer.line(g, g, g + c, g);
    camBuffer.line(g, g, g, g + c);
    // ESD
    camBuffer.line(160 - g, g, 160 - g - c, g);
    camBuffer.line(160 - g, g, 160 - g, g + c);
    // EII
    camBuffer.line(g, 120 - g, g + c, 120 - g);
    camBuffer.line(g, 120 - g, g, 120 - g - c);
    // EID
    camBuffer.line(160 - g, 120 - g, 160 - g - c, 120 - g);
    camBuffer.line(160 - g, 120 - g, 160 - g, 120 - g - c);

    // Línea de scan horizontal que baja
    let scanY = (frameCount * 1.5) % 120;
    camBuffer.noStroke();
    camBuffer.fill(100, 200, 255, 60);
    camBuffer.rect(0, scanY, 160, 4);
    camBuffer.fill(100, 200, 255, 120);
    camBuffer.rect(0, scanY, 160, 1);

    // Texto de confianza en el preview
    camBuffer.noStroke();
    camBuffer.fill(0, 0, 0, 160);
    camBuffer.rect(0, 104, 160, 16);
    camBuffer.fill(0, 0, 255, 220);
    camBuffer.text('AI: ' + (confidenceScore * 100).toFixed(0) + '%', 6, 116);

    // Renderizar buffer texturizado en 3D
    push();
    resetMatrix();
    translate(-width / 2 + 100, -height / 2 + 75);
    // Sombra
    noStroke();
    fill(0, 0, 0, 80);
    translate(3, 3);
    plane(164, 124);
    translate(-3, -3);
    // Video texturizado
    texture(camBuffer);
    noStroke();
    plane(160, 120);
    pop();

    // HUD
    document.getElementById('lbl-clase').innerText = currentLabel.toUpperCase();
    document.getElementById('lbl-certeza').innerText = (confidenceScore * 100).toFixed(1) + "%";
    document.getElementById('lbl-modo').innerText = getClassStatus(currentLabel.toLowerCase());
}

// ============================================================
// MODELOS 3D PROCEDURALES — UNA FORMA DISTINTA POR CLASE
// ============================================================
function drawClassModel3D(label) {
    noStroke();
    switch (label) {
        // --- AVION ---
        case "avion":
            // Fuselaje
            fill(180, 190, 210);
            push(); scale(1, 0.6, 2); sphere(30); pop();
            // Alas
            fill(150, 160, 190);
            push(); rotateZ(HALF_PI); box(120, 8, 25); pop();
            // Cola vertical
            push(); translate(0, 20, -45); box(5, 35, 20); pop();
            // Cabina
            fill(100, 180, 255, 150);
            push(); translate(0, -5, 15); scale(0.6, 0.4, 0.8); sphere(20); pop();
            break;

        // --- AUTOMOVIL ---
        case "automovil":
            // Carrocería
            fill(220, 60, 60);
            push(); box(100, 25, 50); pop();
            // Cabina
            fill(160, 50, 50);
            push(); translate(10, -15, 0); box(40, 20, 45); pop();
            // Ruedas
            fill(30);
            push(); translate(-30, 20, 28); cylinder(10, 8); pop();
            push(); translate(-30, 20, -28); cylinder(10, 8); pop();
            push(); translate(30, 20, 28); cylinder(10, 8); pop();
            push(); translate(30, 20, -28); cylinder(10, 8); pop();
            // Faros
            fill(255, 200, 50);
            push(); translate(50, 0, 15); sphere(5); pop();
            push(); translate(50, 0, -15); sphere(5); pop();
            break;

        // --- PAJARO ---
        case "pajaro":
            // Cuerpo
            fill(60, 180, 160);
            push(); scale(1, 0.8, 1.3); sphere(22); pop();
            // Alas (con aleteo)
            fill(50, 160, 140);
            let wingAngle = sin(frameCount * 0.08) * 0.4;
            push(); translate(-15, 0, 0); rotateZ(PI / 2 + wingAngle); box(5, 50, 18); pop();
            push(); translate(15, 0, 0); rotateZ(-PI / 2 - wingAngle); box(5, 50, 18); pop();
            // Cabeza
            fill(70, 200, 180);
            push(); translate(0, -12, 35); sphere(12); pop();
            // Pico
            fill(240, 150, 50);
            push(); translate(0, -14, 50); cone(4, 10); pop();
            break;

        // --- GATO ---
        case "gato":
            // Cuerpo
            fill(220, 150, 60);
            push(); scale(1, 0.7, 1.4); sphere(20); pop();
            // Cabeza
            push(); translate(0, -10, 35); sphere(15); pop();
            // Orejas (triángulos)
            fill(200, 130, 50);
            push(); translate(-10, -22, 35); rotateX(-0.3); cone(6, 12); pop();
            push(); translate(10, -22, 35); rotateX(-0.3); cone(6, 12); pop();
            // Ojos
            fill(50, 200, 50);
            push(); translate(-6, -12, 48); sphere(4); pop();
            push(); translate(6, -12, 48); sphere(4); pop();
            // Cola
            fill(200, 140, 50);
            push(); translate(0, 5, -35); rotateX(sin(frameCount * 0.05) * 0.3); cylinder(3, 30); pop();
            break;

        // --- VENADO ---
        case "venado":
            // Cuerpo
            fill(180, 150, 80);
            push(); scale(1, 0.7, 1.5); sphere(20); pop();
            // Cuello
            push(); translate(0, 10, 30); cylinder(8, 25); pop();
            // Cabeza
            push(); translate(0, 25, 35); sphere(12); pop();
            // Astas
            fill(140, 110, 60);
            push(); translate(-6, 30, 30); rotateZ(-0.3); cylinder(2, 20); pop();
            push(); translate(6, 30, 30); rotateZ(0.3); cylinder(2, 20); pop();
            push(); translate(-12, 40, 28); rotateZ(-0.5); cylinder(2, 15); pop();
            push(); translate(12, 40, 28); rotateZ(0.5); cylinder(2, 15); pop();
            // Patas
            fill(160, 130, 70);
            push(); translate(-12, -10, -15); cylinder(4, 20); pop();
            push(); translate(12, -10, -15); cylinder(4, 20); pop();
            push(); translate(-12, -10, 15); cylinder(4, 20); pop();
            push(); translate(12, -10, 15); cylinder(4, 20); pop();
            break;

        // --- PERRO ---
        case "perro":
            // Cuerpo
            fill(200, 170, 100);
            push(); scale(1, 0.7, 1.5); sphere(20); pop();
            // Cabeza
            push(); translate(0, -5, 35); sphere(16); pop();
            // Orejas caídas
            fill(180, 150, 80);
            push(); translate(-12, -15, 30); rotateZ(0.3); ellipsoid(7, 15, 4); pop();
            push(); translate(12, -15, 30); rotateZ(-0.3); ellipsoid(7, 15, 4); pop();
            // Hocico
            fill(210, 180, 120);
            push(); translate(0, -2, 48); sphere(8); pop();
            fill(30);
            push(); translate(0, -2, 55); sphere(3); pop(); // nariz
            // Cola moviéndose
            fill(190, 160, 90);
            push(); translate(0, 5, -35); rotateZ(sin(frameCount * 0.1) * 0.5); cylinder(3, 25); pop();
            break;

        // --- RANA ---
        case "rana":
            // Cuerpo
            fill(50, 200, 50);
            push(); scale(1.4, 0.6, 1); sphere(20); pop();
            // Cabeza
            push(); translate(0, -3, 30); scale(1.2, 0.7, 0.8); sphere(15); pop();
            // Ojos saltones
            fill(50, 220, 50);
            push(); translate(-10, -6, 35); sphere(8); pop();
            push(); translate(10, -6, 35); sphere(8); pop();
            fill(255);
            push(); translate(-10, -6, 40); sphere(4); pop();
            push(); translate(10, -6, 40); sphere(4); pop();
            // Pupilas
            fill(0);
            push(); translate(-10, -6, 43); sphere(2); pop();
            push(); translate(10, -6, 43); sphere(2); pop();
            // Patas
            push(); translate(-18, 12, -5); rotateZ(0.5); cylinder(4, 20); pop();
            push(); translate(18, 12, -5); rotateZ(-0.5); cylinder(4, 20); pop();
            // Salto animado
            let hop = abs(sin(frameCount * 0.06)) * 5;
            translate(0, -hop * 2, 0);
            break;

        // --- CABALLO ---
        case "caballo":
            // Cuerpo
            fill(140, 100, 200);
            push(); scale(1, 0.8, 1.6); sphere(22); pop();
            // Cuello
            push(); translate(0, 12, 30); cylinder(10, 30); pop();
            // Cabeza
            push(); translate(0, 30, 38); sphere(14); pop();
            // Crin
            fill(100, 60, 160);
            push(); translate(0, 20, 25); rotateX(0.3); cylinder(3, 25); pop();
            // Patas
            fill(130, 90, 190);
            push(); translate(-14, -8, -20); cylinder(5, 22); pop();
            push(); translate(14, -8, -20); cylinder(5, 22); pop();
            push(); translate(-14, -8, 20); cylinder(5, 22); pop();
            push(); translate(14, -8, 20); cylinder(5, 22); pop();
            break;

        // --- BARCO ---
        case "barco":
            // Casco
            fill(100, 120, 140);
            push(); rotateX(PI / 12); box(90, 30, 50); pop();
            // Cubierta
            fill(140, 160, 180);
            push(); translate(0, -15, 0); box(70, 8, 45); pop();
            // Mástil
            fill(80, 60, 40);
            push(); translate(0, -50, 0); cylinder(4, 60); pop();
            // Vela
            fill(240, 240, 220, 180);
            push(); translate(0, -40, 0); rotateX(PI / 6); box(3, 40, 30); pop();
            // Bandera
            fill(200, 50, 50);
            push(); translate(0, -75, 5); rotateY(sin(frameCount * 0.05) * 0.2); box(2, 15, 10); pop();
            break;

        // --- CAMION ---
        case "camion":
            // Cabina
            fill(180, 180, 190);
            push(); translate(-25, -5, 0); box(35, 30, 45); pop();
            // Carga
            fill(160, 160, 170);
            push(); translate(20, 0, 0); box(60, 35, 45); pop();
            // Ruedas (6)
            fill(30);
            push(); translate(-35, 20, 25); cylinder(8, 6); pop();
            push(); translate(-35, 20, -25); cylinder(8, 6); pop();
            push(); translate(15, 20, 25); cylinder(8, 6); pop();
            push(); translate(15, 20, -25); cylinder(8, 6); pop();
            push(); translate(40, 20, 25); cylinder(8, 6); pop();
            push(); translate(40, 20, -25); cylinder(8, 6); pop();
            break;

        // --- FONDO (escenario vacío) ---
        case "fondo":
            fill(60, 70, 100, 100);
            push(); rotateX(HALF_PI); torus(40, 5); pop();
            fill(100, 120, 160, 60);
            push(); rotateY(frameCount * 0.01); torus(60, 3); pop();
            break;

        // --- MANO ---
        case "mano":
            // Palma
            fill(220, 180, 150);
            push(); scale(1, 0.5, 0.8); sphere(18); pop();
            // Dedos
            let fingerAngles = [-0.6, -0.3, 0, 0.3, 0.6];
            for (let i = 0; i < 5; i++) {
                push();
                rotateY(fingerAngles[i]);
                translate(0, -18, 22);
                cylinder(4, 18);
                pop();
            }
            // Pulgar
            push(); rotateY(-0.8); translate(-12, -5, 12); rotateX(-0.5); cylinder(5, 14); pop();
            break;

        // --- OBJETO (figura abstracta) ---
        case "objeto":
            fill(100, 200, 255, 150);
            push(); rotateX(frameCount * 0.02); rotateY(frameCount * 0.03); torus(25, 10); pop();
            fill(200, 100, 255, 100);
            push(); rotateX(-frameCount * 0.015); rotateZ(frameCount * 0.02); torus(40, 5); pop();
            break;

        // --- PERSONA ---
        case "persona":
            // Cabeza
            fill(230, 200, 170);
            push(); translate(0, -22, 0); sphere(14); pop();
            // Cuerpo
            fill(60, 80, 180);
            push(); translate(0, 5, 0); box(20, 30, 12); pop();
            // Brazos
            fill(220, 190, 160);
            let armSwing = sin(frameCount * 0.05) * 0.3;
            push(); translate(-15, -5, 0); rotateZ(armSwing); cylinder(4, 22); pop();
            push(); translate(15, -5, 0); rotateZ(-armSwing); cylinder(4, 22); pop();
            // Piernas
            fill(40, 50, 100);
            push(); translate(-7, 20, 0); cylinder(5, 22); pop();
            push(); translate(7, 20, 0); cylinder(5, 22); pop();
            break;

        // --- DESCONOCIDO / DEFAULT ---
        default:
            fill(80, 80, 100, 100);
            push(); rotateX(frameCount * 0.01); rotateY(frameCount * 0.02); box(30); pop();
            fill(100, 100, 120, 60);
            push(); rotateX(-frameCount * 0.015); rotateY(frameCount * 0.01); box(40); pop();
            break;
    }
}

// ============================================================
// STATUS TEXT
// ============================================================
function getClassStatus(label) {
    const statuses = {
        "avion": "Modelo 3D: Avión",
        "automovil": "Modelo 3D: Automóvil",
        "pajaro": "Modelo 3D: Pájaro",
        "gato": "Modelo 3D: Gato",
        "venado": "Modelo 3D: Venado",
        "perro": "Modelo 3D: Perro",
        "rana": "Modelo 3D: Rana",
        "caballo": "Modelo 3D: Caballo",
        "barco": "Modelo 3D: Barco",
        "camion": "Modelo 3D: Camión",
        "fondo": "Modelo 3D: Paisaje",
        "mano": "Modelo 3D: Mano",
        "objeto": "Modelo 3D: Objeto",
        "persona": "Modelo 3D: Persona",
    };
    return statuses[label] || "Modelo 3D: —";
}

// ============================================================
// CLASIFICACIÓN
// ============================================================
function executeClassificationLoop() {
    if (isCameraActive) {
        classifier.classify(video, processPredictionResults);
    } else {
        setTimeout(executeClassificationLoop, 250);
    }
}

function processPredictionResults(err, results) {
    if (err) { console.error(err); return; }
    let top = results[0];
    let newLabel = top.confidence < CONFIDENCE_THRESHOLD ? UNKNOWN_LABEL : top.label;
    confidenceScore = top.confidence;

    // Ripple 3D al cambiar de clase
    if (newLabel !== prevLabel && prevLabel !== "") {
        isRippling = true;
        rippleRadius3D = 5;
    }
    prevLabel = newLabel;
    currentLabel = newLabel;

    executeClassificationLoop();
}

// ============================================================
// PARÁMETROS DE COLOR DINÁMICOS POR CLASE
// ============================================================
function getClassParamsFor(label) {
    const params = {
        "avion": { h: 210, bri: 200 },
        "automovil": { h: 0, bri: 220 },
        "pajaro": { h: 170, bri: 200 },
        "gato": { h: 35, bri: 220 },
        "venado": { h: 30, bri: 180 },
        "perro": { h: 45, bri: 200 },
        "rana": { h: 120, bri: 220 },
        "caballo": { h: 280, bri: 180 },
        "barco": { h: 200, bri: 160 },
        "camion": { h: 10, bri: 140 },
        "fondo": { h: 240, bri: 100 },
        "mano": { h: 20, bri: 220 },
        "objeto": { h: 195, bri: 240 },
        "persona": { h: 225, bri: 200 },
        "desconocido": { h: 0, bri: 120 }
    };
    return params[label] || { h: 0, bri: 150 };
}
