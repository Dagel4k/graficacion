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
let camBuffer;

// Variables de animación para cada modelo
let walkCycle = 0;
let flyCycle = 0;
let breatheCycle = 0;
let tailWag = 0;
let jumpCycle = 0;

function preload() {
    classifier = ml5.imageClassifier(modelSource + 'model.json');
}

function setup() {
    const mainCanvas = createCanvas(800, 600, WEBGL);
    mainCanvas.parent('canvas-wrapper');

    video = createCapture(VIDEO);
    video.size(320, 240);
    video.hide();

    camBuffer = createGraphics(160, 120);
    camBuffer.colorMode(HSB, 360, 255, 255, 255);
    camBuffer.textFont('Courier New');
    camBuffer.textSize(10);

    executeClassificationLoop();

    // Partículas de fondo 3D (espacio estelar) - simple y limpio
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
    background(5, 5, 18);

    // Iluminación 3D
    ambientLight(50);
    let lightAngle = frameCount * 0.005;
    directionalLight(255, 255, 255, cos(lightAngle), sin(lightAngle), -1);
    directionalLight(100, 120, 200, -cos(lightAngle), -sin(lightAngle), 1);
    pointLight(200, 150, 255, 0, 0, 100);

    // Actualizar ciclos de animación
    walkCycle += 0.05;
    flyCycle += 0.1;
    breatheCycle += 0.03;
    tailWag += 0.15;
    jumpCycle += 0.04;

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

    // Efecto ripple simple en cambio de clase
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

    // Modelo 3D central (ignorar "Fondo" en display)
    push();
    rotateY(modelRotationY);
    let wobble = isWobbleActive ? sin(frameCount * 0.02) * 0.15 : 0;
    rotateX(wobble);
    let scaleFactor = 0.8 + 0.4 * confidenceScore;
    scale(scaleFactor);

    let displayLabel = currentLabel.toLowerCase();
    let hudLabel = displayLabel === "fondo" ? "OBJETO" : currentLabel.toUpperCase();
    drawClassModel3D(displayLabel);
    pop();

    // Preview de cámara
    let classHue = getClassParamsFor(displayLabel).h;
    let classBright = getClassParamsFor(currentLabel.toLowerCase()).bri;

    camBuffer.image(video, 0, 0, 160, 120);

    camBuffer.noFill();
    camBuffer.strokeWeight(3);
    camBuffer.stroke(classHue * 0.7, 180, 200, 200);
    camBuffer.rect(0, 0, 160, 120);

    camBuffer.strokeWeight(2);
    camBuffer.stroke(0, 0, 255, 200);
    let c = 12, g = 4;
    camBuffer.line(g, g, g + c, g);
    camBuffer.line(g, g, g, g + c);
    camBuffer.line(160 - g, g, 160 - g - c, g);
    camBuffer.line(160 - g, g, 160 - g, g + c);
    camBuffer.line(g, 120 - g, g + c, 120 - g);
    camBuffer.line(g, 120 - g, g, 120 - g - c);
    camBuffer.line(160 - g, 120 - g, 160 - g - c, 120 - g);
    camBuffer.line(160 - g, 120 - g, 160 - g, 120 - g - c);

    let scanY = (frameCount * 1.5) % 120;
    camBuffer.noStroke();
    camBuffer.fill(100, 200, 255, 60);
    camBuffer.rect(0, scanY, 160, 4);
    camBuffer.fill(100, 200, 255, 120);
    camBuffer.rect(0, scanY, 160, 1);

    camBuffer.noStroke();
    camBuffer.fill(0, 0, 0, 160);
    camBuffer.rect(0, 104, 160, 16);
    camBuffer.fill(0, 0, 255, 220);
    camBuffer.text('AI: ' + (confidenceScore * 100).toFixed(0) + '%', 6, 116);

    push();
    resetMatrix();
    translate(-width / 2 + 100, -height / 2 + 75);
    noStroke();
    fill(0, 0, 0, 80);
    translate(3, 3);
    plane(164, 124);
    translate(-3, -3);
    texture(camBuffer);
    noStroke();
    plane(160, 120);
    pop();

    // HUD - mostrar label pero no "Fondo" como resultado de clasificación
    let finalLabel = currentLabel.toLowerCase();
    let displayStatus = finalLabel === "fondo" ? "esperando objeto" : getClassStatus(finalLabel);
    let displayClase = finalLabel === "fondo" ? "detectar objeto" : currentLabel.toUpperCase();

    document.getElementById('lbl-clase').innerText = displayClase;
    document.getElementById('lbl-certeza').innerText = (confidenceScore * 100).toFixed(1) + "%";
    document.getElementById('lbl-modo').innerText = displayStatus;
}

