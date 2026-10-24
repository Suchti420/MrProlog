import * as THREE from "three";
import {
  makeCeilingTexture,
  makeCountdownCanvas,
  makeCurtainTexture,
  makeDoorTexture,
  makeFloorTexture,
  makeLabelTexture,
  makeMetalTexture,
  makePaperTexture,
  makeStainTexture,
  makeWallTexture,
  paintCountdown,
} from "./textures.js";

const WALL_HEIGHT = 3.2;
const WALL_THICKNESS = 0.18;

const C = {
  wall: 0x626957,
  wallDark: 0x343b33,
  metal: 0x646a60,
  darkMetal: 0x272b27,
  rust: 0x5a4634,
  fabric: 0x6a6d61,
  mattress: 0x9a9d8b,
  paper: 0xb7b5a3,
  black: 0x050606,
  red: 0x9e3129,
  green: 0x8ea083,
  warm: 0xd9a56f,
  bed: 0xb3aa91,
  wood: 0x4c3f31,
};

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.9,
    metalness: options.metalness ?? 0.05,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    map: options.map ?? null,
    flatShading: options.flatShading ?? false,
  });
}

function boxGeometry(width, height, depth) {
  return new THREE.BoxGeometry(width, height, depth);
}

function disposableClone(texture) {
  const clone = texture.clone();
  clone.needsUpdate = true;
  clone.wrapS = THREE.RepeatWrapping;
  clone.wrapT = THREE.RepeatWrapping;
  return clone;
}

export class World {
  constructor(scene, callbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.root = new THREE.Group();
    this.hospitalRoot = new THREE.Group();
    this.bedroomRoot = new THREE.Group();
    this.root.add(this.hospitalRoot);
    this.root.add(this.bedroomRoot);
    this.scene.add(this.root);

    this.colliders = [];
    this.hospitalColliders = [];
    this.bedroomColliders = [];
    this.occluders = [];
    this.hospitalOccluders = [];
    this.bedroomOccluders = [];
    this.interactables = [];
    this.hospitalInteractables = [];
    this.bedroomInteractables = [];
    this.flickers = [];
    this.lights = [];
    this.shadow = null;
    this.shadowVisible = false;
    this.countdownCanvas = makeCountdownCanvas();
    this.countdownTexture = new THREE.CanvasTexture(this.countdownCanvas);
    this.countdownTexture.colorSpace = THREE.SRGBColorSpace;
    this.chase = false;
    this.exitGlow = null;
    this.emergencyLights = [];
    this.time = 0;
    this.lastCountdownPaint = -1;

    this.baseWallTexture = makeWallTexture();
    this.baseFloorTexture = makeFloorTexture();
    this.baseCeilingTexture = makeCeilingTexture();
    this.baseMetalTexture = makeMetalTexture();
    this.baseDoorTexture = makeDoorTexture();
    this.basePaperTexture = makePaperTexture();
    this.baseCurtainTexture = makeCurtainTexture();
    this.stainTexture = makeStainTexture();
    this.wallMaterialCache = new Map();
    this.floorMaterialCache = new Map();

    this.makeSharedMaterials();
    this.colliders = this.hospitalColliders;
    this.buildHospital();
    this.colliders = this.bedroomColliders;
    this.buildBedroom();
    this.bedroomRoot.visible = false;
    this.colliders = this.hospitalColliders;
    this.occluders = this.hospitalOccluders;
    this.interactables = this.hospitalInteractables;
  }

