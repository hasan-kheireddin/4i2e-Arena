import { Engine, Scene } from '@babylonjs/core';
import { useEffect, useRef } from 'react';

interface SceneComponentProps {
  width: number;
  height: number;
  antialias?: boolean;
  onSceneReady: (scene: Scene) => void;
  onRender?: (scene: Scene) => void;
}

export default function SceneComponent({
  width,
  height,
  antialias = true,
  onSceneReady,
  onRender,
}: SceneComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const onRenderRef = useRef(onRender);

  onRenderRef.current = onRender;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    engineRef.current = new Engine(canvas, antialias, {
      preserveDrawingBuffer: true,
      stencil: true,
    });

    sceneRef.current = new Scene(engineRef.current);

    onSceneReady(sceneRef.current);

    engineRef.current.runRenderLoop(() => {
      if (sceneRef.current) {
        sceneRef.current.render();
        onRenderRef.current?.(sceneRef.current);
      }
    });

    const handleResize = () => engineRef.current?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engineRef.current?.dispose();
      engineRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
