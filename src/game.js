import * as THREE from "three";
import { AudioEngine } from "./audio.js";
import {
  clamp,
  Countdown,
  COUNTDOWN_START,
  createInitialGameState,
  moveWithCollisions,
  OBJECTIVES,
} from "./logic.js";
import { Player } from "./player.js";
import { UI } from "./ui.js";
import { World } from "./world.js";

const HOSPITAL_FOG = 0x050807;
const BEDROOM_FOG = 0x160f0b;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(HOSPITAL_FOG);
    this.scene.fog = new THREE.FogExp2(HOSPITAL_FOG, 0.057);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 70);
    this.camera.position.set(0.55, 2.0, 16.3);
    this.camera.lookAt(0, 1.3, 2);

    this.clock = new THREE.Clock();
    this.audio = new AudioEngine();
    this.ui = new UI();
    this.world = new World(this.scene);
    this.player = new Player(this.scene, this.world, this.audio);
    this.player.setCamera(this.camera);
    this.player.root.visible = false;

    this.state = createInitialGameState();
    this.state.enteredSide = false;
    this.countdown = new Countdown();
    this.mode = "boot";
    this.modeBeforePause = null;
    this.modeBeforeReading = null;
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
    };
    this.pending = [];
    this.currentInteractable = null;
    this.pointerLocked = false;
    this.lastTimerPaint = "";
    this.introTime = 0;
    this.titleShown = false;
    this.introEnded = false;
    this.runStarted = false;
    this.menuTime = 0;
    this.chaseGrace = 0;
    this.heartbeatTimer = 0;
    this.dangerValue = 0;
    this.bedroomMemoryTriggered = false;
    this.touch = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
    };
    this.isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  async init() {
    this.bindUI();
    this.bindInput();
    this.bindPointerLock();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && ["playing", "anomaly", "chase", "bedroom"].includes(this.mode)) this.pauseGame();
    });

    this.ui.setStamina(1);
    this.ui.fadeTo(1, 0);
    this.ui.hideBoot();
    this.mode = "menu";
    this.ui.showMenu();
    this.setMenuCamera();
    this.clock.start();
    this.renderLoop();
    this.exposeDebugApi();
    this.ui.fadeTo(0, 2200);

    window.addEventListener("pointerdown", () => this.audio.init(), { once: true });
    window.addEventListener("keydown", () => this.audio.init(), { once: true });
  }

  bindUI() {
    const click = (id, handler) => {
      const element = document.getElementById(id);
      if (element) element.addEventListener("click", handler);
    };

    click("btn-start", () => {
      this.audio.init();
      this.audio.ui();
      this.startGame();
    });
    click("btn-controls", () => {
      this.audio.init();
      this.audio.ui();
      this.ui.showPanel("panel-controls");
    });
    click("btn-settings", () => {
      this.audio.init();
      this.audio.ui();
      this.ui.showPanel("panel-settings");
    });
    document.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => {
        this.audio.ui();
        this.ui.hidePanel(button.dataset.close);
      });
    });
    click("btn-resume", () => this.resumeGame());
    click("btn-restart", () => this.startGame(true));
    click("btn-pause-menu", () => this.returnToMenu());
    click("btn-retry", () => this.retryChase());
    click("btn-fail-menu", () => this.returnToMenu());
    click("btn-ending-restart", () => this.startGame(true));
    click("btn-ending-menu", () => this.returnToMenu());
    click("btn-skip-intro", () => this.skipIntro());
    click("btn-doc-close", () => this.closeDocument());

    click("vol-master", () => {});
    for (const [id, name] of [["vol-master", "master"], ["vol-ambient", "ambient"], ["vol-fx", "fx"]]) {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener("input", () => this.audio.setVolume(name, Number(input.value)));
      }
    }

    document.getElementById("panel-controls")?.addEventListener("click", (event) => {
      if (event.target.id === "panel-controls") this.ui.hidePanel("panel-controls");
    });
    document.getElementById("panel-settings")?.addEventListener("click", (event) => {
      if (event.target.id === "panel-settings") this.ui.hidePanel("panel-settings");
    });
    document.getElementById("document")?.addEventListener("click", (event) => {
      if (event.target.id === "document") this.closeDocument();
    });
  }

  bindInput() {
    window.addEventListener("keydown", (event) => {
      const code = event.code;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(code)) event.preventDefault();

      if (code === "Escape") {
        event.preventDefault();
        if (this.ui.docOpen) {
          this.closeDocument();
          return;
        }
        if (this.ui.anyPanelOpen()) {
          this.ui.hidePanels();
          return;
        }
        if (["playing", "anomaly", "chase", "bedroom"].includes(this.mode)) this.pauseGame();
        else if (this.mode === "paused") this.resumeGame();
        return;
      }

      if (this.mode === "fail" && code === "KeyR") {
        this.retryChase();
        return;
      }

      if (this.ui.docOpen && (code === "KeyE" || code === "Enter")) {
        event.preventDefault();
        this.closeDocument();
        return;
      }

      if (code === "KeyW" || code === "ArrowUp") this.keys.forward = true;
      if (code === "KeyS" || code === "ArrowDown") this.keys.backward = true;
      if (code === "KeyA" || code === "ArrowLeft") this.keys.left = true;
      if (code === "KeyD" || code === "ArrowRight") this.keys.right = true;
      if (code === "ShiftLeft" || code === "ShiftRight") this.keys.sprint = true;
      if (code === "Space" && !event.repeat) {
        if (["playing", "chase", "bedroom"].includes(this.mode) && !this.ui.docOpen) this.player.requestDodge();
      }
      if (code === "KeyE" && !event.repeat) {
        if (["playing", "chase", "bedroom"].includes(this.mode) && !this.ui.docOpen) this.tryInteract();
      }
    });

    window.addEventListener("keyup", (event) => {
      const code = event.code;
      if (code === "KeyW" || code === "ArrowUp") this.keys.forward = false;
      if (code === "KeyS" || code === "ArrowDown") this.keys.backward = false;
      if (code === "KeyA" || code === "ArrowLeft") this.keys.left = false;
      if (code === "KeyD" || code === "ArrowRight") this.keys.right = false;
      if (code === "ShiftLeft" || code === "ShiftRight") this.keys.sprint = false;
    });

    window.addEventListener("blur", () => {
      this.keys.forward = false;
      this.keys.backward = false;
      this.keys.left = false;
      this.keys.right = false;
      this.keys.sprint = false;
    });

    this.canvas.addEventListener("click", () => {
      if (["playing", "anomaly", "chase", "bedroom"].includes(this.mode) && !this.ui.docOpen) {
        this.requestPointerLock();
      }
    });

    document.addEventListener("mousemove", (event) => {
      if (!this.pointerLocked) return;
      if (!["playing", "anomaly", "chase", "bedroom"].includes(this.mode)) return;
      this.player.rotateCamera(event.movementX || 0, event.movementY || 0);
    });

    this.bindTouchControls();
  }

  bindTouchControls() {
    if (!this.isTouch) return;
    const makeButton = (label, key) => {
      const button = document.createElement("button");
      button.className = "touch-button";
      button.type = "button";
      button.textContent = label;
      button.style.cssText = `
        position:fixed;z-index:8;width:54px;height:54px;border-radius:50%;
        border:1px solid rgba(210,220,205,.28);background:rgba(4,7,5,.55);
        color:#d7ddd6;font-family:monospace;font-size:11px;pointer-events:auto;
        touch-action:none;`;
      document.body.append(button);
      const down = (event) => {
        event.preventDefault();
        this.audio.init();
        if (key === "interact") {
          this.tryInteract();
        } else if (key === "sprint") {
          this.keys.sprint = true;
        } else {
          this.keys[key] = true;
        }
      };
      const up = (event) => {
        event.preventDefault();
        if (key === "sprint") this.keys.sprint = false;
        else if (key !== "interact") this.keys[key] = false;
      };
      button.addEventListener("pointerdown", down);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
      button.addEventListener("pointerleave", up);
      return button;
    };
    this.touchButtons = [];
    const positions = [
      ["W", "forward", [76, -128]],
      ["A", "left", [18, -70]],
      ["S", "backward", [76, -70]],
      ["D", "right", [134, -70]],
      ["E", "interact", [-20, -70]],
    ];
    for (const [label, key, [left, bottom]] of positions) {
      const button = makeButton(label, key);
      button.style.left = `${left}px`;
      button.style.bottom = `${Math.abs(bottom)}px`;
      button.classList.add("hidden");
      this.touchButtons.push(button);
    }
    const sprint = makeButton("RUN", "sprint");
    sprint.style.right = "24px";
    sprint.style.bottom = "112px";
    sprint.classList.add("hidden");
    this.touchButtons.push(sprint);
    this.touchLook = null;
    this.canvas.addEventListener("pointerdown", (event) => {
      if (!this.isTouch || event.pointerType !== "touch") return;
      this.touchLook = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.touchLook || this.touchLook.id !== event.pointerId) return;
      const dx = event.clientX - this.touchLook.x;
      const dy = event.clientY - this.touchLook.y;
      this.touchLook.x = event.clientX;
      this.touchLook.y = event.clientY;
      this.player.rotateCamera(dx * 1.5, dy * 1.5, 0.0025);
    });
    const clearLook = (event) => {
      if (this.touchLook?.id === event.pointerId) this.touchLook = null;
    };
    this.canvas.addEventListener("pointerup", clearLook);
    this.canvas.addEventListener("pointercancel", clearLook);
  }

  showTouchControls(show) {
    for (const button of this.touchButtons || []) button.classList.toggle("hidden", !show);
  }

  bindPointerLock() {
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked && ["playing", "anomaly", "chase", "bedroom"].includes(this.mode) && !this.ui.docOpen) {
        this.ui.showLockHint();
      } else {
        this.ui.hideLockHint();
      }
    });
  }

  requestPointerLock() {
    if (this.isTouch || document.pointerLockElement === this.canvas) return;
    try {
      const result = this.canvas.requestPointerLock?.();
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch {
      /* pointer lock can be denied without breaking the game */
    }
  }

  releasePointerLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }

  setMenuCamera() {
    this.camera.position.set(0.55, 2.0, 16.3);
    this.camera.lookAt(0, 1.3, 2.0);
  }

  startGame(fromRestart = false) {
    if (!["menu", "paused", "fail", "ending"].includes(this.mode) && !fromRestart) return;
    this.audio.init();
    this.ui.hideBoot();
    this.ui.hideMenu();
    this.ui.hidePause();
    this.ui.hideFail();
    this.ui.ending.classList.add("hidden");
    this.ui.ending.classList.remove("visible");
    this.ui.hidePanels();
    this.ui.closeDocument();
    this.releasePointerLock();
    if (this.runStarted) this.rebuildWorld();
    this.runStarted = true;
    this.resetRunState();
    this.scene.background.setHex(HOSPITAL_FOG);
    this.scene.fog.color.setHex(HOSPITAL_FOG);
    this.scene.fog.density = 0.057;
    this.player.root.visible = true;
    this.player.teleport(0, 15.4, 0);
    this.player.setLying(1);
    this.player.resetStamina();
    this.player.cameraShake = 0;
    this.camera.position.set(0.7, 0.78, 18.15);
    this.camera.lookAt(0, 0.7, 13.8);
    this.showTouchControls(false);
    this.ui.showIntroHud();
    this.ui.fadeTo(0, 2400);
    this.ui.showSkipIntro();
    this.ui.hideTitleCard();
    this.mode = "intro";
    this.introTime = 0;
    this.titleShown = false;
    this.introEnded = false;
    this.audio.startHospitalAmbience();
    this.audio.heartbeat(0.045, 62);
    this.schedule(4.0, () => {
      this.ui.showTitleCard();
      this.titleShown = true;
    });
    this.schedule(4.8, () => this.voice("Noah."));
    this.schedule(7.6, () => this.voice("Du bist spät dran."));
    this.schedule(10.6, () => this.voice("Du kennst den Weg."));
    this.schedule(8.2, () => {
      this.ui.hideTitleCard();
      this.titleShown = false;
    });
    this.schedule(7.7, () => this.beginPlay());
    this.ui.fadeTo(0, 2400);
  }

  resetRunState() {
    this.state = createInitialGameState();
    this.state.enteredSide = false;
    this.countdown = new Countdown();
    this.lastTimerPaint = "";
    this.currentInteractable = null;
    this.pending = [];
    this.dangerValue = 0;
    this.chaseGrace = 0;
    this.heartbeatTimer = 0;
    this.bedroomMemoryTriggered = false;
    this.ui.setTimer("00:09:59");
    this.ui.setTimerVisible(false);
    this.ui.setTimer("00:09:59");
    this.ui.setDanger(0);
    this.ui.hideChapterNote();
    this.ui.hideLockHint();
    this.ui.hideInteraction();
    this.ui.setStamina(1);
  }

  beginPlay() {
    if (this.introEnded) return;
    this.introEnded = true;
    this.player.setLying(0);
    this.ui.hideSkipIntro();
    this.ui.hideTitleCard();
    this.ui.showGameplayHud();
    this.ui.setObjective(OBJECTIVES.findExit);
    this.mode = "playing";
    if (this.isTouch) this.showTouchControls(true);
    this.schedule(2.2, () => {
      if (this.mode === "playing" && !this.state.keyPickedUp) {
        this.ui.showToast("Durchsuche den Empfang und den Untersuchungsraum.", 3600);
      }
    });
    if (!this.isTouch) {
      setTimeout(() => {
        if (["playing", "anomaly", "chase", "bedroom"].includes(this.mode) && !this.ui.docOpen) {
          this.ui.showLockHint();
        }
      }, 1300);
    }
  }

  skipIntro() {
    if (this.mode !== "intro" || this.introEnded) return;
    this.pending = [];
    this.introEnded = true;
    this.player.setLying(0);
    this.ui.hideSkipIntro();
    this.ui.hideTitleCard();
    this.ui.showGameplayHud();
    this.ui.setObjective(OBJECTIVES.findExit);
    this.mode = "playing";
    if (this.isTouch) this.showTouchControls(true);
    this.schedule(0.9, () => this.voice("Noah."));
    this.schedule(3.5, () => this.voice("Du bist spät dran."));
    this.schedule(6.5, () => this.voice("Du kennst den Weg."));
    this.schedule(2.2, () => {
      if (this.mode === "playing" && !this.state.keyPickedUp) {
        this.ui.showToast("Durchsuche den Empfang und den Untersuchungsraum.", 3600);
      }
    });
    this.player.updateCamera(0.016, true);
    if (!this.isTouch) this.ui.showLockHint();
  }

  pauseGame() {
    if (!["playing", "anomaly", "chase", "bedroom"].includes(this.mode)) return;
    this.modeBeforePause = this.mode;
    this.mode = "paused";
    this.releasePointerLock();
    this.ui.hideSkipIntro();
    this.ui.showPause();
    this.audio.ui();
  }

  resumeGame() {
    if (this.mode !== "paused") return;
    this.ui.hidePause();
    this.mode = this.modeBeforePause || "playing";
    this.audio.ui();
    this.requestPointerLock();
  }

  returnToMenu() {
    this.audio.ui();
    this.audio.silence(0.5);
    this.releasePointerLock();
    this.pending = [];
    this.mode = "menu";
    this.ui.hidePause();
    this.ui.hideFail();
    this.ui.ending.classList.add("hidden");
    this.ui.ending.classList.remove("visible");
    this.ui.closeDocument();
    this.ui.showMenu();
    this.ui.fadeTo(0, 650);
    this.ui.hideHUD();
    this.showTouchControls(false);
    this.rebuildWorld();
    this.runStarted = false;
    this.resetRunState();
    this.player.root.visible = false;
    this.player.teleport(0, 15.4, 0);
    this.player.setLying(0);
    this.scene.background.setHex(HOSPITAL_FOG);
    this.scene.fog.color.setHex(HOSPITAL_FOG);
    this.scene.fog.density = 0.057;
    this.setMenuCamera();
  }

  rebuildWorld() {
    this.scene.remove(this.world.root);
    this.world.root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of materials) {
        for (const key of ["map", "emissiveMap", "roughnessMap", "normalMap"]) {
          if (material[key]) material[key].dispose();
        }
        material.dispose();
      }
    });
    this.world = new World(this.scene);
    this.player.world = this.world;
    this.currentInteractable = null;
  }

  schedule(delay, fn) {
    this.pending.push({ time: Math.max(0, delay), fn });
  }

  updatePending(delta) {
    if (!this.pending.length) return;
    const ready = [];
    for (const event of this.pending) {
      event.time -= delta;
      if (event.time <= 0) ready.push(event);
    }
    if (!ready.length) return;
    this.pending = this.pending.filter((event) => event.time > 0);
    ready.sort((a, b) => a.time - b.time);
    for (const event of ready) event.fn();
  }

  voice(text, duration = 3400) {
    if (!["playing", "anomaly", "chase", "bedroom"].includes(this.mode)) return;
    this.audio.whisper();
    this.ui.showSubtitle(text, duration, "STIMME");
  }

  updateIntro(delta) {
    this.introTime += delta;
    const t = this.introTime;
    if (t > 2.15 && t < 4.3) {
      const standing = clamp((t - 2.15) / 2.1, 0, 1);
      this.player.setLying(1 - standing);
      const camY = 0.78 + standing * 0.28;
      this.camera.position.y += (camY - this.camera.position.y) * Math.min(1, delta * 2.2);
      this.camera.lookAt(0, 0.7 + standing * 0.25, 13.8);
    }
    if (t >= 4.3 && !this.introEnded) {
      this.camera.position.y += (1.62 - this.camera.position.y) * Math.min(1, delta * 1.2);
      this.camera.position.z += (18.8 - this.camera.position.z) * Math.min(1, delta * 0.8);
      this.camera.lookAt(0, 1.18, 6.5);
    }
    this.updatePending(delta);
  }

  update(delta) {
    if (this.mode === "menu") {
      this.menuTime += delta;
      this.world.update(delta, this.player.position);
      this.camera.position.x = 0.55 + Math.sin(this.menuTime * 0.11) * 0.16;
      this.camera.position.y = 2.0 + Math.sin(this.menuTime * 0.17) * 0.035;
      this.camera.lookAt(Math.sin(this.menuTime * 0.07) * 0.1, 1.3, 2.0);
      return;
    }

    if (this.mode === "intro") {
      this.world.update(delta, this.player.position);
      this.updateIntro(delta);
      return;
    }

    if (this.mode === "paused" || this.mode === "fail") {
      return;
    }

    if (this.mode === "reading") {
      this.world.update(delta, this.player.position);
      this.player.update(delta, this.keys, false);
      return;
    }

    if (this.mode === "ending") {
      this.updatePending(delta);
      this.world.update(delta, this.player.position);
      return;
    }

    if (this.mode === "transition") {
      this.updatePending(delta);
      this.world.update(delta, this.player.position);
      this.player.update(delta, this.keys, false);
      return;
    }

    if (this.mode === "bedroom") {
      this.updatePending(delta);
      this.player.update(delta, this.keys, true);
      this.world.update(delta, this.player.position);
      this.updateInteraction();
      this.ui.setStamina(this.player.getStaminaRatio(), this.player.exhausted);
      return;
    }

    this.updatePending(delta);
    const controlling = this.mode === "playing" || this.mode === "chase";
    this.player.update(delta, this.keys, controlling);
    this.world.update(delta, this.player.position);
    this.updateStaminaUi();
    this.updateCountdown(delta);

    if (this.mode === "playing") {
      this.checkRoomTransitions();
    }
    if (this.mode === "chase") {
      this.updateChase(delta);
    }
    this.updateInteraction();
  }

  updateStaminaUi() {
    this.ui.setStamina(this.player.getStaminaRatio(), this.player.exhausted);
  }

  updateCountdown(delta) {
    if (!this.state.countdownStarted) return;
    this.countdown.update(delta);
    const formatted = this.countdown.formatted();
    this.ui.setTimer(formatted, this.countdown.glitching);
    if (formatted !== this.lastTimerPaint || this.countdown.glitching) {
      this.world.updateCountdown(formatted, this.countdown.glitching);
      this.lastTimerPaint = formatted;
    }
  }

  checkRoomTransitions() {
    if (this.state.doorOpen && !this.state.enteredSide && this.player.position.z < -13.3) {
      this.state.enteredSide = true;
      this.state.objective = OBJECTIVES.inspectDisplay;
      this.ui.setObjective(OBJECTIVES.inspectDisplay, true);
      this.schedule(0.8, () => this.voice("Das war nicht die Tür."));
      this.audio.whisper();
    }

    if (
      this.state.countdownStarted &&
      !this.state.anomalyTriggered &&
      this.state.enteredSide &&
      this.player.position.z > -11.7
    ) {
      this.startAnomaly();
    }
  }

  startAnomaly() {
    if (this.state.anomalyTriggered) return;
    this.state.anomalyTriggered = true;
    this.mode = "anomaly";
    this.ui.hideInteraction();
    this.ui.setObjective("Etwas ist falsch.", true);
    this.audio.staticBurst(1.4, 0.12);
    this.audio.doorSlam();
    this.world.closeDoor();
    this.world.setBlackout(true);
    this.audio.silence(0.9);
    this.audio.staticBurst(1.8, 0.16);
    this.countdown.freeze(1.7);
    this.ui.fadeTo(0.72, 260);
    this.schedule(1.25, () => {
      this.audio.doorSlam();
      this.world.openDoorForChase();
      this.world.setShadowPosition(0, -19.2);
      this.world.setChaseMode(true);
      this.ui.fadeTo(0.2, 900);
    });
    this.schedule(2.3, () => {
      this.audio.stinger();
      this.world.restoreLights();
      this.countdown.jumpTo(4 * 60 + 13);
      this.countdown.glitch(2.4);
      this.ui.fadeTo(0, 700);
      this.ui.showSubtitle("Lauf.", 2600, "STIMME");
    });
    this.schedule(3.15, () => this.startChase());
  }

  startChase() {
    if (this.mode === "fail") return;
    this.mode = "chase";
    this.state.chaseActive = true;
    this.state.objective = OBJECTIVES.run;
    this.player.resetStamina();
    this.chaseGrace = 0.85;
    this.world.setChaseMode(true);
    this.world.openDoorForChase();
    this.world.setShadowPosition(0, -19.4);
    this.audio.chaseStart();
    this.ui.setObjective(OBJECTIVES.run, true);
    this.ui.setDanger(0.34);
    this.ui.setTimer(this.countdown.formatted(), true);
    this.player.cameraShake = 0.2;
    this.requestPointerLock();
  }

  updateChase(delta) {
    if (!this.state.chaseActive) return;
    this.chaseGrace = Math.max(0, this.chaseGrace - delta);
    const shadow = this.world.shadow;
    if (!shadow) return;
    this.world.setChaseMode(true);

    const dx = this.player.position.x - shadow.position.x;
    const dz = this.player.position.z - shadow.position.z;
    const distance = Math.hypot(dx, dz);
    if (this.chaseGrace <= 0 && distance > 0.01) {
      const speed = 3.4;
      const step = Math.min(speed * delta, distance);
      const move = moveWithCollisions(
        { x: shadow.position.x, z: shadow.position.z },
        (dx / distance) * step,
        (dz / distance) * step,
        0.31,
        this.world.colliders
      );
      this.world.setShadowPosition(move.x, move.z);
    }

    this.world.animateShadow(delta, true);
    this.player.cameraShake = clamp(0.3 * (1 - distance / 14), 0.05, 0.3);
    const danger = clamp(1 - distance / 13, 0, 0.72);
    this.dangerValue = danger;
    this.ui.setDanger(danger);
    this.heartbeatTimer -= delta;
    if (this.heartbeatTimer <= 0) {
      this.heartbeatTimer = Math.max(0.55, 1.25 - danger);
      this.audio.heartbeat(0.04 + danger * 0.03, 102);
    }

    if (distance < 1.02) {
      this.failChase();
      return;
    }
    if (this.player.position.z > 16.55) {
      this.startBedroomTransition();
    }
  }

  failChase() {
    if (this.mode === "fail") return;
    this.mode = "fail";
    this.state.chaseFailed = true;
    this.state.chaseActive = false;
    this.releasePointerLock();
    this.world.setChaseMode(false);
    this.audio.fail();
    this.ui.setDanger(0);
    this.ui.fadeTo(0.3, 260);
    setTimeout(() => {
      this.ui.fadeTo(0, 600);
      this.ui.showFail();
    }, 420);
  }

  retryChase() {
    if (this.mode !== "fail") return;
    this.audio.init();
    this.ui.hideFail();
    this.ui.fadeTo(0, 300);
    this.state.chaseFailed = false;
    this.state.anomalyTriggered = true;
    this.state.countdownStarted = true;
    this.mode = "chase";
    this.state.chaseActive = true;
    this.player.teleport(0, -10.7, Math.PI);
    this.player.root.rotation.y = Math.PI;
    this.player.resetStamina();
    this.chaseGrace = 1.15;
    this.countdown.jumpTo(4 * 60 + 13);
    this.ui.setTimerVisible(true);
    this.ui.setObjective(OBJECTIVES.run, true);
    this.ui.setDanger(0.2);
    this.world.openDoorForChase();
    this.world.setChaseMode(true);
    this.world.setShadowPosition(0, -20.2);
    this.world.restoreLights();
    this.audio.chaseStart();
    this.requestPointerLock();
  }

  startBedroomTransition() {
    if (this.mode === "transition" || this.mode === "bedroom") return;
    this.mode = "transition";
    this.state.chaseActive = false;
    this.world.setChaseMode(false);
    this.ui.setDanger(0);
    this.ui.hideInteraction();
    this.ui.setObjective("", false);
    this.countdown.stop();
    this.audio.doorSlam();
    this.audio.silence(1.2);
    this.ui.fadeTo(1, 1700);
    this.pending = [];
    this.schedule(1.9, () => {
      this.world.showBedroom();
      this.player.teleport(0, 4.8, 0);
      this.player.root.rotation.y = Math.PI;
      this.player.resetStamina();
      this.player.setLying(0);
      this.player.root.visible = true;
      this.scene.background.setHex(BEDROOM_FOG);
      this.scene.fog.color.setHex(BEDROOM_FOG);
      this.scene.fog.density = 0.041;
      this.audio.startBedroomAmbience();
      this.ui.setTimerVisible(false);
      this.ui.setObjective(OBJECTIVES.bedroom, true);
      this.ui.fadeTo(0, 2200);
      this.mode = "bedroom";
      this.state.bedroomEntered = true;
      this.schedule(2.6, () => this.ui.showSubtitle("Es riecht nach Staub und Regen.", 3300));
    });
  }

  updateInteraction() {
    if (this.ui.docOpen || !["playing", "chase", "bedroom"].includes(this.mode)) {
      this.ui.hideInteraction();
      this.currentInteractable = null;
      return;
    }
    const forward = this.player.getForward();
    const found = this.world.getNearestInteractable(this.player.position, 2.2, forward);
    this.currentInteractable = found;
    if (!found) {
      this.ui.hideInteraction();
      return;
    }
    let prompt = found.prompt;
    if (found.id === "door") {
      prompt = this.state.hasKey ? "Tür öffnen" : "Tür prüfen";
    }
    this.ui.showInteraction(prompt);
  }

  tryInteract() {
    if (this.ui.docOpen) {
      this.closeDocument();
      return;
    }
    if (!["playing", "chase", "bedroom"].includes(this.mode)) return;
    let interactable = this.currentInteractable;
    if (!interactable || !interactable.enabled) {
      interactable = this.world.getNearestInteractable(this.player.position, 2.5, null);
    }
    if (!interactable) return;
    this.interact(interactable);
  }

  interact(interactable) {
    if (!interactable?.enabled) return;
    const event = interactable.event;
    switch (event) {
      case "keycard":
        this.pickUpKeycard(interactable);
        break;
      case "door":
        this.useDoor();
        break;
      case "file":
        this.openReadingDocument(
          "STAHL, AKTE 03",
          "Patientenakte — Noah Voss",
          [
            { text: "Patient: Noah Voss", delay: 500 },
            { text: "Aufnahmegrund: —", delay: 650, className: "doc-gap" },
            { text: "Beobachtung: Patient berichtet, dass er den Ausgang bereits mehrfach erreicht hat.", delay: 1450, className: "doc-gap" },
            { text: "Nachtrag: Der Korridor wurde nicht verlassen.", delay: 1650, className: "doc-red" },
            { text: "Behandler: [unleserlich]", delay: 1200, className: "doc-label" },
          ],
          { staged: true }
        );
        this.state.inspected.file = true;
        this.audio.paper();
        break;
      case "note":
        this.openReadingDocument(
          "GEFALTETES PAPIER",
          "Notiz",
          [
            { text: "Du musst nicht zurückgehen.", delay: 1200 },
            { text: "Du bist schon hier.", delay: 2400, className: "doc-red doc-gap" },
          ],
          { staged: true }
        );
        this.state.inspected.note = true;
        this.audio.paper();
        break;
      case "phone":
        this.inspectPhone();
        break;
      case "chair":
        this.inspectChair();
        break;
      case "display":
        this.inspectDisplay();
        break;
      case "toy":
        this.inspectToy();
        break;
      default:
        break;
    }
  }

  pickUpKeycard(interactable) {
    if (this.state.keyPickedUp) return;
    this.state.keyPickedUp = true;
    this.state.hasKey = true;
    this.state.objective = OBJECTIVES.openDoor;
    interactable.enabled = false;
    this.world.setKeycardTaken();
    this.audio.pickup();
    this.ui.showToast("ZUGANGSKARTE AUFGENOMMEN");
    this.ui.setObjective(OBJECTIVES.openDoor, true);
    this.ui.hideInteraction();
    this.currentInteractable = null;
  }

  useDoor() {
    if (!this.state.hasKey) {
      this.audio.door(true);
      this.ui.showToast("VERSCHLOSSEN", 1900);
      this.ui.showSubtitle("Verschlossen. Ohne Karte komme ich nicht weiter.", 2600);
      return;
    }
    if (this.state.doorOpen) return;
    this.state.doorOpen = true;
    this.state.objective = OBJECTIVES.enterSide;
    this.world.unlockDoor();
    this.audio.door(false);
    this.ui.showToast("TÜR GEÖFFNET");
    this.ui.setObjective(OBJECTIVES.enterSide, true);
    this.ui.hideInteraction();
    this.currentInteractable = null;
    this.schedule(2.5, () => {
      if (this.mode === "playing" && this.state.enteredSide) this.voice("Du kennst den Weg.");
    });
  }

  openReadingDocument(kicker, title, lines, options = {}) {
    this.modeBeforeReading = this.mode;
    this.mode = "reading";
    this.releasePointerLock();
    this.ui.hideLockHint();
    this.ui.openDocument(kicker, title, lines, options);
  }

  closeDocument() {
    if (!this.ui.docOpen) return;
    this.ui.closeDocument();
    if (this.mode === "reading") {
      this.mode = this.modeBeforeReading || "playing";
      if (!this.isTouch) setTimeout(() => this.ui.showLockHint(), 200);
      this.requestPointerLock();
    }
  }

  inspectPhone() {
    if (this.state.inspected.phone) {
      this.audio.staticBurst(0.45, 0.06);
      return;
    }
    this.state.inspected.phone = true;
    this.audio.staticBurst(1.1, 0.1);
    this.audio.whisper();
    this.schedule(0.7, () => {
      if (["playing", "bedroom"].includes(this.mode)) {
        this.ui.showSubtitle("…Noah…? Hörst du…", 3000, "STIMME · GESTÖRT");
      }
    });
    this.schedule(4.1, () => this.audio.staticBurst(0.5, 0.05));
  }

  inspectChair() {
    if (this.state.inspected.chair) {
      this.audio.giggle();
      return;
    }
    this.state.inspected.chair = true;
    this.audio.giggle();
    this.audio.whisper();
    this.ui.showSubtitle("Ein Kinderlachen. Sehr weit weg.", 3200);
    this.schedule(4.6, () => {
      if (this.mode === "playing") this.audio.staticBurst(0.35, 0.04);
    });
  }

  inspectDisplay() {
    if (this.state.inspected.display) {
      this.audio.staticBurst(0.35, 0.05);
      return;
    }
    this.state.inspected.display = true;
    this.state.countdownStarted = true;
    this.state.objective = OBJECTIVES.returnCorridor;
    this.countdown.start();
    this.ui.setTimerVisible(true);
    this.ui.setTimer(this.countdown.formatted(), false);
    this.ui.showToast("ANZEIGE AKTIV");
    this.audio.staticBurst(0.8, 0.08);
    this.ui.showSubtitle("Die Zeit läuft. Sie lief schon, bevor ich hier war.", 3300);
    this.ui.setObjective(OBJECTIVES.returnCorridor, true);
    this.schedule(5.5, () => {
      if (this.mode === "playing") this.voice("Hörst du das?");
    });
  }

  inspectToy() {
    if (this.bedroomMemoryTriggered) return;
    this.bedroomMemoryTriggered = true;
    this.state.memoryFound = true;
    this.mode = "ending";
    this.releasePointerLock();
    this.ui.hideInteraction();
    this.ui.setObjective("", false);
    this.audio.memory();
    this.ui.showSubtitle("…ich wollte nicht, dass du gehst.", 4700, "ERINNERUNG");
    this.schedule(5.2, () => {
      this.audio.silence(1.2);
      this.ui.fadeTo(1, 2500);
    });
    this.schedule(8.1, () => {
      this.ui.beginEnding();
      setTimeout(() => this.ui.revealEndingLines(), 450);
      setTimeout(() => this.ui.revealChapter(), 6500);
      setTimeout(() => {
        this.ui.revealEndingActions();
        this.state.finished = true;
        this.state.phase = "finished";
      }, 10400);
      this.audio.tone({ freq: 55, type: "sine", gain: 0.03, duration: 12, attack: 2, slide: 41 });
    });
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.setSize(width, height, false);
  }

  renderLoop() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.renderLoop());
  }

  exposeDebugApi() {
    const game = this;
    window.__NWO = {
      game,
      start: () => game.startGame(),
      skipIntro: () => game.skipIntro(),
      teleport: (x, z, yaw = 0) => game.player.teleport(x, z, yaw),
      setView: (yaw, pitch = 0.22) => {
        game.player.yaw = yaw;
        game.player.pitch = pitch;
        game.player.updateCamera(0.016, true);
      },
      lookAt: (x, z) => {
        game.player.facePoint(x, z);
        game.player.updateCamera(0.016, true);
      },
      interact: () => game.tryInteract(),
      interactWith: (id) => {
        const entry = game.world.interactables.find((item) => item.id === id && item.enabled);
        if (entry) game.interact(entry);
      },
      triggerAnomaly: () => game.startAnomaly(),
      retry: () => game.retryChase(),
      retire: () => game.startBedroomTransition(),
      finish: () => {
        game.bedroomMemoryTriggered = false;
        game.inspectToy();
      },
      hideHints: () => {
        game.ui.hideLockHint();
        game.ui.hideInteraction();
      },
      lockPointer: () => game.requestPointerLock(),
      state: () => game.snapshot(),
      snapshot: () => game.snapshot(),
    };
  }

  snapshot() {
    return {
      mode: this.mode,
      phase: this.state.phase,
      hasKey: this.state.hasKey,
      doorOpen: this.state.doorOpen,
      enteredSide: this.state.enteredSide,
      countdownStarted: this.state.countdownStarted,
      countdown: this.countdown.formatted(),
      anomalyTriggered: this.state.anomalyTriggered,
      chaseActive: this.state.chaseActive,
      bedroomEntered: this.state.bedroomEntered,
      memoryFound: this.state.memoryFound,
      finished: this.state.finished,
      objective: this.ui.objectiveText.textContent,
      position: { x: Number(this.player.position.x.toFixed(2)), z: Number(this.player.position.z.toFixed(2)) },
      stamina: Number(this.player.stamina.toFixed(1)),
      shadowDistance: this.world.shadow
        ? Number(this.player.position.distanceTo(this.world.shadow.position).toFixed(2))
        : null,
      interactable: this.currentInteractable?.id ?? null,
    };
  }
}

void COUNTDOWN_START;
