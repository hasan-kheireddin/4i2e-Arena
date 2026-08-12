import { useRef } from 'react';
import {
  Scene, Vector3, Color3, Color4, Mesh, ArcRotateCamera,
  DirectionalLight, HemisphericLight, ShadowGenerator,
  SceneLoader, GlowLayer,
} from '@babylonjs/core';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { NoiseProceduralTexture } from '@babylonjs/core/Materials/Textures/Procedurals/noiseProceduralTexture';
import '@babylonjs/loaders';
import SceneComponent from './SceneComponent';
import {
  createPaddleMesh,
  createBallMesh,
  createArena,
  createCenterLine,
} from './ObjectConverter';

export interface Renderer3DProps {
  ball: { x: number; y: number };
  paddles: { 1: { y: number }; 2: { y: number } };
  fieldWidth: number;
  fieldHeight: number;
  flipped: boolean;
  paddleOffset?: number;
}

const PADDLE_W = 12;
const PADDLE_H = 80;
const PADDLE_D = 12;
const BALL_R = 8;

function degToRad(d: number) {
  return d * (Math.PI / 180);
}

export default function Renderer3D(props: Renderer3DProps) {
  const { fieldWidth, fieldHeight } = props;
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const ballMeshRef = useRef<Mesh | null>(null);
  const paddle1MeshRef = useRef<Mesh | null>(null);
  const paddle2MeshRef = useRef<Mesh | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const onSceneReady = (scene3D: Scene) => {
    sceneRef.current = scene3D;
    scene3D.clearColor = new Color4(0.01, 0.01, 0.04, 1);

    const canvas = scene3D.getEngine().getRenderingCanvas();
    if (canvas) canvas.focus();

    const camera = new ArcRotateCamera(
      'cam3d',
      -Math.PI / 2,
      degToRad(60),
      720,
      Vector3.Zero(),
      scene3D,
    );
    camera.attachControl(true);
    cameraRef.current = camera;
    const kb = camera.inputs.attached.keyboard as any;
    if (kb) { kb.keysUp = []; kb.keysDown = []; kb.keysLeft = []; kb.keysRight = []; }
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = degToRad(85);
    camera.lowerRadiusLimit = 200;

    const dirLight = new DirectionalLight('dirLight', new Vector3(-0.3, 1, -0.5), scene3D);
    dirLight.intensity = 0.3;
    dirLight.position = new Vector3(0, 100, 0);

    const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene3D);
    hemiLight.intensity = 0.3;

    const shadowGen = new ShadowGenerator(1024, dirLight);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurBoxOffset = 2;

    const glow = new GlowLayer('glow', scene3D);
    glow.intensity = 1.5;

    SceneLoader.ImportMeshAsync(null, '/models/', 'arena.glb', scene3D).then((result) => {
      result.meshes.forEach((m: any) => {
        m.scaling = new Vector3(7, 7, 7);
        m.position = new Vector3(0, -0.8, 0);
      });
    }).catch(() => {});

    SceneLoader.ImportMeshAsync(null, '/models/', 'arenaboundaries.glb', scene3D).then((result) => {
      const all = [...result.meshes, ...result.transformNodes];
      all.forEach((m: any) => {
        m.scaling = new Vector3(3.75, 3.75, 3);
       
      });
    }).catch(() => {});

    const arenaBounds = createArena('arena', fieldWidth, fieldHeight, scene3D);
    Object.values(arenaBounds).forEach((m) => m.setEnabled(false));
    createCenterLine('center', fieldHeight, scene3D);

    const halfW = fieldWidth / 2;
    const paddleOffset = props.paddleOffset ?? PADDLE_W;

    const bMesh = createBallMesh('ball', BALL_R, scene3D);
    bMesh.position = new Vector3(0, BALL_R, 0);
    shadowGen.addShadowCaster(bMesh);
    ballMeshRef.current = bMesh;

    const p1Mesh = createPaddleMesh(
      'paddle1', PADDLE_W, PADDLE_D, PADDLE_H,
      new Color3(0.11, 0.3, 0.85), new Color3(0.2, 0.4, 1), scene3D,
    );
    p1Mesh.position = new Vector3(-halfW + paddleOffset, PADDLE_D / 2, 0);
    shadowGen.addShadowCaster(p1Mesh);
    paddle1MeshRef.current = p1Mesh;

    const p2Mesh = createPaddleMesh(
      'paddle2', PADDLE_W, PADDLE_D, PADDLE_H,
      new Color3(0.86, 0.15, 0.15), new Color3(1, 0.2, 0.2), scene3D,
    );
    p2Mesh.position = new Vector3(halfW - paddleOffset, PADDLE_D / 2, 0);
    shadowGen.addShadowCaster(p2Mesh);
    paddle2MeshRef.current = p2Mesh;

    // Sharp pinpoint ember texture — tight hot core
    const pSize = 32;
    const pCanvas = document.createElement('canvas');
    pCanvas.width = pSize;
    pCanvas.height = pSize;
    const pCtx = pCanvas.getContext('2d')!;
    const grad = pCtx.createRadialGradient(pSize/2, pSize/2, 0, pSize/2, pSize/2, pSize/2);
    grad.addColorStop(0,    'rgba(255,255,240,1)');
    grad.addColorStop(0.08, 'rgba(255,200,120,1)');
    grad.addColorStop(0.25, 'rgba(255,90,10,0.6)');
    grad.addColorStop(0.5,  'rgba(180,30,0,0.2)');
    grad.addColorStop(1,    'rgba(60,0,0,0)');
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, pSize, pSize);

    const imageData = pCtx.getImageData(0, 0, pSize, pSize);
    const pTex = RawTexture.CreateRGBATexture(imageData.data, pSize, pSize, scene3D, false, false);
    const noiseTex = new NoiseProceduralTexture('noise', 256, scene3D);

    // Particles already suspended in mid-air across the full 3D volume,
    // drifting horizontally — no rising, no gravity, just lazy sideways float.
    // emit box spans full arena width (X), full height (Y), full depth (Z)
    // so they appear everywhere at once rather than spawning from the floor.
    const makeFloaters = (name: string) => {
      const ps = new ParticleSystem(name, 1200, scene3D);
      ps.particleTexture = pTex;
      ps.noiseTexture = noiseTex;
      // Noise adds organic wobble without pulling them vertically
      ps.noiseStrength = new Vector3(6, 1, 6);
      // Centre of scene; emit box covers everything
      ps.emitter = new Vector3(0, 0, 0);
      // Fill the entire visible volume so particles are already "there"
      ps.minEmitBox = new Vector3(-480, 10,  -350);
      ps.maxEmitBox = new Vector3( 480, 280,  350);
      // Pure horizontal drift — X dominant, Y almost zero, Z slight
      ps.direction1 = new Vector3(-10, -0.5, -3);
      ps.direction2 = new Vector3( 10,  0.5,  3);
      // Deep lava orange-red, fades in and out
      ps.addColorGradient(0,    new Color4(1,   0.5,  0.04, 0));
      ps.addColorGradient(0.12, new Color4(1,   0.4,  0.02, 0.95));
      ps.addColorGradient(0.5,  new Color4(0.9, 0.22, 0.01, 0.7));
      ps.addColorGradient(0.82, new Color4(0.5, 0.07, 0,    0.3));
      ps.addColorGradient(1,    new Color4(0.1, 0,    0,    0));
      // Small sharp dots, constant size through most of life
      ps.addSizeGradient(0,    0);
      ps.addSizeGradient(0.08, 3);
      ps.addSizeGradient(0.4,  2.5);
      ps.addSizeGradient(0.85, 1.5);
      ps.addSizeGradient(1,    0);
      ps.minLifeTime = 5;
      ps.maxLifeTime = 12;
      // Low power = slow lazy drift, not a launch
      ps.minEmitPower = 2;
      ps.maxEmitPower = 7;
      ps.emitRate = 160;
      ps.minAngularSpeed = -0.1;
      ps.maxAngularSpeed = 0.1;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      // Zero gravity — they just float
      ps.gravity = new Vector3(0, 0, 0);
      ps.start();
      return ps;
    };

    // Slower, larger sparse drifters for depth / layering
    const makeLazySparks = (name: string) => {
      const ps = new ParticleSystem(name, 400, scene3D);
      ps.particleTexture = pTex;
      ps.noiseTexture = noiseTex;
      ps.noiseStrength = new Vector3(4, 0.5, 4);
      ps.emitter = new Vector3(0, 0, 0);
      ps.minEmitBox = new Vector3(-480, 20,  -350);
      ps.maxEmitBox = new Vector3( 480, 300,  350);
      // Wider horizontal range, almost no vertical movement
      ps.direction1 = new Vector3(-14, -0.3, -5);
      ps.direction2 = new Vector3( 14,  0.3,  5);
      ps.addColorGradient(0,    new Color4(1,   0.55, 0.05, 0));
      ps.addColorGradient(0.1,  new Color4(1,   0.38, 0.02, 0.85));
      ps.addColorGradient(0.55, new Color4(0.7, 0.15, 0,    0.5));
      ps.addColorGradient(1,    new Color4(0.15,0,    0,    0));
      ps.addSizeGradient(0,    0);
      ps.addSizeGradient(0.1,  4.5);
      ps.addSizeGradient(0.45, 3.5);
      ps.addSizeGradient(0.9,  1);
      ps.addSizeGradient(1,    0);
      ps.minLifeTime = 7;
      ps.maxLifeTime = 16;
      ps.minEmitPower = 1;
      ps.maxEmitPower = 4;
      ps.emitRate = 45;
      ps.minAngularSpeed = -0.05;
      ps.maxAngularSpeed = 0.05;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.gravity = new Vector3(0, 0, 0);
      ps.start();
      return ps;
    };

    makeFloaters('floaters');
    makeLazySparks('lazySparks');
  };

  const onRender = () => {
    const p = propsRef.current;
    const bMesh = ballMeshRef.current;
    const p1Mesh = paddle1MeshRef.current;
    const p2Mesh = paddle2MeshRef.current;
    if (!bMesh && !p1Mesh && !p2Mesh) return;

    const halfH = p.fieldHeight / 2;
    const halfW = p.fieldWidth / 2;
    const zFlip = cameraRef.current && Math.sin(cameraRef.current.alpha) > 0 ? -1 : 1;
    const ballZ = zFlip * (halfH - p.ball.y);
    const ballX = p.flipped ? p.fieldWidth - p.ball.x : p.ball.x;
    if (bMesh) {
      bMesh.position = new Vector3(ballX - halfW, BALL_R, ballZ);
    }

    if (p1Mesh) {
      const p1Data = p.flipped ? p.paddles[2].y : p.paddles[1].y;
      p1Mesh.position.x = -halfW + (p.paddleOffset ?? PADDLE_W);
      p1Mesh.position.z = zFlip * (halfH - p1Data);
    }

    if (p2Mesh) {
      const p2Data = p.flipped ? p.paddles[1].y : p.paddles[2].y;
      p2Mesh.position.x = halfW - (p.paddleOffset ?? PADDLE_W);
      p2Mesh.position.z = zFlip * (halfH - p2Data);
    }

  };

  return (
    <SceneComponent
      antialias
      width={fieldWidth}
      height={fieldHeight}
      onSceneReady={onSceneReady}
      onRender={onRender}
    />
  );
}
