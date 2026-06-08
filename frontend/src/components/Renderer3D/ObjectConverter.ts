import {
  Vector3, MeshBuilder, Scene, Color3, StandardMaterial, PBRMaterial,
} from '@babylonjs/core';

export function createPaddleMesh(
  name: string,
  width: number,
  height: number,
  depth: number,
  color: Color3,
  emissiveColor: Color3,
  scene: Scene,
) {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width, height, depth },
    scene,
  );
  const mat = new PBRMaterial(`${name}_mat`, scene);
  mat.albedoColor = color;
  mat.emissiveColor = emissiveColor;
  mat.emissiveIntensity = 0.7;
  mat.metallic = 0;
  mat.roughness = 0;
  mat.disableLighting = true;
  mesh.material = mat;
  return mesh;
}

export function createBallMesh(
  name: string,
  radius: number,
  scene: Scene,
) {
  const mesh = MeshBuilder.CreateSphere(name, { diameter: radius * 2, segments: 16 }, scene);
  const mat = new PBRMaterial(`${name}_mat`, scene);
  mat.albedoColor = new Color3(0.7, 0.7, 0.7);
  mat.emissiveColor = new Color3(0.6, 0.6, 0.6);
  mat.emissiveIntensity = 0.7;
  mat.metallic = 0;
  mat.roughness = 0;
  mat.disableLighting = true;
  mesh.material = mat;
  return mesh;
}

export function createArena(
  name: string,
  width: number,
  height: number,
  scene: Scene,
) {
  const borderColor = new Color3(0.25, 0.25, 0.35);
  const borderDepth = 3;
  const wallHeight = 8;

  const top = MeshBuilder.CreateBox(
    `${name}_top`,
    { width: width + borderDepth * 2, height: wallHeight, depth: borderDepth },
    scene,
  );
  top.position = new Vector3(0, wallHeight / 2, height / 2 + borderDepth / 2);
  const topMat = new StandardMaterial(`${name}_top_mat`, scene);
  topMat.diffuseColor = borderColor;
  topMat.specularColor = new Color3(0.3, 0.3, 0.3);
  top.material = topMat;

  const bottom = MeshBuilder.CreateBox(
    `${name}_bottom`,
    { width: width + borderDepth * 2, height: wallHeight, depth: borderDepth },
    scene,
  );
  bottom.position = new Vector3(0, wallHeight / 2, -(height / 2 + borderDepth / 2));
  const bottomMat = new StandardMaterial(`${name}_bottom_mat`, scene);
  bottomMat.diffuseColor = borderColor;
  bottomMat.specularColor = new Color3(0.3, 0.3, 0.3);
  bottom.material = bottomMat;

  const left = MeshBuilder.CreateBox(
    `${name}_left`,
    { width: borderDepth, height: wallHeight, depth: height },
    scene,
  );
  left.position = new Vector3(-(width / 2 + borderDepth / 2), wallHeight / 2, 0);
  const leftMat = new StandardMaterial(`${name}_left_mat`, scene);
  leftMat.diffuseColor = borderColor;
  leftMat.specularColor = new Color3(0.3, 0.3, 0.3);
  left.material = leftMat;

  const right = MeshBuilder.CreateBox(
    `${name}_right`,
    { width: borderDepth, height: wallHeight, depth: height },
    scene,
  );
  right.position = new Vector3(width / 2 + borderDepth / 2, wallHeight / 2, 0);
  const rightMat = new StandardMaterial(`${name}_right_mat`, scene);
  rightMat.diffuseColor = borderColor;
  rightMat.specularColor = new Color3(0.3, 0.3, 0.3);
  right.material = rightMat;

  const floorMat = new StandardMaterial(`${name}_floor_mat`, scene);
  floorMat.diffuseColor = new Color3(0.06, 0.06, 0.12);
  floorMat.specularColor = new Color3(0.05, 0.05, 0.1);

  const floor = MeshBuilder.CreateGround(
    `${name}_floor`,
    { width: width + borderDepth * 2, height: height + borderDepth * 2 },
    scene,
  );
  floor.position = new Vector3(0, 0, 0);
  floor.material = floorMat;

  return { top, bottom, left, right, floor };
}

export function createCenterLine(
  name: string,
  fieldHeight: number,
  scene: Scene,
) {
  const segments = 20;
  const gap = 6;
  const segHeight = (fieldHeight - gap * (segments - 1)) / segments;
  const meshes = [];
  for (let i = 0; i < segments; i++) {
    const z = -(fieldHeight / 2) + gap + segHeight / 2 + i * (segHeight + gap);
    const mesh = MeshBuilder.CreateBox(
      `${name}_${i}`,
      { width: 0.5, height: 1, depth: segHeight },
      scene,
    );
    mesh.position = new Vector3(0, 0.5, z);
    const mat = new StandardMaterial(`${name}_mat_${i}`, scene);
    mat.diffuseColor = new Color3(0.3, 0.3, 0.45);
    mat.alpha = 0.4;
    mesh.material = mat;
    meshes.push(mesh);
  }
  return meshes;
}