// ============================================================
// MODELOS 3D PROCEDURALES — UNA FORMA DISTINTA POR CLASE
// ============================================================
function drawClassModel3D(label) {
    noStroke();
    switch (label) {
        // --- AVION ---
        case "avion":
            // Animación: movimiento de alas y motor
            let wingFlex = sin(flyCycle * 2) * 0.08;

            // Fuselaje principal
            fill(180, 190, 210);
            push();
            rotateY(wingFlex);
            scale(1, 0.6, 2);
            sphere(30);
            pop();

            // Alas con flexión
            fill(150, 160, 190);
            push();
            rotateZ(HALF_PI + wingFlex);
            box(120, 8, 25);
            pop();

            // Motor con brillo
            fill(100, 100, 120);
            push();
            translate(40, 5, 15);
            cylinder(6, 12);
            pop();
            push();
            translate(40, 5, -15);
            cylinder(6, 12);
            pop();

            // Cola vertical
            push();
            translate(0, 20, -45);
            box(5, 35, 20);
            pop();

            // Cabina con reflejo
            fill(100, 180, 255, 180);
            push();
            translate(0, -5, 15);
            scale(0.6, 0.4, 0.8);
            sphere(20);
            pop();

            // Luces de navegación parpadeantes
            let navLight = (frameCount % 60) < 30;
            fill(navLight ? 0 : 100, 255, navLight ? 255 : 50);
            push();
            translate(50, 0, 20);
            sphere(3);
            pop();
            fill(navLight ? 100 : 0, 255, navLight ? 50 : 255);
            push();
            translate(50, 0, -20);
            sphere(3);
            pop();
            break;

        // --- AUTOMOVIL ---
        case "automovil":
            // Animación: suspensión y ruedas
            let suspension = sin(walkCycle) * 0.03;

            // Carrocería
            fill(220, 60, 60);
            push();
            translate(0, suspension * 5, 0);
            box(100, 25, 50);
            pop();

            // Cabina
            fill(160, 50, 50);
            push();
            translate(10, -15 + suspension * 3, 0);
            box(40, 20, 45);
            pop();

            // Ruedas con rotación
            fill(30);
            let wheelRot = walkCycle * 2;
            push();
            translate(-30, 20, 28);
            rotateZ(wheelRot);
            cylinder(10, 8);
            pop();
            push();
            translate(-30, 20, -28);
            rotateZ(wheelRot);
            cylinder(10, 8);
            pop();
            push();
            translate(30, 20, 28);
            rotateZ(wheelRot);
            cylinder(10, 8);
            pop();
            push();
            translate(30, 20, -28);
            rotateZ(wheelRot);
            cylinder(10, 8);
            pop();

            // Faros que brillan
            fill(255, 220, 100);
            push();
            translate(50, 0, 15);
            sphere(5);
            pop();
            push();
            translate(50, 0, -15);
            sphere(5);
            pop();

            // Ventanas con reflejo
            fill(100, 150, 200, 150);
            push();
            translate(5, -18, 0);
            box(30, 8, 40);
            pop();
            break;

        // --- PAJARO ---
        case "pajaro":
            // Animación: aleteo con movimiento natural
            let flapUp = sin(flyCycle) * 0.5;
            let flapDown = sin(flyCycle + PI) * 0.3;

            // Cuerpo
            fill(60, 180, 160);
            push();
            scale(1, 0.8, 1.3);
            sphere(22);
            pop();

            // Ala izquierda
            fill(50, 160, 140);
            push();
            translate(-15, 0, 0);
            rotateZ(PI / 2 + flapUp);
            scale(1, 2.5, 0.3);
            sphere(10);
            pop();

            // Ala derecha
            push();
            translate(15, 0, 0);
            rotateZ(-PI / 2 - flapUp);
            scale(1, 2.5, 0.3);
            sphere(10);
            pop();

            // Cabeza con movimiento
            fill(70, 200, 180);
            push();
            translate(0, -12, 35);
            rotateX(sin(flyCycle * 0.5) * 0.2);
            sphere(12);
            pop();

            // Pico
            fill(240, 150, 50);
            push();
            translate(0, -14, 50);
            cone(4, 10);
            pop();

            // Ojo
            fill(255);
            push();
            translate(0, -12, 44);
            sphere(3);
            pop();
            fill(0, 150, 255);
            push();
            translate(0, -12, 46);
            sphere(2);
            pop();
            break;

        // --- GATO ---
        case "gato":
            // Animación: respiración, cola, orejas
            let breathe = sin(breatheCycle) * 0.05;
            let tailMove = sin(tailWag) * 0.4;

            // Cuerpo con respiración
            fill(220, 150, 60);
            push();
            scale(1, 0.7 + breathe, 1.4);
            sphere(20);
            pop();

            // Cabeza
            push();
            translate(0, -10, 35);
            scale(1 + breathe * 0.5, 1 + breathe * 0.3, 1 + breathe * 0.5);
            sphere(15);
            pop();

            // Orejas que se mueven
            fill(200, 130, 50);
            push();
            translate(-10, -22, 35);
            rotateX(-0.3 + sin(flyCycle) * 0.1);
            cone(6, 12);
            pop();
            push();
            translate(10, -22, 35);
            rotateX(-0.3 - sin(flyCycle) * 0.1);
            cone(6, 12);
            pop();

            // Ojos que parpadean
            let blink = (frameCount % 180) < 5;
            fill(50, 200, 50);
            push();
            translate(-6, -12, 48);
            if (!blink) sphere(4);
            pop();
            push();
            translate(6, -12, 48);
            if (!blink) sphere(4);
            pop();

            // Nariz
            fill(200, 100, 120);
            push();
            translate(0, -8, 52);
            sphere(2);
            pop();

            // Cola moviéndose
            fill(200, 140, 50);
            push();
            translate(0, 5, -35);
            rotateX(tailMove);
            rotateZ(sin(tailWag * 0.7) * 0.3);
            cylinder(3, 35);
            pop();

            // Bigotes
            stroke(255, 255, 255, 150);
            strokeWeight(0.5);
            push();
            translate(-8, -6, 50);
            line(-15, 0, 0, -8, 2, 0);
            pop();
            push();
            translate(8, -6, 50);
            line(15, 0, 0, 8, 2, 0);
            pop();
            noStroke();
            break;

        // --- VENADO ---
        case "venado":
            // Animación: orejas, astas, respiración
            let earTwitch = sin(flyCycle * 0.8) * 0.15;

            // Cuerpo
            fill(180, 150, 80);
            push();
            scale(1, 0.7, 1.5);
            sphere(20);
            pop();

            // Cuello
            push();
            translate(0, 10, 30);
            cylinder(8, 25);
            pop();

            // Cabeza
            push();
            translate(0, 25, 35);
            sphere(12);
            pop();

            // Astas con movimiento sutil
            fill(140, 110, 60);
            push();
            translate(-6, 30, 30);
            rotateZ(-0.3 + earTwitch);
            cylinder(2, 22);
            // Rama
            push();
            translate(-3, 10, 0);
            rotateZ(-0.5);
            cylinder(1.5, 12);
            pop();
            pop();
            push();
            translate(6, 30, 30);
            rotateZ(0.3 - earTwitch);
            cylinder(2, 22);
            // Rama
            push();
            translate(3, 10, 0);
            rotateZ(0.5);
            cylinder(1.5, 12);
            pop();
            pop();

            // Orejas
            fill(180, 140, 70);
            push();
            translate(-12, 20, 30);
            rotateZ(0.5 + earTwitch);
            ellipse(3, 10, 3, 12);
            pop();
            push();
            translate(12, 20, 30);
            rotateZ(-0.5 - earTwitch);
            ellipse(3, 10, 3, 12);
            pop();

            // Ojos
            fill(50, 50, 30);
            push();
            translate(-4, 24, 45);
            sphere(2);
            pop();
            push();
            translate(4, 24, 45);
            sphere(2);
            pop();

            // Patas con peso
            fill(160, 130, 70);
            push();
            translate(-12, -10, -15);
            cylinder(4, 20);
            pop();
            push();
            translate(12, -10, -15);
            cylinder(4, 20);
            pop();
            push();
            translate(-12, -10, 15);
            cylinder(4, 20);
            pop();
            push();
            translate(12, -10, 15);
            cylinder(4, 20);
            pop();
            break;

        // --- PERRO ---
        case "perro":
            // Animación: cola, orejas, respiración
            let dogBreathe = sin(breatheCycle) * 0.06;
            let dogTailWag = sin(tailWag * 2) * 0.6;

            // Cuerpo con respiración
            fill(200, 170, 100);
            push();
            scale(1, 0.7 + dogBreathe, 1.5);
            sphere(20);
            pop();

            // Cabeza
            push();
            translate(0, -5, 35);
            scale(1 + dogBreathe, 1 + dogBreathe * 0.5, 1 + dogBreathe);
            sphere(16);
            pop();

            // Orejas caídas con movimiento
            fill(180, 150, 80);
            push();
            translate(-12, -15, 30);
            rotateZ(0.3 + sin(tailWag) * 0.1);
            scale(1, 2, 0.6);
            sphere(8);
            pop();
            push();
            translate(12, -15, 30);
            rotateZ(-0.3 - sin(tailWag) * 0.1);
            scale(1, 2, 0.6);
            sphere(8);
            pop();

            // Hocico
            fill(210, 180, 120);
            push();
            translate(0, -2, 48);
            scale(1.2, 0.8, 1.5);
            sphere(8);
            pop();

            // Nariz brillante
            fill(30, 20, 10);
            push();
            translate(0, -2, 56);
            sphere(4);
            pop();

            // Ojos con brillo
            fill(80, 50, 20);
            push();
            translate(-6, -6, 50);
            sphere(4);
            pop();
            push();
            translate(6, -6, 50);
            sphere(4);
            pop();
            fill(255, 255, 255, 100);
            push();
            translate(-5, -7, 52);
            sphere(1.5);
            pop();
            push();
            translate(7, -7, 52);
            sphere(1.5);
            pop();

            // Cola moviéndose
            fill(190, 160, 90);
            push();
            translate(0, 5, -35);
            rotateZ(dogTailWag);
            rotateX(sin(tailWag) * 0.3);
            cylinder(4, 30);
            pop();
            break;

        // --- RANA ---
        case "rana":
            // Animación: salto, ojos, respiración
            let hop = abs(sin(jumpCycle)) * 8;
            let eyePulse = sin(breatheCycle) * 0.1;

            push();
            translate(0, -hop * 2, 0);

            // Cuerpo
            fill(50, 200, 50);
            push();
            scale(1.4, 0.6 + eyePulse, 1);
            sphere(20);
            pop();

            // Cabeza
            push();
            translate(0, -3, 30);
            scale(1.2, 0.7, 0.8);
            sphere(15);
            pop();

            // Ojos saltones
            fill(50, 220, 50);
            push();
            translate(-10, -6, 35);
            scale(1 + eyePulse, 1 + eyePulse, 1);
            sphere(9);
            pop();
            push();
            translate(10, -6, 35);
            scale(1 + eyePulse, 1 + eyePulse, 1);
            sphere(9);
            pop();

            // Blancos de los ojos
            fill(255);
            push();
            translate(-10, -6, 41);
            sphere(5);
            pop();
            push();
            translate(10, -6, 41);
            sphere(5);
            pop();

            // Pupilas que siguen algo
            fill(0, 50, 50);
            let pupilOffset = sin(frameCount * 0.02) * 2;
            push();
            translate(-10 + pupilOffset, -6, 45);
            sphere(3);
            pop();
            push();
            translate(10 + pupilOffset, -6, 45);
            sphere(3);
            pop();

            // Patas traseras
            fill(60, 180, 60);
            push();
            translate(-18, 12, -5);
            rotateZ(0.5 + hop * 0.02);
            cylinder(5, 22);
            pop();
            push();
            translate(18, 12, -5);
            rotateZ(-0.5 - hop * 0.02);
            cylinder(5, 22);
            pop();

            // Patas delanteras
            push();
            translate(-12, 8, 10);
            cylinder(3, 15);
            pop();
            push();
            translate(12, 8, 10);
            cylinder(3, 15);
            pop();

            pop();
            break;

        // --- CABALLO ---
        case "caballo":
            // Animación: crin, movimiento de cabeza
            let headBob = sin(walkCycle * 0.5) * 0.1;

            // Cuerpo
            fill(140, 100, 200);
            push();
            scale(1, 0.8, 1.6);
            sphere(22);
            pop();

            // Cuello con movimiento
            push();
            translate(0, 12, 30);
            rotateZ(headBob * 2);
            rotateX(-0.3);
            cylinder(10, 30);
            pop();

            // Cabeza
            push();
            translate(0, 30 + headBob * 5, 38);
            rotateZ(headBob);
            sphere(14);
            pop();

            // Crin con movimiento
            fill(100, 60, 160);
            push();
            translate(0, 20, 25);
            rotateX(0.3);
            for (let i = -2; i <= 2; i++) {
                push();
                translate(i * 3, 0, 0);
                rotateZ(sin(flyCycle + i) * 0.15);
                cylinder(2, 25);
                pop();
            }
            pop();

            // Ojos
            fill(40, 30, 50);
            push();
            translate(-5, 28, 48);
            sphere(3);
            pop();
            push();
            translate(5, 28, 48);
            sphere(3);
            pop();

            // Orejas
            fill(120, 80, 160);
            push();
            translate(-6, 36, 32);
            rotateZ(-0.3);
            cone(4, 10);
            pop();
            push();
            translate(6, 36, 32);
            rotateZ(0.3);
            cone(4, 10);
            pop();

            // Patas con movimiento
            fill(130, 90, 190);
            let legMove = sin(walkCycle) * 0.1;
            push();
            translate(-14, -8, -20);
            rotateX(legMove);
            cylinder(5, 22);
            pop();
            push();
            translate(14, -8, -20);
            rotateX(-legMove);
            cylinder(5, 22);
            pop();
            push();
            translate(-14, -8, 20);
            rotateX(-legMove);
            cylinder(5, 22);
            pop();
            push();
            translate(14, -8, 20);
            rotateX(legMove);
            cylinder(5, 22);
            pop();
            break;

        // --- BARCO ---
        case "barco":
            // Animación: balanceo en el agua
            let rock = sin(breatheCycle * 0.5) * 0.08;
            let flagWave = sin(flyCycle) * 0.3;

            push();
            rotateX(rock);
            rotateZ(rock * 0.5);

            // Casco
            fill(100, 120, 140);
            push();
            rotateX(PI / 12);
            box(90, 30, 50);
            pop();

            // Cubierta
            fill(140, 160, 180);
            push();
            translate(0, -15, 0);
            box(70, 8, 45);
            pop();

            // Mástil
            fill(80, 60, 40);
            push();
            translate(0, -50, 0);
            cylinder(4, 60);
            pop();

            // Vela con ondulación
            fill(240, 240, 220, 200);
            push();
            translate(0, -40, 0);
            rotateX(PI / 6 + sin(flyCycle) * 0.1);
            scale(1, 1 + sin(flagWave) * 0.1, 1);
            box(3, 40, 30);
            pop();

            // Bandera
            fill(200, 50, 50);
            push();
            translate(0, -75, 5);
            rotateY(flagWave);
            box(2, 15, 10);
            pop();

            // Cables del mástil
            stroke(60, 50, 40);
            strokeWeight(0.5);
            line(-2, -20, 0, -25, -15, 0);
            line(2, -20, 0, 25, -15, 0);
            line(0, -30, 0, 0, -60, 0);
            noStroke();

            pop();
            break;

        // --- CAMION ---
        case "camion":
            // Animación: motor, ruedas
            let engineVibe = sin(walkCycle * 3) * 0.02;

            // Cabina
            fill(180, 180, 190);
            push();
            translate(-25, -5 + engineVibe * 2, 0);
            box(35, 30, 45);
            pop();

            // Carga
            fill(160, 160, 170);
            push();
            translate(20, 0, 0);
            box(60, 35, 45);
            pop();

            // Ruedas con rotación
            fill(30);
            let truckWheelRot = walkCycle * 1.5;
            push();
            translate(-35, 20, 25);
            rotateX(truckWheelRot);
            cylinder(8, 6);
            pop();
            push();
            translate(-35, 20, -25);
            rotateX(truckWheelRot);
            cylinder(8, 6);
            pop();
            push();
            translate(15, 20, 25);
            rotateX(truckWheelRot);
            cylinder(8, 6);
            pop();
            push();
            translate(15, 20, -25);
            rotateX(truckWheelRot);
            cylinder(8, 6);
            pop();
            push();
            translate(40, 20, 25);
            rotateX(truckWheelRot);
            cylinder(8, 6);
            pop();
            push();
            translate(40, 20, -25);
            rotateX(truckWheelRot);
            cylinder(8, 6);
            pop();

            // Faros
            fill(255, 220, 100);
            push();
            translate(-47, -5, 18);
            sphere(4);
            pop();
            push();
            translate(-47, -5, -18);
            sphere(4);
            pop();

            // Ventana
            fill(100, 150, 200, 150);
            push();
            translate(-35, -12, 0);
            box(20, 12, 38);
            pop();
            break;

        // --- FONDO (escenario vacío) ---
        case "fondo":
            fill(60, 70, 100, 100);
            push();
            rotateX(HALF_PI);
            rotateY(breatheCycle * 0.3);
            torus(40, 5);
            pop();
            fill(100, 120, 160, 60);
            push();
            rotateY(breatheCycle * 0.4);
            torus(60, 3);
            pop();
            fill(80, 90, 120, 40);
            push();
            rotateY(breatheCycle * 0.5);
            torus(80, 2);
            pop();
            break;

        // --- MANO ---
        case "mano":
            // Animación: dedos moviéndose
            let fingerCurl = sin(breatheCycle) * 0.2;
            let thumbMove = sin(tailWag) * 0.3;

            // Palma con respiración
            fill(220, 180, 150);
            push();
            scale(1, 0.5 + fingerCurl * 0.1, 0.8);
            sphere(18);
            pop();

            // Dedos con movimiento
            let fingerAngles = [-0.6, -0.3, 0, 0.3, 0.6];
            for (let i = 0; i < 5; i++) {
                push();
                let curl = sin(breatheCycle + i * 0.5) * 0.15;
                rotateY(fingerAngles[i]);
                translate(0, -18 + curl * 5, 22);
                rotateX(curl);
                cylinder(4, 18);
                pop();
            }

            // Pulgar
            push();
            rotateY(-0.8 + thumbMove);
            translate(-12, -5, 12);
            rotateX(-0.5 + sin(tailWag) * 0.2);
            cylinder(5, 14);
            pop();

            // Líneas de la palma
            stroke(180, 140, 110, 100);
            strokeWeight(0.5);
            for (let i = -2; i <= 2; i++) {
                push();
                translate(i * 4, -5, 12);
                rotateZ(0.2);
                line(0, 0, 0, 8);
                pop();
            }
            noStroke();
            break;

        // --- OBJETO (figura abstracta) ---
        case "objeto":
            // Animación: rotación elegante
            let objRotate = breatheCycle * 0.3;

            fill(100, 200, 255, 150);
            push();
            rotateX(objRotate);
            rotateY(objRotate * 1.3);
            torus(25, 10);
            pop();

            fill(200, 100, 255, 100);
            push();
            rotateX(-objRotate * 0.8);
            rotateZ(objRotate * 0.5);
            torus(40, 5);
            pop();

            fill(100, 255, 200, 80);
            push();
            rotateY(objRotate * 0.6);
            rotateX(objRotate * 0.4);
            torus(15, 3);
            pop();
            break;

        // --- PERSONA ---
        case "persona":
            // Animación: caminar, respiración, brazos
            let walkArm = sin(walkCycle) * 0.4;
            let walkLeg = sin(walkCycle) * 0.3;
            let headBobPerson = sin(walkCycle * 2) * 0.05;
            let breathePerson = sin(breatheCycle) * 0.05;

            push();
            translate(0, headBobPerson * 3, 0);

            // Cabeza
            fill(230, 200, 170);
            push();
            translate(0, -22, 0);
            rotateZ(headBobPerson * 2);
            sphere(14);
            pop();

            // Cabello
            fill(60, 40, 30);
            push();
            translate(0, -28, 0);
            scale(1.1, 0.5, 1.1);
            sphere(14);
            pop();

            // Cuerpo con respiración
            fill(60, 80, 180);
            push();
            translate(0, 5, 0);
            scale(1, 1 + breathePerson, 1);
            box(20, 30, 12);
            pop();

            // Brazos con swing
            fill(220, 190, 160);
            push();
            translate(-15, -5, 0);
            rotateZ(walkArm + 0.2);
            cylinder(4, 22);
            // Mano
            push();
            translate(0, 12, 0);
            sphere(4);
            pop();
            pop();
            push();
            translate(15, -5, 0);
            rotateZ(-walkArm - 0.2);
            cylinder(4, 22);
            // Mano
            push();
            translate(0, 12, 0);
            sphere(4);
            pop();
            pop();

            // Piernas con caminata
            fill(40, 50, 100);
            push();
            translate(-7, 20, 0);
            rotateX(walkLeg);
            cylinder(5, 22);
            pop();
            push();
            translate(7, 20, 0);
            rotateX(-walkLeg);
            cylinder(5, 22);
            pop();

            // Zapatos
            fill(30, 30, 30);
            push();
            translate(-7, 32, walkLeg * 3);
            box(6, 4, 10);
            pop();
            push();
            translate(7, 32, -walkLeg * 3);
            box(6, 4, 10);
            pop();

            pop();
            break;

        // --- DESCONOCIDO / DEFAULT ---
        default:
            fill(80, 80, 100, 100);
            push();
            rotateX(frameCount * 0.01);
            rotateY(frameCount * 0.02);
            box(30);
            pop();
            fill(100, 100, 120, 60);
            push();
            rotateX(-frameCount * 0.015);
            rotateY(frameCount * 0.01);
            box(40);
            pop();
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
    if (isCameraActive && classifier) {
        classifier.classify(video, processPredictionResults);
    } else {
        setTimeout(executeClassificationLoop, 250);
    }
}

function processPredictionResults(err, results) {
    if (err) {
        console.error('Error en clasificación:', err);
        setTimeout(executeClassificationLoop, 500);
        return;
    }
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
