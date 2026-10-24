export const COUNTDOWN_START = 9 * 60 + 59;

export const OBJECTIVES = {
  findExit: "Finde einen Weg aus dem Krankenhaus.",
  findKey: "Durchsuche den Empfang nach einem Schlüssel.",
  openDoor: "Öffne die Tür am Ende des Korridors.",
  enterSide: "Betritt den Nebenflur.",
  inspectDisplay: "Untersuche die Anzeige.",
  returnCorridor: "Kehre zum Hauptkorridor zurück.",
  run: "RENNE ZUM AUSGANG.",
  bedroom: "Finde den Gegenstand auf dem Boden.",
};

export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export class Countdown {
  constructor(initial = COUNTDOWN_START) {
    this.initial = initial;
    this.time = initial;
    this.visible = false;
    this.running = false;
    this.freezeLeft = 0;
    this.glitchLeft = 0;
    this.jumped = false;
  }

  start() {
    this.visible = true;
    this.running = true;
    this.time = this.initial;
    return this;
  }

  update(delta) {
    if (!this.running) return this.time;
    if (this.glitchLeft > 0) {
      this.glitchLeft = Math.max(0, this.glitchLeft - delta);
      return this.time;
    }
    if (this.freezeLeft > 0) {
      this.freezeLeft = Math.max(0, this.freezeLeft - delta);
      return this.time;
    }
    this.time = Math.max(0, this.time - delta);
    return this.time;
  }

  freeze(seconds) {
    this.freezeLeft = Math.max(0, seconds);
  }

  glitch(seconds = 1.2) {
    this.glitchLeft = Math.max(0, seconds);
  }

  jumpTo(seconds) {
    this.time = Math.max(0, seconds);
    this.freezeLeft = 0;
    this.glitchLeft = 0;
    this.jumped = true;
  }

  stop() {
    this.running = false;
  }

  get glitching() {
    return this.glitchLeft > 0;
  }

  get frozen() {
    return this.freezeLeft > 0;
  }

  formatted() {
    if (this.glitchLeft > 0) return "0█:█9:▓▓";
    return formatClock(this.time);
  }
}

export function circleHitsBox(x, z, radius, box) {
  if (box.enabled === false) return false;
  return (
    x + radius > box.minX &&
    x - radius < box.maxX &&
    z + radius > box.minZ &&
    z - radius < box.maxZ
  );
}

export function collidesAt(x, z, radius, colliders) {
  for (const box of colliders) {
    if (circleHitsBox(x, z, radius, box)) return true;
  }
  return false;
}

export function moveWithCollisions(position, dx, dz, radius, colliders) {
  let { x, z } = position;
  const nextX = x + dx;
  if (!collidesAt(nextX, z, radius, colliders)) x = nextX;
  const nextZ = z + dz;
  if (!collidesAt(x, nextZ, radius, colliders)) z = nextZ;
  return { x, z, hitX: x !== nextX, hitZ: z !== nextZ };
}

export function distanceSq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, smoothing, delta) {
  return lerp(current, target, 1 - Math.exp(-smoothing * delta));
}

export function createInitialGameState() {
  return {
    phase: "menu",
    hasKey: false,
    keyPickedUp: false,
    doorOpen: false,
    countdownStarted: false,
    anomalyTriggered: false,
    chaseActive: false,
    chaseFailed: false,
    bedroomEntered: false,
    memoryFound: false,
    finished: false,
    objective: OBJECTIVES.findExit,
    inspected: {
      file: false,
      note: false,
      phone: false,
      chair: false,
      display: false,
      toy: false,
    },
  };
}
