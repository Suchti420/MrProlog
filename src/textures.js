import * as THREE from "three";

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function canvas(size = 256, height = size) {
  const element = document.createElement("canvas");
  element.width = size;
  element.height = height;
  return element;
}

function finish(element, { repeat = [1, 1], colorSpace = true } = {}) {
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  if (colorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function addNoise(ctx, width, height, amount, seed) {
  const random = seededRandom(seed);
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (random() * 2 - 1) * amount;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  ctx.putImageData(image, 0, 0);
}

function blotches(ctx, width, height, random, count, colors, maxRadius) {
  for (let i = 0; i < count; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const r = maxRadius * (0.2 + random() * 0.8);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    const color = colors[Math.floor(random() * colors.length)];
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function makeWallTexture(seed = 11) {
  const width = 512;
  const height = 512;
  const element = canvas(width, height);
  const ctx = element.getContext("2d");
  const random = seededRandom(seed);
  ctx.fillStyle = "#4c554b";
  ctx.fillRect(0, 0, width, height);

  blotches(ctx, width, height, random, 40, [
    "rgba(30,37,31,0.20)",
    "rgba(92,102,83,0.12)",
    "rgba(18,24,21,0.16)",
    "rgba(133,133,105,0.08)",
  ], 150);

  for (let i = 0; i < 24; i += 1) {
    const x = random() * width;
    const w = 1 + random() * 9;
    const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
    gradient.addColorStop(0, "rgba(20,26,22,0)");
    gradient.addColorStop(0.5, `rgba(20,26,22,${0.05 + random() * 0.09})`);
    gradient.addColorStop(1, "rgba(20,26,22,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, w, height);
  }

  ctx.fillStyle = "rgba(21,27,23,0.35)";
  ctx.fillRect(0, height * 0.79, width, height * 0.21);
  ctx.fillStyle = "rgba(177,181,154,0.08)";
  ctx.fillRect(0, height * 0.78, width, 3);

  for (let i = 0; i < 9; i += 1) {
    ctx.strokeStyle = `rgba(24,29,25,${0.14 + random() * 0.18})`;
    ctx.lineWidth = 0.5 + random();
    ctx.beginPath();
    let x = random() * width;
    let y = random() * height;
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j += 1) {
      x += (random() - 0.5) * 46;
      y += random() * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  addNoise(ctx, width, height, 24, seed + 5);
  return finish(element);
}

export function makeFloorTexture(seed = 21) {
  const size = 512;
  const element = canvas(size, size);
  const ctx = element.getContext("2d");
  const random = seededRandom(seed);
  ctx.fillStyle = "#2f342f";
  ctx.fillRect(0, 0, size, size);

  const tile = 64;
  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) {
      const shade = 41 + Math.floor(random() * 19);
      ctx.fillStyle = `rgb(${shade + 4},${shade + 8},${shade + 2})`;
      ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
      ctx.fillStyle = "rgba(130,139,115,0.05)";
      ctx.fillRect(x + 5, y + 5, tile - 12, 2);
    }
  }

  blotches(ctx, size, size, random, 38, [
    "rgba(18,22,17,0.30)",
    "rgba(11,13,11,0.28)",
    "rgba(74,78,58,0.13)",
    "rgba(70,39,28,0.10)",
  ], 120);

  for (let i = 0; i < 12; i += 1) {
    const x = random() * size;
    const y = random() * size;
    ctx.strokeStyle = `rgba(20,24,20,${0.16 + random() * 0.22})`;
    ctx.lineWidth = 0.7 + random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 80, y + (random() - 0.5) * 80);
    ctx.stroke();
  }

  addNoise(ctx, size, size, 18, seed + 3);
  return finish(element, { repeat: [5, 5] });
}

export function makeCeilingTexture(seed = 31) {
  const size = 256;
  const element = canvas(size, size);
  const ctx = element.getContext("2d");
  const random = seededRandom(seed);
  ctx.fillStyle = "#30352f";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(11,14,12,0.5)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= size; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y <= size; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  blotches(ctx, size, size, random, 16, ["rgba(15,18,15,0.35)", "rgba(80,80,64,0.08)"], 70);
  addNoise(ctx, size, size, 12, seed + 1);
  return finish(element, { repeat: [4, 4] });
}

export function makeMetalTexture(seed = 41) {
  const width = 256;
  const height = 512;
  const element = canvas(width, height);
  const ctx = element.getContext("2d");
  const random = seededRandom(seed);
  ctx.fillStyle = "#6a6f64";
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 180; i += 1) {
    const y = random() * height;
    ctx.fillStyle = `rgba(${random() > 0.5 ? "220,224,210" : "20,24,20"},${random() * 0.055})`;
    ctx.fillRect(0, y, width, 1);
  }
  blotches(ctx, width, height, random, 14, ["rgba(40,42,34,0.22)", "rgba(142,124,88,0.10)"], 45);
  addNoise(ctx, width, height, 14, seed + 7);
  return finish(element);
}

export function makePaperTexture(seed = 51) {
  const width = 256;
  const height = 320;
  const element = canvas(width, height);
  const ctx = element.getContext("2d");
  const random = seededRandom(seed);
  ctx.fillStyle = "#b8b6a3";
  ctx.fillRect(0, 0, width, height);
  for (let y = 28; y < height - 20; y += 15) {
    ctx.fillStyle = "rgba(53,56,49,0.18)";
    ctx.fillRect(18, y, width - 36, 1);
  }
  blotches(ctx, width, height, random, 9, ["rgba(98,87,55,0.12)"], 45);
  addNoise(ctx, width, height, 9, seed);
  return finish(element);
}

export function makeDoorTexture(seed = 61) {
  const width = 256;
  const height = 512;
  const element = canvas(width, height);
  const ctx = element.getContext("2d");
  const random = seededRandom(seed);
  ctx.fillStyle = "#4a554b";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(23,29,24,0.38)";
  ctx.fillRect(0, 0, 18, height);
  ctx.fillRect(width - 18, 0, 18, height);
  ctx.fillRect(0, 0, width, 20);
  ctx.fillRect(0, height - 22, width, 22);
  ctx.fillStyle = "rgba(155,166,140,0.08)";
  ctx.fillRect(24, 22, 3, height - 46);
  ctx.fillStyle = "rgba(22,27,23,0.5)";
  ctx.fillRect(34, height * 0.56, width - 68, 3);
  ctx.fillStyle = "rgba(18,23,20,0.42)";
  ctx.fillRect(44, height * 0.08, width - 88, height * 0.22);
  ctx.fillStyle = "#161d1b";
  ctx.fillRect(58, height * 0.095, width - 116, height * 0.19);
  ctx.fillStyle = "rgba(100,124,112,0.18)";
  ctx.fillRect(64, height * 0.102, width - 128, height * 0.175);
  ctx.fillStyle = "rgba(190,196,170,0.2)";
  ctx.fillRect(width - 52, height * 0.53, 12, 4);
  ctx.fillRect(width - 52, height * 0.5, 4, 12);
  blotches(ctx, width, height, random, 10, ["rgba(40,30,18,0.16)", "rgba(12,16,13,0.16)"], 50);
  addNoise(ctx, width, height, 16, seed);
  return finish(element);
}

export function makeCurtainTexture(seed = 71) {
  const width = 128;
  const height = 256;
  const element = canvas(width, height);
  const ctx = element.getContext("2d");
  const random = seededRandom(seed);
  ctx.fillStyle = "#78806c";
  ctx.fillRect(0, 0, width, height);
  for (let x = 0; x < width; x += 8) {
    const gradient = ctx.createLinearGradient(x, 0, x + 8, 0);
    gradient.addColorStop(0, "rgba(20,26,21,0.22)");
    gradient.addColorStop(0.5, "rgba(190,196,173,0.09)");
    gradient.addColorStop(1, "rgba(20,26,21,0.26)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, 8, height);
  }
  blotches(ctx, width, height, random, 8, ["rgba(50,47,32,0.18)"], 25);
  addNoise(ctx, width, height, 12, seed);
  return finish(element);
}

export function makeLabelTexture(text, options = {}) {
  const {
    width = 512,
    height = 160,
    background = "#223026",
    foreground = "#c9d5bb",
    border = "#7c8d77",
    fontSize = 54,
    font = "700 54px 'Arial Narrow', Arial, sans-serif",
    letterSpacing = 6,
    subtext = "",
  } = options;
  const element = canvas(width, height);
  const ctx = element.getContext("2d");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, width - 16, height - 16);

  ctx.fillStyle = foreground;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${letterSpacing}px`;
  ctx.fillText(text, width / 2, subtext ? height * 0.42 : height / 2);
  if (subtext) {
    ctx.font = `400 ${Math.round(fontSize * 0.34)}px 'Courier New', monospace`;
    ctx.fillStyle = "rgba(201,213,187,0.62)";
    ctx.fillText(subtext, width / 2, height * 0.73);
  }
  const random = seededRandom(text.length * 17 + width);
  blotches(ctx, width, height, random, 7, ["rgba(15,20,16,0.15)", "rgba(200,210,180,0.045)"], 40);
  addNoise(ctx, width, height, 8, 13);
  return finish(element, { repeat: [1, 1] });
}

export function makeCountdownCanvas() {
  const element = canvas(512, 256);
  return element;
}

export function paintCountdown(element, text, glitch = false) {
  const ctx = element.getContext("2d");
  ctx.fillStyle = "#070b08";
  ctx.fillRect(0, 0, element.width, element.height);
  ctx.strokeStyle = "#242e26";
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, element.width - 10, element.height - 10);

  ctx.fillStyle = "rgba(180,61,48,0.35)";
  ctx.font = "500 22px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillText("RESTZEIT", 30, 48);
  ctx.fillStyle = "#a7342b";
  ctx.font = "700 90px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, element.width / 2, 150);
  ctx.fillStyle = "rgba(180,61,48,0.34)";
  ctx.font = "500 17px 'Courier New', monospace";
  ctx.fillText("BITTE BLEIBEN SIE RUHIG", element.width / 2, 207);

  if (glitch) {
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = `rgba(190,220,200,${0.05 + Math.random() * 0.08})`;
      ctx.fillRect(0, Math.random() * element.height, element.width, 1 + Math.random() * 5);
    }
  }
  return element;
}

export function makeStainTexture(seed = 91) {
  const size = 256;
  const element = canvas(size, size);
  const ctx = element.getContext("2d");
  const random = seededRandom(seed);
  ctx.clearRect(0, 0, size, size);
  blotches(ctx, size, size, random, 26, [
    "rgba(28,20,12,0.14)",
    "rgba(15,18,13,0.18)",
    "rgba(72,35,24,0.10)",
  ], 90);
  const texture = finish(element);
  return texture;
}
