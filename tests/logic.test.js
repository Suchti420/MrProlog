import { describe, expect, it } from "vitest";
import {
  collidesAt,
  Countdown,
  COUNTDOWN_START,
  createInitialGameState,
  formatClock,
  moveWithCollisions,
} from "../src/logic.js";

describe("formatClock", () => {
  it("formats the opening countdown", () => {
    expect(formatClock(599)).toBe("09:59");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(61)).toBe("01:01");
  });

  it("never renders negative time", () => {
    expect(formatClock(-12)).toBe("00:00");
    expect(formatClock(Number.NaN)).toBe("00:00");
  });
});

describe("Countdown", () => {
  it("starts at 09:59 and ticks down", () => {
    const countdown = new Countdown().start();
    expect(countdown.visible).toBe(true);
    countdown.update(1);
    expect(countdown.formatted()).toBe("09:58");
  });

  it("freezes during story anomalies", () => {
    const countdown = new Countdown().start();
    countdown.update(2);
    countdown.freeze(1.5);
    countdown.update(0.75);
    expect(countdown.formatted()).toBe("09:57");
    countdown.update(0.75);
    countdown.update(1);
    expect(countdown.formatted()).toBe("09:56");
  });

  it("shows impossible glyphs while glitching", () => {
    const countdown = new Countdown().start();
    countdown.glitch(0.5);
    expect(countdown.formatted()).toBe("0█:█9:▓▓");
    countdown.update(0.6);
    expect(countdown.formatted()).toBe("09:59");
  });

  it("can jump to an unexplained value", () => {
    const countdown = new Countdown().start();
    countdown.jumpTo(253);
    expect(countdown.formatted()).toBe("04:13");
    countdown.update(1);
    expect(countdown.formatted()).toBe("04:12");
  });

  it("does not end the game at zero", () => {
    const countdown = new Countdown(2).start();
    countdown.update(10);
    expect(countdown.formatted()).toBe("00:00");
    expect(countdown.running).toBe(true);
  });

  it("uses the requested initial value", () => {
    expect(COUNTDOWN_START).toBe(599);
  });
});

describe("collision", () => {
  const wall = { minX: 2, maxX: 3, minZ: -1, maxZ: 1, enabled: true };

  it("detects a circle overlapping a box", () => {
    expect(collidesAt(1.8, 0, 0.3, [wall])).toBe(true);
    expect(collidesAt(1.6, 0, 0.3, [wall])).toBe(false);
  });

  it("ignores disabled colliders", () => {
    expect(collidesAt(2.5, 0, 0.3, [{ ...wall, enabled: false }])).toBe(false);
  });

  it("slides along a blocked axis", () => {
    const result = moveWithCollisions({ x: 1.65, z: 0 }, 0.2, 0.2, 0.2, [wall]);
    expect(result.x).toBeCloseTo(1.65);
    expect(result.z).toBeCloseTo(0.2);
    expect(result.hitX).toBe(true);
  });

  it("moves freely when there is no obstacle", () => {
    const result = moveWithCollisions({ x: 0, z: 0 }, 0.3, -0.2, 0.3, [wall]);
    expect(result.x).toBeCloseTo(0.3);
    expect(result.z).toBeCloseTo(-0.2);
  });
});

describe("initial game state", () => {
  it("contains no completed progression flags", () => {
    const state = createInitialGameState();
    expect(state.hasKey).toBe(false);
    expect(state.doorOpen).toBe(false);
    expect(state.chaseActive).toBe(false);
    expect(state.finished).toBe(false);
    expect(Object.values(state.inspected).every((value) => value === false)).toBe(true);
  });
});
