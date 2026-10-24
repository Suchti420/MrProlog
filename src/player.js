import * as THREE from "three";
import { clamp, damp, lerp, moveWithCollisions } from "./logic.js";

const UP = new THREE.Vector3(0, 1, 0);

function makeMaterial(color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02, flatShading: true });
}

function capsule(radius, length, material) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 3, 6), material);
  return mesh;
}

export class Player {
  constructor(scene, world, audio) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.position = new THREE.Vector3(0, 0, 15.4);
    this.velocity = new THREE.Vector2();
    this.radius = 0.34;
    this.yaw = 0;
    this.pitch = 0.22;
    this.cameraDistance = 3.85;
    this.cameraHeight = 1.42;
    this.cameraPosition = new THREE.Vector3(0, 2.3, 19.2);
    this.cameraTarget = new THREE.Vector3();
    this.stamina = 100;
    this.maxStamina = 100;
    this.sprintDrain = 26;
    this.staminaRegen = 17;
    this.exhausted = false;
    this.regenerateDelay = 0;
    this.walkPhase = 0;
    this.stepAccumulator = 0;
    this.stepDistance = 0;
    this.idleTime = 0;
    this.dodgeTime = 0;
    this.dodgeCooldown = 0;
    this.dodgeDirection = new THREE.Vector2();
    this.lying = 0;
    this.controlEnabled = false;
    this.raycaster = new THREE.Raycaster();
    this.cameraShake = 0;
    this.sprinting = false;
    this.moving = false;
    this.lastSurface = "tile";
    this.buildBody();
    this.root.rotation.y = Math.PI;
  }

  buildBody() {
    const root = new THREE.Group();
    root.position.copy(this.position);
    this.root = root;

    const body = new THREE.Group();
    body.position.y = 0;
    root.add(body);
    this.body = body;

    const skin = makeMaterial(0xa88f78, 0.88);
    const shirt = makeMaterial(0x252a27, 0.96);
    const jacket = makeMaterial(0x303632, 0.95);
    const trousers = makeMaterial(0x202426, 0.97);
    const shoes = makeMaterial(0x111312, 0.8);
    const hair = makeMaterial(0x191713, 0.96);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.23), trousers);
    hips.position.y = 0.9;
    body.add(hips);

    const torso = capsule(0.22, 0.45, jacket);
    torso.position.y = 1.24;
    torso.scale.set(1.03, 1, 0.76);
    torso.rotation.x = 0.08;
    body.add(torso);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.12, 7), shirt);
    collar.position.set(0, 1.57, 0);
    body.add(collar);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.13, 6), skin);
    neck.position.set(0, 1.63, 0.01);
    body.add(neck);

    const head = new THREE.Group();
    head.position.set(0, 1.77, 0.015);
    head.rotation.x = 0.06;
    body.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.133, 8, 7), skin);
    skull.scale.set(0.9, 1.08, 0.96);
    head.add(skull);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.138, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.58), hair);
    hairCap.position.y = 0.025;
    hairCap.scale.set(0.93, 1.03, 1);
    head.add(hairCap);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 5), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.012, 0.132);
    head.add(nose);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.026, 5, 4), skin);
      ear.position.set(side * 0.124, 0, 0);
      ear.scale.set(0.5, 1, 0.7);
      head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 4, 3), makeMaterial(0x11100d, 0.5));
      eye.position.set(side * 0.045, 0.018, 0.118);
      head.add(eye);
    }

    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.27, 1.48, 0);
      shoulder.rotation.z = side * 0.06;
      body.add(shoulder);
      const upper = capsule(0.062, 0.29, jacket);
      upper.position.y = -0.18;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.34;
      shoulder.add(elbow);
      const forearm = capsule(0.052, 0.27, jacket);
      forearm.position.y = -0.16;
      elbow.add(forearm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 6, 5), skin);
      hand.position.y = -0.34;
      elbow.add(hand);
      this.arms.push({ shoulder, elbow, side });
    }

    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.105, 0.88, 0);
      body.add(hip);
      const thigh = capsule(0.083, 0.32, trousers);
      thigh.position.y = -0.2;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.41;
      hip.add(knee);
      const shin = capsule(0.066, 0.32, trousers);
      shin.position.y = -0.18;
      knee.add(shin);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.26), shoes);
      shoe.position.set(0, -0.38, 0.045);
      knee.add(shoe);
      this.legs.push({ hip, knee, side });
    }

    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.02), makeMaterial(0x151915, 0.8));
    strap.position.set(-0.13, 1.27, 0.175);
    strap.rotation.z = -0.13;
    body.add(strap);

    this.scene.add(root);
  }

  teleport(x, z, yaw = this.yaw) {
    this.position.set(x, 0, z);
    this.root.position.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = 0.22;
    this.root.rotation.y = yaw + Math.PI;
    this.velocity.set(0, 0);
    if (this.camera) this.updateCamera(1, true);
  }

  setLying(amount) {
    this.lying = clamp(amount, 0, 1);
    this.root.position.y = this.lying * 0.28;
    this.root.rotation.x = -this.lying * (Math.PI / 2);
    this.root.rotation.z = this.lying * 0.08;
  }

  rotateCamera(dx, dy, sensitivity = 0.0022) {
    this.yaw -= dx * sensitivity;
    this.pitch = clamp(this.pitch + dy * sensitivity, -0.1, 0.72);
  }

  requestDodge() {
    if (this.dodgeCooldown > 0 || this.exhausted || this.lying > 0.3) return false;
    this.dodgeTime = 0.24;
    this.dodgeCooldown = 1.15;
    const forward = new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw));
    const right = new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw));
    const direction = forward.clone();
    if (this.inputStrafe || this.inputForward) {
      direction.set(
        forward.x * this.inputForward + right.x * this.inputStrafe,
        forward.y * this.inputForward + right.y * this.inputStrafe
      );
    }
    if (direction.lengthSq() < 0.01) direction.copy(forward);
    direction.normalize();
    this.dodgeDirection.copy(direction);
    if (this.audio) this.audio.noiseBurst({ gain: 0.045, duration: 0.2, type: "bandpass", freq: 520, q: 0.7 });
    return true;
  }

  update(dt, input, enabled = true) {
    const delta = Math.min(dt, 0.05);
    this.controlEnabled = enabled;
    this.idleTime += delta;
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - delta);

    const surface = this.world.scene === this.world.bedroomRoot ? "carpet" : "tile";
    this.lastSurface = this.world.bedroomRoot.visible ? "carpet" : "tile";
    void surface;

    let forwardInput = 0;
    let strafeInput = 0;
    if (enabled && this.lying < 0.2) {
      forwardInput = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
      strafeInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    }
    this.inputForward = forwardInput;
    this.inputStrafe = strafeInput;

    const forward = new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw));
    const right = new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw));
    let direction = new THREE.Vector2(
      forward.x * forwardInput + right.x * strafeInput,
      forward.y * forwardInput + right.y * strafeInput
    );
    const inputLength = direction.length();
    if (inputLength > 1) direction.divideScalar(inputLength);
    this.moving = inputLength > 0.05;
    this.sprinting = Boolean(input.sprint && this.moving && !this.exhausted && this.dodgeTime <= 0);

    if (this.dodgeTime > 0) {
      this.dodgeTime = Math.max(0, this.dodgeTime - delta);
      const dodgeSpeed = 8.6;
      const move = moveWithCollisions(
        this.position,
        this.dodgeDirection.x * dodgeSpeed * delta,
        this.dodgeDirection.y * dodgeSpeed * delta,
        this.radius,
        this.world.colliders
      );
      this.position.x = move.x;
      this.position.z = move.z;
      if (move.hitX || move.hitZ) this.dodgeTime = 0;
    } else if (this.moving) {
      const speed = this.sprinting ? 5.35 : this.exhausted ? 2.25 : 2.92;
      const move = moveWithCollisions(
        this.position,
        direction.x * speed * delta,
        direction.y * speed * delta,
        this.radius,
        this.world.colliders
      );
      this.position.x = move.x;
      this.position.z = move.z;
    }

    if (this.sprinting && this.moving) {
      this.stamina = Math.max(0, this.stamina - this.sprintDrain * delta);
      this.regenerateDelay = 0.8;
      if (this.stamina <= 0) {
        this.exhausted = true;
        this.sprinting = false;
      }
    } else {
      this.regenerateDelay = Math.max(0, this.regenerateDelay - delta);
      if (this.regenerateDelay <= 0) {
        this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * delta);
        if (this.stamina > 28) this.exhausted = false;
      }
    }

    const speedNow = this.moving ? (this.sprinting ? 5.35 : this.exhausted ? 2.25 : 2.92) : 0;
    if (this.moving && speedNow > 0) {
      const targetAngle = Math.atan2(direction.x, direction.y);
      let diff = targetAngle - this.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.root.rotation.y += diff * Math.min(1, delta * 12);
    }

    this.root.position.x = this.position.x;
    this.root.position.z = this.position.z;
    if (this.lying <= 0.001) this.root.position.y = 0;

    if (speedNow > 0) {
      this.walkPhase += delta * (this.sprinting ? 11.2 : this.exhausted ? 5.2 : 7.1);
      this.stepAccumulator += delta * speedNow;
      const stride = this.sprinting ? 1.55 : 1.7;
      if (this.stepAccumulator > stride) {
        this.stepAccumulator = 0;
        this.audio?.step(this.sprinting, this.lastSurface);
      }
    } else {
      this.walkPhase += delta * 1.2;
    }

    this.animateBody(delta, speedNow);
    this.updateCamera(delta);
  }

  animateBody(delta, speed) {
    const phase = this.walkPhase;
    const swing = speed > 0 ? (this.sprinting ? 0.78 : this.exhausted ? 0.34 : 0.5) : 0.03;
    const breath = Math.sin(this.idleTime * 1.6) * 0.012;
    const exhaustionLean = this.exhausted ? 0.13 : 0;
    const speedLean = this.sprinting ? 0.14 : speed > 0 ? 0.06 : 0;

    this.body.rotation.x = damp(this.body.rotation.x, 0.07 + exhaustionLean + speedLean, 8, delta);
    this.body.position.y = Math.abs(Math.sin(phase)) * (speed > 0 ? (this.sprinting ? 0.045 : 0.022) : 0) + breath;
    this.body.position.z = speed > 0 ? 0 : Math.sin(this.idleTime * 0.9) * 0.003;

    for (const leg of this.legs) {
      const sign = leg.side === 1 ? 1 : -1;
      const legSwing = Math.sin(phase + (sign > 0 ? 0 : Math.PI)) * swing;
      leg.hip.rotation.x = damp(leg.hip.rotation.x, legSwing, 14, delta);
      const kneeBend = speed > 0 ? Math.max(0, -Math.sin(phase + (sign > 0 ? 0 : Math.PI) + 0.4)) * (this.sprinting ? 0.62 : 0.34) : 0.06;
      leg.knee.rotation.x = damp(leg.knee.rotation.x, kneeBend, 12, delta);
    }
    for (const arm of this.arms) {
      const sign = arm.side === 1 ? 1 : -1;
      const armSwing = Math.sin(phase + (sign > 0 ? Math.PI : 0)) * swing * 0.8;
      arm.shoulder.rotation.x = damp(arm.shoulder.rotation.x, armSwing + (this.exhausted ? 0.15 : 0), 13, delta);
      arm.shoulder.rotation.z = arm.side * (0.06 + (this.exhausted ? 0.03 : 0));
      const elbowBend = speed > 0 ? (this.sprinting ? 0.65 : 0.35) : 0.16;
      arm.elbow.rotation.x = damp(arm.elbow.rotation.x, -elbowBend - Math.max(0, armSwing) * 0.35, 11, delta);
    }
    const headTilt = this.exhausted ? 0.12 : smoothNoise(this.idleTime) * 0.015;
    this.body.children[4].rotation.x = damp(this.body.children[4].rotation.x, 0.06 + headTilt, 6, delta);
  }

  updateCamera(delta, force = false) {
    const target = new THREE.Vector3(this.position.x, this.cameraHeight + (this.lying ? 0 : 0), this.position.z);
    this.cameraTarget.copy(target);
    const cosPitch = Math.cos(this.pitch);
    const distance = this.cameraDistance;
    const desired = new THREE.Vector3(
      target.x + Math.sin(this.yaw) * cosPitch * distance,
      target.y + Math.sin(this.pitch) * distance + 0.12,
      target.z + Math.cos(this.yaw) * cosPitch * distance
    );

    const direction = desired.clone().sub(target);
    const distanceToDesired = direction.length();
    direction.normalize();
    this.raycaster.set(target, direction);
    this.raycaster.far = distanceToDesired + 0.4;
    this.raycaster.near = 0.05;
    const hits = this.raycaster.intersectObjects(this.world.occluders, false);
    let allowed = distanceToDesired;
    if (hits.length > 0) {
      allowed = Math.max(0.72, hits[0].distance - 0.25);
    }
    const finalPosition = target.clone().add(direction.multiplyScalar(allowed));
    if (this.cameraShake > 0) {
      const shake = this.cameraShake * 0.05;
      finalPosition.x += (Math.random() - 0.5) * shake;
      finalPosition.y += (Math.random() - 0.5) * shake * 0.6;
    }
    const smoothing = force ? 1 : 1 - Math.exp(-12 * delta);
    this.camera.position.lerp(finalPosition, smoothing);
    this.camera.lookAt(target.x, target.y + 0.05, target.z);
    this.cameraShake = Math.max(0, this.cameraShake - delta * 2.4);
  }

  setCamera(camera) {
    this.camera = camera;
    this.updateCamera(0, true);
  }

  getForward() {
    return new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw));
  }

  getStaminaRatio() {
    return clamp(this.stamina / this.maxStamina, 0, 1);
  }

  resetStamina() {
    this.stamina = this.maxStamina;
    this.exhausted = false;
    this.regenerateDelay = 0;
  }

  facePoint(x, z) {
    this.yaw = Math.atan2(-(x - this.position.x), -(z - this.position.z));
  }
}

function smoothNoise(t) {
  return Math.sin(t * 0.7) * 0.4 + Math.sin(t * 1.9) * 0.25 + Math.sin(t * 3.3) * 0.1;
}

void UP;
void lerp;