  makeSharedMaterials() {
    this.materials = {
      wallDark: makeMaterial(C.wallDark, { roughness: 0.96 }),
      trim: makeMaterial(0x202720, { roughness: 0.8 }),
      metal: makeMaterial(C.metal, { map: disposableClone(this.baseMetalTexture), metalness: 0.4, roughness: 0.58 }),
      darkMetal: makeMaterial(C.darkMetal, { metalness: 0.5, roughness: 0.55 }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x58706b,
        roughness: 0.18,
        metalness: 0.1,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
      }),
      paper: makeMaterial(C.paper, { map: disposableClone(this.basePaperTexture), roughness: 1 }),
      black: makeMaterial(C.black, { roughness: 1 }),
      fabric: makeMaterial(C.fabric, { roughness: 1 }),
      mattress: makeMaterial(C.mattress, { roughness: 1 }),
      bedFrame: makeMaterial(0x8f8d7e, { metalness: 0.35, roughness: 0.52 }),
      rust: makeMaterial(C.rust, { metalness: 0.15, roughness: 0.9 }),
      red: makeMaterial(C.red, { roughness: 0.6 }),
      green: makeMaterial(C.green, { roughness: 0.75 }),
      warm: makeMaterial(C.warm, { roughness: 0.9 }),
      wood: makeMaterial(C.wood, { roughness: 0.85 }),
      curtain: makeMaterial(0xa9ad96, { map: disposableClone(this.baseCurtainTexture), roughness: 1, side: THREE.DoubleSide }),
      toy: makeMaterial(0x8a6b4d, { roughness: 0.95 }),
      toyLight: makeMaterial(0xbda47f, { roughness: 0.95 }),
    };
  }

  wallMaterial(width, height, tint = 0xffffff) {
    const repeatX = Math.max(1, Math.round(width / 2.4));
    const repeatY = Math.max(1, Math.round(height / 2.8));
    const key = `${repeatX}-${repeatY}-${tint}`;
    if (this.wallMaterialCache.has(key)) return this.wallMaterialCache.get(key);
    const texture = disposableClone(this.baseWallTexture);
    texture.repeat.set(repeatX, repeatY);
    const material = makeMaterial(tint, { map: texture, roughness: 0.97 });
    this.wallMaterialCache.set(key, material);
    return material;
  }

  floorMaterial(width, depth, tint = 0xffffff) {
    const repeatX = Math.max(1, Math.round(width / 2.6));
    const repeatY = Math.max(1, Math.round(depth / 2.6));
    const key = `${repeatX}-${repeatY}-${tint}`;
    if (this.floorMaterialCache.has(key)) return this.floorMaterialCache.get(key);
    const texture = disposableClone(this.baseFloorTexture);
    texture.repeat.set(repeatX, repeatY);
    const material = makeMaterial(tint, { map: texture, roughness: 0.94 });
    this.floorMaterialCache.set(key, material);
    return material;
  }

  addBox(parent, w, h, d, material, x, y, z, { occluder = false, collide = false, name = "", rotationY = 0 } = {}) {
    const mesh = new THREE.Mesh(boxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    mesh.name = name;
    parent.add(mesh);
    if (occluder) this.occluders.push(mesh);
    if (collide) this.addCollider(x, z, w, d, name);
    return mesh;
  }

  addCollider(x, z, width, depth, id = "") {
    const collider = {
      id,
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      enabled: true,
    };
    this.colliders.push(collider);
    return collider;
  }

  addWall(x, z, width, depth, { height = WALL_HEIGHT, materialTint = 0xffffff, occluder = true, parent = this.hospitalRoot, target = "hospital" } = {}) {
    const length = Math.max(width, depth);
    const material = this.wallMaterial(length, height, materialTint);
    const mesh = new THREE.Mesh(boxGeometry(width, height, depth), material);
    mesh.position.set(x, height / 2, z);
    mesh.name = "Wand";
    parent.add(mesh);
    if (occluder) {
      (target === "bedroom" ? this.bedroomOccluders : this.hospitalOccluders).push(mesh);
    }
    const collider = {
      id: "wall",
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      enabled: true,
    };
    (target === "bedroom" ? this.bedroomColliders : this.hospitalColliders).push(collider);
    return mesh;
  }

  addFloor(x, z, width, depth, { tint = 0xffffff, parent = this.hospitalRoot, target = "hospital" } = {}) {
    const material = this.floorMaterial(width, depth, tint);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0, z);
    parent.add(mesh);
    return mesh;
  }

  addCeiling(x, z, width, depth, { parent = this.hospitalRoot, tint = 0xffffff } = {}) {
    const material = makeMaterial(tint, { map: disposableClone(this.baseCeilingTexture), roughness: 1 });
    material.map.repeat.set(Math.max(1, width / 2.3), Math.max(1, depth / 2.3));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, WALL_HEIGHT, z);
    parent.add(mesh);
    return mesh;
  }

  addLamp(x, z, { parent = this.hospitalRoot, intensity = 11, color = 0xc7ddc4, broken = false, flicker = false, height = 3.02, target = "hospital" } = {}) {
    const housing = this.addBox(parent, 1.25, 0.08, 0.32, this.materials.darkMetal, x, height + 0.09, z, { name: "Deckenlampe" });
    housing.castShadow = false;
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: 0xdfe9d7,
      emissive: color,
      emissiveIntensity: broken ? 0.1 : 1.7,
      roughness: 0.6,
    });
    const panel = this.addBox(parent, 1.08, 0.03, 0.23, panelMaterial, x, height + 0.03, z);
    const light = new THREE.PointLight(color, intensity, 9, 1.8);
    light.position.set(x, height - 0.18, z);
    parent.add(light);
    this.lights.push(light);
    this.flickers.push({
      light,
      panel,
      panelMaterial,
      base: intensity,
      baseEmissive: broken ? 0.1 : 1.7,
      phase: Math.random() * 100,
      mode: broken ? "dying" : flicker ? "flicker" : "steady",
      target,
    });
    this.addBox(parent, 0.06, 0.44, 0.06, this.materials.darkMetal, x, height + 0.32, z);
    return light;
  }

  addSign(text, x, y, z, width, height, rotationY, options = {}) {
    const texture = makeLabelTexture(text, {
      width: 512,
      height: Math.round((512 * height) / width),
      fontSize: options.fontSize ?? 50,
      background: options.background ?? "#263026",
      foreground: options.foreground ?? "#b9c4ae",
      border: options.border ?? "#687667",
      subtext: options.subtext ?? "",
    });
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.75,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    (options.parent ?? this.hospitalRoot).add(mesh);
    return mesh;
  }

  addDoorVisual(x, z, rotationY, { parent = this.hospitalRoot, width = 1.06, height = 2.28 } = {}) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    const door = new THREE.Mesh(boxGeometry(width, height, 0.075), makeMaterial(0xffffff, { map: disposableClone(this.baseDoorTexture), roughness: 0.88 }));
    door.position.y = height / 2;
    group.add(door);
    const frameMaterial = this.materials.darkMetal;
    const top = new THREE.Mesh(boxGeometry(width + 0.22, 0.1, 0.14), frameMaterial);
    top.position.y = height + 0.02;
    group.add(top);
    const left = new THREE.Mesh(boxGeometry(0.08, height + 0.1, 0.14), frameMaterial);
    left.position.set(-width / 2 - 0.07, height / 2, 0);
    group.add(left);
    const right = left.clone();
    right.position.x = width / 2 + 0.07;
    group.add(right);
    parent.add(group);
    return group;
  }

  addStain(x, z, width, height, rotationY, { y = 1.4, parent = this.hospitalRoot, opacity = 0.6 } = {}) {
    const material = new THREE.MeshBasicMaterial({
      map: this.stainTexture,
      transparent: true,
      opacity,
      depthWrite: false,
      color: 0xffffff,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    parent.add(mesh);
    return mesh;
  }

  addPapers(x, z, count = 5, parent = this.hospitalRoot) {
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.21, 0.3),
        makeMaterial(0xb5b2a0, { roughness: 1, side: THREE.DoubleSide })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.random() * Math.PI;
      mesh.position.set(x + (Math.random() - 0.5) * 1.2, 0.008 + i * 0.001, z + (Math.random() - 0.5) * 1.2);
      parent.add(mesh);
    }
  }

  addGurney(x, z, rotationY = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    this.hospitalRoot.add(group);
    const frame = this.materials.bedFrame;
    const mattress = this.materials.mattress;
    const length = 2.05;
    const width = 0.78;
    const top = new THREE.Mesh(boxGeometry(width, 0.13, length), mattress);
    top.position.y = 0.73;
    group.add(top);
    const railMaterial = this.materials.metal;
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(boxGeometry(0.05, 0.05, length * 0.8), railMaterial);
      rail.position.set(side * (width / 2 + 0.03), 0.98, 0);
      group.add(rail);
      for (const zOffset of [-0.65, 0.65]) {
        const post = new THREE.Mesh(boxGeometry(0.04, 0.3, 0.04), railMaterial);
        post.position.set(side * (width / 2 + 0.03), 0.85, zOffset);
        group.add(post);
      }
    }
    for (const xOffset of [-width / 2 + 0.08, width / 2 - 0.08]) {
      for (const zOffset of [-length / 2 + 0.16, length / 2 - 0.16]) {
        const leg = new THREE.Mesh(boxGeometry(0.045, 0.7, 0.045), railMaterial);
        leg.position.set(xOffset, 0.35, zOffset);
        group.add(leg);
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 8), this.materials.black);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(xOffset, 0.055, zOffset);
        group.add(wheel);
      }
    }
    this.addCollider(x, z, width + 0.1, length, "gurney");
    return group;
  }

  addHospitalBed(x, z, rotationY = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    this.hospitalRoot.add(group);
    const frame = this.materials.bedFrame;
    const mattress = this.materials.mattress;
    const length = 2.1;
    const width = 0.95;
    const base = new THREE.Mesh(boxGeometry(width, 0.18, length), frame);
    base.position.y = 0.58;
    group.add(base);
    const pad = new THREE.Mesh(boxGeometry(width - 0.06, 0.16, length - 0.12), mattress);
    pad.position.y = 0.75;
    group.add(pad);
    const pillow = new THREE.Mesh(boxGeometry(width - 0.2, 0.13, 0.38), makeMaterial(0xc4c2ae, { roughness: 1 }));
    pillow.position.set(0, 0.89, -length / 2 + 0.32);
    group.add(pillow);
    const headboard = new THREE.Mesh(boxGeometry(width + 0.06, 0.8, 0.06), frame);
    headboard.position.set(0, 1.0, -length / 2);
    group.add(headboard);
    const footboard = headboard.clone();
    footboard.position.z = length / 2;
    group.add(footboard);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(boxGeometry(0.035, 0.34, length * 0.65), this.materials.metal);
      rail.position.set(side * (width / 2 + 0.055), 0.98, 0.06);
      group.add(rail);
      for (const offset of [-0.6, 0, 0.6]) {
        const post = new THREE.Mesh(boxGeometry(0.035, 0.27, 0.035), this.materials.metal);
        post.position.set(side * (width / 2 + 0.055), 0.82, offset);
        group.add(post);
      }
    }
    for (const xOffset of [-width / 2 + 0.1, width / 2 - 0.1]) {
      for (const zOffset of [-length / 2 + 0.18, length / 2 - 0.18]) {
        const leg = new THREE.Mesh(boxGeometry(0.05, 0.54, 0.05), this.materials.metal);
        leg.position.set(xOffset, 0.27, zOffset);
        group.add(leg);
      }
    }
    this.addCollider(x, z, width + 0.25, length + 0.15, "bed");
    return group;
  }

  addDesk(x, z, rotationY = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    this.hospitalRoot.add(group);
    const wood = this.materials.wood;
    const top = new THREE.Mesh(boxGeometry(3.5, 0.1, 1.0), wood);
    top.position.y = 1.02;
    group.add(top);
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(boxGeometry(0.09, 1, 0.86), makeMaterial(0x40372c, { roughness: 0.9 }));
      panel.position.set(side * 1.55, 0.51, 0);
      group.add(panel);
    }
    const back = new THREE.Mesh(boxGeometry(3.05, 0.68, 0.07), makeMaterial(0x463b2f, { roughness: 0.95 }));
    back.position.set(0, 0.62, 0.43);
    group.add(back);
    this.addCollider(x, z, 3.5, 1.0, "desk");
    return group;
  }

  addOfficeChair(x, z, rotationY = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    this.hospitalRoot.add(group);
    const seat = new THREE.Mesh(boxGeometry(0.52, 0.08, 0.5), this.materials.fabric);
    seat.position.y = 0.48;
    group.add(seat);
    const back = new THREE.Mesh(boxGeometry(0.5, 0.58, 0.08), this.materials.fabric);
    back.position.set(0, 0.8, 0.22);
    group.add(back);
    const pole = new THREE.Mesh(boxGeometry(0.06, 0.45, 0.06), this.materials.metal);
    pole.position.y = 0.25;
    group.add(pole);
    for (let i = 0; i < 5; i += 1) {
      const arm = new THREE.Mesh(boxGeometry(0.05, 0.04, 0.35), this.materials.metal);
      arm.position.set(Math.sin((i / 5) * Math.PI * 2) * 0.2, 0.05, Math.cos((i / 5) * Math.PI * 2) * 0.2);
      arm.rotation.y = (i / 5) * Math.PI * 2;
      group.add(arm);
    }
    return group;
  }

  addSink(x, z, rotationY = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    this.hospitalRoot.add(group);
    const basin = new THREE.Mesh(boxGeometry(0.72, 0.22, 0.5), makeMaterial(0xbfc1b5, { roughness: 0.28, metalness: 0.15 }));
    basin.position.y = 0.86;
    group.add(basin);
    const pedestal = new THREE.Mesh(boxGeometry(0.24, 0.76, 0.24), this.materials.metal);
    pedestal.position.y = 0.4;
    group.add(pedestal);
    const tap = new THREE.Mesh(boxGeometry(0.04, 0.24, 0.04), this.materials.metal);
    tap.position.set(0, 1.04, -0.18);
    group.add(tap);
    return group;
  }

  addCabinet(x, z, rotationY = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    this.hospitalRoot.add(group);
    const body = new THREE.Mesh(boxGeometry(0.9, 1.9, 0.45), makeMaterial(0x7b8072, { roughness: 0.72, metalness: 0.2 }));
    body.position.y = 0.95;
    group.add(body);
    for (const y of [0.6, 1.28]) {
      const handle = new THREE.Mesh(boxGeometry(0.22, 0.025, 0.03), this.materials.darkMetal);
      handle.position.set(0, y, 0.24);
      group.add(handle);
    }
    this.addCollider(x, z, 0.9, 0.45, "cabinet");
    return group;
  }

  addVent(x, y, z, rotationY = 0) {
    const material = this.materials.darkMetal;
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotationY;
    this.hospitalRoot.add(group);
    const frame = new THREE.Mesh(boxGeometry(0.85, 0.5, 0.04), material);
    group.add(frame);
    for (let i = 0; i < 5; i += 1) {
      const slat = new THREE.Mesh(boxGeometry(0.72, 0.035, 0.02), makeMaterial(0x141814, { roughness: 0.8 }));
      slat.position.set(0, -0.18 + i * 0.09, 0.03);
      slat.rotation.x = -0.28;
      group.add(slat);
    }
  }

  addPipes() {
    const material = makeMaterial(0x4b5048, { metalness: 0.55, roughness: 0.5 });
    for (const [x, y, radius] of [[1.3, 2.9, 0.055], [1.03, 3.01, 0.032], [-1.2, 2.86, 0.07]]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 28, 7), material);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(x, y, 3);
      this.hospitalRoot.add(pipe);
    }
    for (let z = -10; z < 17; z += 5.4) {
      const bracket = new THREE.Mesh(boxGeometry(2.7, 0.05, 0.05), this.materials.darkMetal);
      bracket.position.set(0, 3.01, z);
      this.hospitalRoot.add(bracket);
    }
  }

  addDust() {
    const count = 260;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 5;
      positions[i * 3 + 1] = 0.2 + Math.random() * 2.8;
      positions[i * 3 + 2] = 19 - Math.random() * 38;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xb9c3ac,
      size: 0.018,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    this.hospitalRoot.add(points);
    this.dust = points;
  }

  createInteractable(id, position, prompt, event, { radius = 2.15, mesh = null } = {}) {
    const entry = {
      id,
      position: new THREE.Vector3(position.x, position.y ?? 0.8, position.z),
      prompt,
      event,
      radius,
      mesh,
      enabled: true,
    };
    this.interactables.push(entry);
    return entry;
  }

  buildHospital() {
    const root = this.hospitalRoot;

    this.addFloor(0, 3, 5.4, 30.2);
    this.addFloor(6.45, 9.5, 7.5, 7);
    this.addFloor(-6.45, 4.5, 7.5, 7);
    this.addFloor(5.95, -4.5, 6.5, 7);
    this.addFloor(0, -17, 3.6, 10);
    this.addCeiling(0, 3, 5.4, 30.2);
    this.addCeiling(6.45, 9.5, 7.5, 7);
    this.addCeiling(-6.45, 4.5, 7.5, 7);
    this.addCeiling(5.95, -4.5, 6.5, 7);
    this.addCeiling(0, -17, 3.6, 10);

    void root;

    const mainWalls = [
      [-2.7, -4.2, WALL_THICKNESS, 15.6],
      [-2.7, 11.8, WALL_THICKNESS, 12.4],
      [2.7, -9.2, WALL_THICKNESS, 5.6],
      [2.7, 2.0, WALL_THICKNESS, 12.8],
      [2.7, 14.3, WALL_THICKNESS, 7.4],
      [-1.825, -12, 1.75, WALL_THICKNESS],
      [1.825, -12, 1.75, WALL_THICKNESS],
      [-1.95, 18, 1.5, WALL_THICKNESS],
      [1.95, 18, 1.5, WALL_THICKNESS],
    ];
    for (const [x, z, w, d] of mainWalls) this.addWall(x, z, w, d);

    this.addWall(6.45, 13, 7.5, WALL_THICKNESS);
    this.addWall(6.45, 6, 7.5, WALL_THICKNESS);
    this.addWall(10.2, 9.5, WALL_THICKNESS, 7);
    this.addWall(-6.45, 8, 7.5, WALL_THICKNESS);
    this.addWall(-6.45, 1, 7.5, WALL_THICKNESS);
    this.addWall(-10.2, 4.5, WALL_THICKNESS, 7);
    this.addWall(5.95, -1, 6.5, WALL_THICKNESS);
    this.addWall(5.95, -8, 6.5, WALL_THICKNESS);
    this.addWall(9.2, -4.5, WALL_THICKNESS, 7);
    this.addWall(-1.8, -17, WALL_THICKNESS, 10);
    this.addWall(1.8, -17, WALL_THICKNESS, 10);
    this.addWall(0, -22, 3.6, WALL_THICKNESS);

    for (const [x, z, ry] of [
      [2.71, 12.2, Math.PI / 2],
      [2.71, -2.3, Math.PI / 2],
      [-2.71, -8.8, Math.PI / 2],
      [-2.71, 14.6, Math.PI / 2],
      [2.71, 5.1, Math.PI / 2],
    ]) {
      this.addDoorVisual(x, z, ry);
    }

    const baseboardMaterial = this.materials.trim;
    this.addBox(root, 0.04, 0.18, 29.6, baseboardMaterial, -2.57, 0.09, 3, {});
    this.addBox(root, 0.04, 0.18, 29.6, baseboardMaterial, 2.57, 0.09, 3, {});

    this.addLamp(0, 14.5, { intensity: 13, flicker: true });
    this.addLamp(0, 8.5, { intensity: 10, broken: false, flicker: false });
    this.addLamp(0, 2.2, { intensity: 9, broken: true });
    this.addLamp(0, -4.2, { intensity: 11, flicker: true });
    this.addLamp(0, -10.4, { intensity: 8, broken: false, flicker: true });
    this.addLamp(6.45, 11.8, { intensity: 10, color: 0xcbd5b8, flicker: true });
    this.addLamp(-6.45, 6.5, { intensity: 15, color: 0xdde7d2, flicker: true });
    this.addLamp(6.2, -2.1, { intensity: 7, color: 0xbfd0bb, broken: true });
    this.addLamp(0, -16.6, { intensity: 8, color: 0xb6c4b4, flicker: true });

    const ambient = new THREE.AmbientLight(0x3d4840, 0.62);
    root.add(ambient);
    const hemisphere = new THREE.HemisphereLight(0x708076, 0x161914, 0.55);
    root.add(hemisphere);

    this.addPipes();
    this.addDust();

    this.addGurney(-1.35, 5.2, 0.1);
    this.addGurney(1.45, -7.7, -0.15);

    this.addSign("EMPFANG", 2.54, 2.54, 9.5, 1.6, 0.42, -Math.PI / 2, { fontSize: 44 });
    this.addSign("UNTERSUCHUNG", -2.54, 2.54, 4.6, 2.25, 0.4, Math.PI / 2, { fontSize: 36 });
    this.addSign("ZIMMER 03", 2.54, 2.54, -5.4, 1.65, 0.4, -Math.PI / 2, { fontSize: 40 });
    this.addSign("NEBENFLUR", 1.7, 2.52, -12.14, 1.3, 0.34, Math.PI, { fontSize: 30 });
    this.addSign("AUSGANG", 0, 2.7, 17.82, 1.65, 0.46, Math.PI, {
      background: "#2b1714",
      foreground: "#d8897e",
      border: "#8f4c43",
      fontSize: 32,
      emissive: 0x43110c,
      emissiveIntensity: 0.6,
    });

    this.addDesk(6.45, 10.85);
    this.addOfficeChair(5.55, 9.92, Math.PI);
    this.addOfficeChair(7.3, 9.9, Math.PI + 0.2);
    this.addCabinet(9.62, 7.2, -Math.PI / 2);

    const monitor = this.addBox(root, 0.52, 0.38, 0.06, this.materials.darkMetal, 7.55, 1.31, 10.86, {});
    monitor.rotation.y = Math.PI;
    this.addBox(root, 0.42, 0.3, 0.02, new THREE.MeshStandardMaterial({
      color: 0x23342c,
      emissive: 0x2d4b3c,
      emissiveIntensity: 0.5,
      roughness: 0.6,
    }), 7.55, 1.32, 10.82, {});
    this.addBox(root, 0.5, 0.04, 0.28, this.materials.darkMetal, 7.55, 1.1, 10.88, {});

    const keycard = new THREE.Group();
    keycard.position.set(5.55, 1.09, 10.5);
    keycard.rotation.y = 0.24;
    const card = new THREE.Mesh(boxGeometry(0.32, 0.012, 0.21), new THREE.MeshStandardMaterial({
      color: 0xc4c9b4,
      roughness: 0.55,
      emissive: 0x4f5846,
      emissiveIntensity: 0.25,
    }));
    keycard.add(card);
    const stripe = new THREE.Mesh(boxGeometry(0.32, 0.014, 0.055), makeMaterial(0x32362d, { roughness: 0.7 }));
    stripe.position.z = -0.05;
    keycard.add(stripe);
    const stamp = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0x843f37 }));
    stamp.rotation.x = -Math.PI / 2;
    stamp.position.set(0.06, 0.008, 0.04);
    keycard.add(stamp);
    root.add(keycard);
    this.keycardMesh = keycard;
    this.createInteractable("keycard", new THREE.Vector3(5.55, 1.0, 10.5), "Zugangskarte aufnehmen", "keycard", { mesh: keycard, radius: 2.4 });

    const file = new THREE.Group();
    file.position.set(6.9, 1.1, 10.55);
    file.rotation.y = -0.18;
    file.rotation.x = -Math.PI / 2;
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.47), this.materials.paper);
    page.rotation.z = Math.PI;
    file.add(page);
    const page2 = page.clone();
    page2.position.set(0.02, 0, 0.01);
    page2.rotation.z = Math.PI - 0.1;
    file.add(page2);
    root.add(file);
    this.createInteractable("file", new THREE.Vector3(6.9, 1.0, 10.55), "Patientenakte lesen", "file", { mesh: file, radius: 2.1 });

    const phone = new THREE.Group();
    phone.position.set(8.55, 1.09, 10.58);
    const phoneBase = new THREE.Mesh(boxGeometry(0.24, 0.08, 0.18), makeMaterial(0x353b34, { roughness: 0.72 }));
    phone.add(phoneBase);
    const handset = new THREE.Mesh(boxGeometry(0.26, 0.06, 0.07), makeMaterial(0x2b302a, { roughness: 0.62 }));
    handset.position.y = 0.07;
    phone.add(handset);
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.009, 4, 14, Math.PI * 1.6), this.materials.black);
    cord.rotation.x = Math.PI / 2;
    cord.position.set(-0.15, 0.02, 0.04);
    phone.add(cord);
    root.add(phone);
    this.createInteractable("phone", new THREE.Vector3(8.55, 1.05, 10.58), "Telefon untersuchen", "phone", { mesh: phone, radius: 1.95 });

    this.addBox(root, 0.5, 0.95, 0.38, this.materials.rust, 8.9, 0.475, 12.3, { collide: true, name: "Aktenschrank" });
    this.addBox(root, 0.04, 0.58, 0.32, this.materials.darkMetal, 8.9, 0.62, 12.08, {});

    this.addHospitalBed(-6.7, 5.55, 0);
    this.addSink(-9.72, 2.05, Math.PI / 2);
    this.addCabinet(-9.7, 6.8, Math.PI / 2);
    this.addBox(root, 1.5, 0.82, 0.65, this.materials.metal, -5.2, 0.41, 2.1, { collide: true, name: "Instrumentenwagen" });
    this.addBox(root, 1.45, 0.04, 0.6, this.materials.darkMetal, -5.2, 0.84, 2.1, {});
    this.addBox(root, 0.32, 0.04, 0.2, makeMaterial(0xb9bbae, { metalness: 0.4, roughness: 0.3 }), -5.6, 0.88, 2.1, {});
    const examLamp = new THREE.Group();
    examLamp.position.set(-6.4, 3.2, 4.85);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6), this.materials.metal);
    arm.rotation.z = Math.PI / 2;
    examLamp.add(arm);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.24, 0.18, 12), this.materials.metal);
    head.position.set(0.55, -0.08, 0);
    examLamp.add(head);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.21, 14), new THREE.MeshStandardMaterial({
      color: 0xe5efdc,
      emissive: 0xe1efd4,
      emissiveIntensity: 2.4,
      side: THREE.DoubleSide,
    }));
    glow.rotation.x = Math.PI / 2;
    glow.position.set(0.55, -0.175, 0);
    examLamp.add(glow);
    root.add(examLamp);
    const examLight = new THREE.PointLight(0xe3efd7, 8, 6, 1.9);
    examLight.position.set(-5.85, 2.9, 4.85);
    root.add(examLight);
    this.flickers.push({ light: examLight, panel: glow, panelMaterial: glow.material, base: 8, baseEmissive: 2.4, phase: 2.2, mode: "steady" });

    const note = new THREE.Group();
    note.position.set(-5.95, 1.02, 4.35);
    note.rotation.x = -Math.PI / 2;
    note.rotation.z = 0.22;
    const notePage = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.31), this.materials.paper);
    note.add(notePage);
    root.add(note);
    this.createInteractable("note", new THREE.Vector3(-5.95, 0.98, 4.35), "Notiz lesen", "note", { mesh: note, radius: 1.9 });
    this.addPapers(-7.9, 3.2, 6);

    this.addHospitalBed(6.55, -5.95, Math.PI);
    this.addOfficeChair(7.85, -3.15, -0.3);

    const windowFrame = this.addBox(root, 0.08, 1.45, 2.1, this.materials.darkMetal, 9.1, 1.95, -4.4, {});
    windowFrame.rotation.y = Math.PI / 2;
    const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshStandardMaterial({
      color: 0x1e3133,
      emissive: 0x193236,
      emissiveIntensity: 0.55,
      roughness: 0.24,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72,
    }));
    windowPane.rotation.y = -Math.PI / 2;
    windowPane.position.set(9.0, 1.98, -4.4);
    root.add(windowPane);
    const windowLight = new THREE.PointLight(0x6d969a, 8, 8, 1.8);
    windowLight.position.set(8.5, 2.2, -4.4);
    root.add(windowLight);
    this.flickers.push({ light: windowLight, panel: windowPane, panelMaterial: windowPane.material, base: 8, baseEmissive: 0.55, phase: 4.6, mode: "steady" });
    for (let i = 0; i < 4; i += 1) {
      const bar = this.addBox(root, 0.035, 1.34, 0.035, this.materials.darkMetal, 8.95, 1.98, -4.4 - 0.78 + i * 0.52, {});
      bar.rotation.y = Math.PI / 2;
    }

    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.35), this.materials.curtain);
    curtain.position.set(8.75, 1.55, -3.24);
    curtain.rotation.y = -Math.PI / 2 + 0.16;
    root.add(curtain);

    const childChair = new THREE.Group();
    childChair.position.set(4.15, 0, -2.55);
    childChair.rotation.y = 0.6;
    const seat = new THREE.Mesh(boxGeometry(0.42, 0.06, 0.4), this.materials.wood);
    seat.position.y = 0.3;
    childChair.add(seat);
    const back = new THREE.Mesh(boxGeometry(0.42, 0.46, 0.05), this.materials.wood);
    back.position.set(0, 0.53, 0.18);
    back.rotation.x = -0.06;
    childChair.add(back);
    for (const sx of [-0.17, 0.17]) {
      for (const sz of [-0.16, 0.16]) {
        const leg = new THREE.Mesh(boxGeometry(0.045, 0.3, 0.045), this.materials.wood);
        leg.position.set(sx, 0.15, sz);
        childChair.add(leg);
      }
    }
    const seatInset = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.27), makeMaterial(0x74503f, { roughness: 1 }));
    seatInset.rotation.x = -Math.PI / 2;
    seatInset.position.y = 0.335;
    childChair.add(seatInset);
    root.add(childChair);
    this.addCollider(4.15, -2.55, 0.5, 0.5, "child-chair");
    this.createInteractable("chair", new THREE.Vector3(4.15, 0.5, -2.55), "Kinderstuhl untersuchen", "chair", { mesh: childChair, radius: 1.95 });

    const iv = new THREE.Group();
    iv.position.set(4.95, 0, -6.75);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6), this.materials.metal);
    pole.position.y = 0.9;
    iv.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.035, 8), this.materials.darkMetal);
    base.position.y = 0.03;
    iv.add(base);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.06), new THREE.MeshStandardMaterial({
      color: 0x7f8f7c,
      transparent: true,
      opacity: 0.5,
      roughness: 0.4,
    }));
    bag.position.set(0, 1.52, 0);
    iv.add(bag);
    root.add(iv);

    this.addPapers(1.7, 12.6, 7);
    this.addPapers(-1.2, -0.9, 5);
    this.addPapers(0.4, -12.7, 4);
    this.addStain(-2.61, 11.2, 1.8, 2.2, Math.PI / 2, { y: 1.3 });
    this.addStain(2.61, -8.5, 1.4, 1.8, -Math.PI / 2, { y: 1.6 });
    this.addStain(6.45, 12.91, 2.3, 1.5, Math.PI, { y: 1.5 });
    this.addStain(8.6, -7.91, 1.6, 1.4, 0, { y: 1.2 });
    this.addStain(-9.9, 2.2, 1.5, 1.6, Math.PI / 2, { y: 1.5, opacity: 0.4 });
    this.addVent(-2.61, 2.55, 0.2, Math.PI / 2);
    this.addVent(2.61, 2.55, -9.4, -Math.PI / 2);
    this.addVent(6.45, 2.7, 12.91, Math.PI);

    const exitGroup = new THREE.Group();
    exitGroup.position.set(0, 0, 18.02);
    root.add(exitGroup);
    const leftDoor = new THREE.Mesh(boxGeometry(1.14, 2.44, 0.1), makeMaterial(0x3d453d, { map: disposableClone(this.baseDoorTexture), roughness: 0.82 }));
    leftDoor.position.set(-0.6, 1.22, 0);
    exitGroup.add(leftDoor);
    const rightDoor = leftDoor.clone();
    rightDoor.position.x = 0.6;
    exitGroup.add(rightDoor);
    const exitBar = new THREE.Mesh(boxGeometry(1.8, 0.06, 0.06), this.materials.darkMetal);
    exitBar.position.set(0, 1.05, -0.09);
    exitGroup.add(exitBar);
    this.addCollider(0, 18.04, 2.5, 0.18, "exit-door");
    const exitLamp = new THREE.PointLight(0xb5483d, 9, 4.2, 2);
    exitLamp.position.set(0, 2.45, 17.72);
    root.add(exitLamp);
    this.exitGlow = exitLamp;
    this.flickers.push({ light: exitLamp, panel: null, panelMaterial: null, base: 9, baseEmissive: 0, phase: 7.7, mode: "exit" });

    const lockGroup = new THREE.Group();
    lockGroup.position.set(1.18, 1.08, -11.55);
    const reader = new THREE.Mesh(boxGeometry(0.16, 0.3, 0.06), this.materials.darkMetal);
    lockGroup.add(reader);
    const readerLight = new THREE.Mesh(new THREE.CircleGeometry(0.032, 12), new THREE.MeshStandardMaterial({
      color: 0xd04b3f,
      emissive: 0xc0362b,
      emissiveIntensity: 2.3,
      side: THREE.DoubleSide,
    }));
    readerLight.position.set(0, 0.08, 0.034);
    lockGroup.add(readerLight);
    const lockLight = new THREE.PointLight(0xc0392e, 2.2, 2.1, 2);
    lockLight.position.set(0, 0.08, 0.2);
    lockGroup.add(lockLight);
    root.add(lockGroup);
    this.readerLight = readerLight;
    this.lockLight = lockLight;

    const doorPivot = new THREE.Group();
    doorPivot.position.set(-0.95, 0, -12);
    const doorMesh = new THREE.Mesh(boxGeometry(1.9, 2.4, 0.09), makeMaterial(0xffffff, { map: disposableClone(this.baseDoorTexture), roughness: 0.86 }));
    doorMesh.position.set(0.95, 1.2, 0);
    doorPivot.add(doorMesh);
    root.add(doorPivot);
    this.lockedDoorPivot = doorPivot;
    this.lockedDoorCollider = this.addCollider(0, -12, 1.95, 0.22, "locked-door");
    this.lockedDoorCollider.enabled = true;
    this.lockedDoorMesh = doorMesh;
    this.hospitalOccluders.push(doorMesh);

    const doorInteract = this.createInteractable("door", new THREE.Vector3(0, 1.1, -11.7), "Tür prüfen", "door", { mesh: doorMesh, radius: 2.2 });

    const display = new THREE.Group();
    display.position.set(1.7, 1.65, -17.1);
    display.rotation.y = -Math.PI / 2;
    const frame = new THREE.Mesh(boxGeometry(1.36, 0.79, 0.09), this.materials.darkMetal);
    display.add(frame);
    const screenMaterial = new THREE.MeshStandardMaterial({
      map: this.countdownTexture,
      emissive: 0xffffff,
      emissiveMap: this.countdownTexture,
      emissiveIntensity: 1.25,
      roughness: 0.6,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.63), screenMaterial);
    screen.position.z = 0.051;
    display.add(screen);
    root.add(display);
    paintCountdown(this.countdownCanvas, "00:09:59", false);
    this.countdownTexture.needsUpdate = true;
    this.countdownScreen = screen;
    this.createInteractable("display", new THREE.Vector3(1.55, 1.5, -17.1), "Anzeige untersuchen", "display", { mesh: display, radius: 2.4 });

    this.addBox(root, 0.3, 0.5, 0.3, this.materials.metal, -1.55, 0.25, -19.4, {});
    this.addBox(root, 0.35, 0.03, 0.35, this.materials.darkMetal, -1.55, 0.52, -19.4, {});

    const shadow = this.buildShadowFigure();
    shadow.position.set(0, 0, -20.5);
    shadow.visible = false;
    root.add(shadow);
    this.shadow = shadow;

    this.ambientLight = ambient;

    this.hospitalInteractables = this.interactables.slice();

    void doorInteract;
  }

  buildShadowFigure() {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0x030404,
      roughness: 1,
      metalness: 0,
      emissive: 0x050706,
      emissiveIntensity: 0.25,
    });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.78, 3, 7), material);
    torso.position.y = 1.17;
    torso.scale.set(1, 1.12, 0.72);
    torso.rotation.x = 0.12;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), material);
    head.position.set(0, 1.91, -0.055);
    head.scale.set(0.88, 1.12, 0.95);
    group.add(head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 6), material);
    neck.position.set(0, 1.72, -0.03);
    group.add(neck);
    const arms = [];
    const legs = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.31, 1.53, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.5, 2, 5), material);
      upper.position.y = -0.28;
      arm.add(upper);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.46, 2, 5), material);
      lower.position.y = -0.79;
      lower.rotation.z = side * 0.04;
      arm.add(lower);
      group.add(arm);
      arms.push(arm);

      const leg = new THREE.Group();
      leg.position.set(side * 0.13, 0.7, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.52, 2, 5), material);
      thigh.position.y = -0.28;
      leg.add(thigh);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 2, 5), material);
      shin.position.y = -0.83;
      leg.add(shin);
      group.add(leg);
      legs.push(leg);
    }
    group.userData.arms = arms;
    group.userData.legs = legs;
    group.userData.torso = torso;
    group.userData.head = head;
    return group;
  }

  setKeycardTaken() {
    if (this.keycardMesh) this.keycardMesh.visible = false;
    this.disableInteractable("keycard");
  }

  disableInteractable(id) {
    const entry = this.interactables.find((item) => item.id === id);
    if (entry) entry.enabled = false;
  }

  unlockDoor() {
    if (this.lockedDoorCollider) this.lockedDoorCollider.enabled = false;
    if (this.lockedDoorPivot) this.lockedDoorPivot.rotation.y = -1.52;
    if (this.lockedDoorMesh) {
      this.lockedDoorMesh.material.color.setHex(0x8b9688);
    }
    if (this.readerLight) {
      this.readerLight.material.color.setHex(0x6ca77c);
      this.readerLight.material.emissive.setHex(0x3f9a58);
    }
    if (this.lockLight) this.lockLight.color.setHex(0x4f9f67);
    this.disableInteractable("door");
  }

  closeDoor() {
    if (this.lockedDoorPivot) this.lockedDoorPivot.rotation.y = 0;
    if (this.lockedDoorCollider) this.lockedDoorCollider.enabled = true;
  }

  openDoorForChase() {
    if (this.lockedDoorPivot) this.lockedDoorPivot.rotation.y = -1.52;
    if (this.lockedDoorCollider) this.lockedDoorCollider.enabled = false;
  }

  setChaseMode(active) {
    this.chase = active;
    if (this.shadow) this.shadow.visible = active;
  }

  setShadowPosition(x, z) {
    if (this.shadow) this.shadow.position.set(x, 0, z);
  }

  setBlackout(active) {
    for (const flicker of this.flickers) {
      if (flicker.target === "bedroom") continue;
      if (active) {
        flicker.mode = "off";
        flicker.light.intensity = 0;
        if (flicker.panelMaterial) flicker.panelMaterial.emissiveIntensity = 0;
      } else if (flicker.mode === "off") {
        flicker.mode = "flicker";
      }
    }
  }

  restoreLights() {
    for (const flicker of this.flickers) {
      if (flicker.mode === "off") flicker.mode = "flicker";
    }
  }

  updateCountdown(text, glitch) {
    paintCountdown(this.countdownCanvas, text, glitch);
    this.countdownTexture.needsUpdate = true;
  }

  getNearestInteractable(position, maxDistance = 2.2, forward = null) {
    let best = null;
    let bestScore = Infinity;
    for (const entry of this.interactables) {
      if (!entry.enabled) continue;
      const dx = entry.position.x - position.x;
      const dz = entry.position.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > Math.min(maxDistance, entry.radius)) continue;
      let score = distance;
      if (forward) {
        const length = Math.hypot(dx, dz) || 1;
        const dot = (dx / length) * forward.x + (dz / length) * forward.z;
        if (dot < -0.1) continue;
        score -= dot * 0.6;
      }
      if (score < bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    return best;
  }

  animateShadow(delta, sprinting) {
    if (!this.shadow || !this.shadow.visible) return;
    const arms = this.shadow.userData.arms;
    const legs = this.shadow.userData.legs;
    const phase = this.time * (sprinting ? 10 : 5.4);
    arms[0].rotation.x = Math.sin(phase) * (sprinting ? 0.65 : 0.18);
    arms[1].rotation.x = -Math.sin(phase) * (sprinting ? 0.65 : 0.18);
    legs[0].rotation.x = -Math.sin(phase) * (sprinting ? 0.72 : 0.22);
    legs[1].rotation.x = Math.sin(phase) * (sprinting ? 0.72 : 0.22);
    this.shadow.userData.torso.rotation.z = Math.sin(phase * 0.5) * 0.025;
    this.shadow.position.y = Math.abs(Math.sin(phase)) * 0.035;
    void delta;
  }

  update(delta, playerPosition) {
    this.time += delta;
    const time = this.time;

    for (const flicker of this.flickers) {
      let factor = 1;
      if (flicker.mode === "off") factor = 0;
      else if (flicker.mode === "flicker") {
        const noise = Math.sin(time * 13.7 + flicker.phase) * 0.5 + Math.sin(time * 31.1 + flicker.phase * 1.7) * 0.5;
        factor = noise > 0.55 ? 0.1 : 0.85 + Math.sin(time * 4 + flicker.phase) * 0.15;
        if (Math.sin(time * 0.7 + flicker.phase) > 0.97) factor = 0.05;
      } else if (flicker.mode === "dying") {
        const pulse = Math.sin(time * 9.1 + flicker.phase) * Math.sin(time * 1.3 + flicker.phase * 0.4);
        factor = pulse > 0.42 ? 0.94 : 0.06;
      } else if (flicker.mode === "exit") {
        factor = this.chase ? 0.92 + Math.sin(time * 12) * 0.08 : 0.46 + Math.sin(time * 2.2) * 0.08;
      } else {
        factor = 0.96 + Math.sin(time * 1.4 + flicker.phase) * 0.04;
      }
      flicker.light.intensity = Math.max(0, flicker.base * factor);
      if (flicker.panelMaterial) {
        flicker.panelMaterial.emissiveIntensity = Math.max(0, flicker.baseEmissive * factor);
      }
    }

    if (this.dust) {
      this.dust.rotation.y = Math.sin(time * 0.02) * 0.04;
      const position = this.dust.geometry.attributes.position;
      for (let i = 0; i < position.count; i += 1) {
        let y = position.getY(i) + delta * (0.02 + (i % 7) * 0.004);
        if (y > 3) y = 0.15;
        position.setY(i, y);
      }
      position.needsUpdate = true;
    }

    if (this.shadow && this.shadow.visible) {
      const dx = playerPosition.x - this.shadow.position.x;
      const dz = playerPosition.z - this.shadow.position.z;
      const angle = Math.atan2(dx, dz);
      this.shadow.rotation.y = angle + Math.PI;
    }
  }

  showBedroom() {
    this.hospitalRoot.visible = false;
    this.bedroomRoot.visible = true;
    this.colliders = this.bedroomColliders;
    this.occluders = this.bedroomOccluders;
    this.interactables = this.bedroomInteractables;
  }

  buildBedroom() {
    const root = this.bedroomRoot;
    const width = 13;
    const depth = 12;
    this.addFloor(0, 0, width, depth, { tint: 0xb59c84, parent: root, target: "bedroom" });
    this.addCeiling(0, 0, width, depth, { parent: root, tint: 0xc8b49c });
    this.addWall(0, -depth / 2, width, WALL_THICKNESS, { materialTint: 0xc4a98d, parent: root, target: "bedroom" });
    this.addWall(0, depth / 2, width, WALL_THICKNESS, { materialTint: 0xc4a98d, parent: root, target: "bedroom" });
    this.addWall(-width / 2, 0, WALL_THICKNESS, depth, { materialTint: 0xc4a98d, parent: root, target: "bedroom" });
    this.addWall(width / 2, 0, WALL_THICKNESS, depth, { materialTint: 0xc4a98d, parent: root, target: "bedroom" });

    const wallpaper = makeMaterial(0xa88a6f, { roughness: 1 });
    this.addBox(root, width, 1.05, 0.06, this.materials.wood, 0, 0.525, -depth / 2 + 0.09, {});

    const warmLight = new THREE.PointLight(0xffc27e, 19, 9, 1.8);
    warmLight.position.set(0, 2.7, 0.6);
    root.add(warmLight);
    this.bedroomLight = warmLight;
    const lampShadeMaterial = new THREE.MeshStandardMaterial({
      color: 0xe1b47e,
      emissive: 0xffb56b,
      emissiveIntensity: 1.4,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 0.34, 10, 1, true), lampShadeMaterial);
    shade.position.set(0, 2.55, 0.6);
    root.add(shade);
    const bulb = new THREE.PointLight(0xffc98c, 3.5, 2.5, 2);
    bulb.position.set(0, 2.42, 0.6);
    root.add(bulb);
    this.flickers.push({ light: bulb, panel: shade, panelMaterial: shade.material, base: 3.5, baseEmissive: 1.4, phase: 5.1, mode: "steady", target: "bedroom" });

    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a2730,
      emissive: 0x162733,
      emissiveIntensity: 0.8,
      roughness: 0.25,
    });
    const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.55), windowMaterial);
    windowPane.position.set(-width / 2 + 0.1, 1.9, -0.6);
    windowPane.rotation.y = Math.PI / 2;
    root.add(windowPane);
    const moon = new THREE.PointLight(0x7b9eb2, 5, 7, 1.9);
    moon.position.set(-width / 2 + 1.1, 2.1, -0.6);
    root.add(moon);
    this.flickers.push({ light: moon, panel: windowPane, panelMaterial: windowMaterial, base: 5, baseEmissive: 0.8, phase: 8.2, mode: "steady", target: "bedroom" });

    const curtainMat = this.materials.curtain;
    const leftCurtain = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.1), curtainMat);
    leftCurtain.position.set(-width / 2 + 0.14, 1.8, -1.55);
    leftCurtain.rotation.y = Math.PI / 2;
    root.add(leftCurtain);
    const rightCurtain = leftCurtain.clone();
    rightCurtain.position.z = 0.35;
    root.add(rightCurtain);

    const bed = new THREE.Group();
    bed.position.set(0, 0, -3.9);
    const frame = new THREE.Mesh(boxGeometry(1.5, 0.35, 2.2), this.materials.wood);
    frame.position.y = 0.3;
    bed.add(frame);
    const mattress = new THREE.Mesh(boxGeometry(1.4, 0.24, 2.05), this.materials.mattress);
    mattress.position.y = 0.57;
    bed.add(mattress);
    const blanket = new THREE.Mesh(boxGeometry(1.45, 0.1, 1.4), makeMaterial(0x78624f, { roughness: 1 }));
    blanket.position.set(0, 0.71, 0.2);
    bed.add(blanket);
    const pillow = new THREE.Mesh(boxGeometry(0.75, 0.16, 0.36), makeMaterial(0xc9bfa8, { roughness: 1 }));
    pillow.position.set(0, 0.77, -0.72);
    bed.add(pillow);
    const headboard = new THREE.Mesh(boxGeometry(1.58, 1, 0.1), this.materials.wood);
    headboard.position.set(0, 0.75, -1.12);
    bed.add(headboard);
    root.add(bed);
    this.addBedroomCollider(0, -3.9, 1.6, 2.3);

    const desk = new THREE.Group();
    desk.position.set(4.5, 0, -2.6);
    desk.rotation.y = -0.16;
    const top = new THREE.Mesh(boxGeometry(1.5, 0.09, 0.65), this.materials.wood);
    top.position.y = 0.73;
    desk.add(top);
    for (const sx of [-0.64, 0.64]) {
      for (const sz of [-0.24, 0.24]) {
        const leg = new THREE.Mesh(boxGeometry(0.06, 0.72, 0.06), this.materials.wood);
        leg.position.set(sx, 0.36, sz);
        desk.add(leg);
      }
    }
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.46), this.materials.paper);
    paper.rotation.x = -Math.PI / 2;
    paper.rotation.z = 0.2;
    paper.position.set(0.2, 0.786, 0.03);
    desk.add(paper);
    root.add(desk);
    this.addBedroomCollider(4.5, -2.6, 1.55, 0.7);

    const chair = new THREE.Group();
    chair.position.set(2.85, 0, -2.1);
    chair.rotation.y = -0.33;
    const seat = new THREE.Mesh(boxGeometry(0.48, 0.06, 0.45), this.materials.wood);
    seat.position.y = 0.43;
    chair.add(seat);
    const back = new THREE.Mesh(boxGeometry(0.48, 0.58, 0.05), this.materials.wood);
    back.position.set(0, 0.7, 0.2);
    chair.add(back);
    for (const sx of [-0.19, 0.19]) {
      for (const sz of [-0.17, 0.17]) {
        const leg = new THREE.Mesh(boxGeometry(0.045, 0.43, 0.045), this.materials.wood);
        leg.position.set(sx, 0.215, sz);
        chair.add(leg);
      }
    }
    root.add(chair);

    const doorGroup = new THREE.Group();
    doorGroup.position.set(6.44, 0, 1.4);
    doorGroup.rotation.y = -0.5;
    const door = new THREE.Mesh(boxGeometry(1.1, 2.3, 0.08), makeMaterial(0x6f5d4b, { roughness: 0.88 }));
    door.position.set(-0.55, 1.15, 0);
    doorGroup.add(door);
    root.add(doorGroup);
    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.1), new THREE.MeshBasicMaterial({ color: 0x050403 }));
    doorway.position.set(6.41, 1.1, 1.4);
    doorway.rotation.y = -Math.PI / 2;
    root.add(doorway);

    const toy = this.buildTeddy();
    toy.position.set(0, 0, 0.7);
    toy.rotation.y = -0.4;
    root.add(toy);
    this.toyMesh = toy;
    this.createInteractable("toy", new THREE.Vector3(0, 0.35, 0.7), "Gegenstand untersuchen", "toy", { mesh: toy, radius: 2.2 });

    const cornerShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 2.5),
      new THREE.MeshBasicMaterial({ color: 0x090705, transparent: true, opacity: 0.7, depthWrite: false })
    );
    cornerShadow.position.set(-5.4, 1.25, -3.9);
    cornerShadow.rotation.y = Math.PI / 2;
    root.add(cornerShadow);

    const ambient = new THREE.AmbientLight(0x6c5442, 0.5);
    root.add(ambient);
    const hemi = new THREE.HemisphereLight(0x836b55, 0x2a1f18, 0.42);
    root.add(hemi);
    this.bedroomAmbient = ambient;

    this.addBox(root, 0.3, 0.42, 0.3, this.materials.wood, -4.4, 0.21, 2.7, {});
    const blocks = [];
    for (let i = 0; i < 5; i += 1) {
      const block = new THREE.Mesh(boxGeometry(0.16, 0.16, 0.16), makeMaterial([0x7d5c46, 0x9c7b5e, 0x5e6e5c, 0xa0967d][i % 4], { roughness: 1 }));
      block.position.set(-4.35 + (i % 3) * 0.18, 0.5 + Math.floor(i / 3) * 0.18, 2.65 + (i % 2) * 0.08);
      root.add(block);
      blocks.push(block);
    }

    this.bedroomInteractables = this.interactables.filter((entry) => entry.id === "toy");
    void wallpaper;
  }

  addBedroomCollider(x, z, width, depth, id = "bedroom-prop") {
    const collider = {
      id,
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      enabled: true,
    };
    this.bedroomColliders.push(collider);
    return collider;
  }

  buildTeddy() {
    const group = new THREE.Group();
    const fur = this.materials.toy;
    const light = this.materials.toyLight;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), fur);
    body.position.y = 0.17;
    body.scale.set(0.92, 1.08, 0.82);
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), light);
    head.position.y = 0.37;
    head.scale.set(1, 0.95, 0.95);
    group.add(head);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), fur);
      ear.position.set(side * 0.09, 0.46, 0);
      group.add(ear);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.043, 0.14, 2, 5), fur);
      arm.position.set(side * 0.17, 0.2, 0);
      arm.rotation.z = side * 0.5;
      group.add(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.12, 2, 5), fur);
      leg.position.set(side * 0.08, 0.06, 0.02);
      leg.rotation.x = Math.PI / 2;
      group.add(leg);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 5, 4), this.materials.black);
      eye.position.set(side * 0.045, 0.39, 0.105);
      group.add(eye);
    }
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), light);
    snout.position.set(0, 0.345, 0.11);
    snout.scale.set(1.1, 0.75, 0.8);
    group.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 4), this.materials.black);
    nose.position.set(0, 0.35, 0.145);
    group.add(nose);
    return group;
  }
}
