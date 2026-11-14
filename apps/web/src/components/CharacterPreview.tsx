'use client';

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { CharacterPreview as Scene } from '../game/characterPreview';
import { paletteOfLook } from '../game/lookPalette';
import { useProfile } from '../profile/store';

/** The character in the inventory screen, wearing `armor` (the clothes of a class too: they are items) (item ids: helmet, chestplate, leggings, boots) and holding a shield. */
export function CharacterPreview({ armor, shield = 0, shieldIcon = null, turntable = false }: { armor: number[]; shield?: number; shieldIcon?: string | null; turntable?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const key = armor.join(',');
  const look = useProfile((s) => s.look);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: Scene;
    try {
      scene = new Scene(canvas);
    } catch {
      return; // no WebGL: the inventory still works without the picture
    }
    sceneRef.current = scene;
    scene.setLook(paletteOfLook(useProfile.getState().look));
    scene.setArmor(key ? key.split(',').map(Number) : []);
    scene.setTurntable(turntable);
    scene.setShield(shield, shieldIcon);
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      scene.look(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height * 0.28));
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      sceneRef.current = null;
      scene.dispose();
    };
    // The scene is created once per screen; armor changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setLook(paletteOfLook(look));
  }, [look]);

  useEffect(() => {
    sceneRef.current?.setArmor(key ? key.split(',').map(Number) : []);
  }, [key]);

  useEffect(() => {
    sceneRef.current?.setShield(shield, shieldIcon);
  }, [shield, shieldIcon]);

  // Drag the figure to turn it round.
  const drag = useRef<{ id: number; x: number } | null>(null);
  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    drag.current = { id: e.pointerId, x: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    sceneRef.current?.dragBy(e.clientX - d.x);
    d.x = e.clientX;
  };
  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
    sceneRef.current?.release();
  };

  return <canvas ref={canvasRef} className="char-preview" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />;
}
