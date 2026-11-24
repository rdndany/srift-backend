'use client';

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { CharacterPreview as Scene } from '../game/characterPreview';
import { paletteOfCode, paletteOfLook } from '../game/lookPalette';
import { useProfile } from '../profile/store';

/** The character in the inventory screen, wearing `armor` (the clothes of a class too: they are items) (item ids: helmet, chestplate, leggings, boots) and holding a shield. `wings` and `companion` are the numbers the wire gives (0: none). `lookCode` draws that saved look instead of the one being edited. */
export function CharacterPreview({ armor, shield = 0, held = 0, turntable = false, grounded = false, lookCode, wings = 0, companion = 0, stage = false }: { armor: number[]; shield?: number; held?: number; turntable?: boolean; grounded?: boolean; lookCode?: number; wings?: number; companion?: number; stage?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const key = armor.join(',');
  const profileLook = useProfile((s) => s.look);
  const profileOutfit = useProfile((s) => s.outfit);

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
    scene.setLook(lookCode === undefined ? paletteOfLook(useProfile.getState().look, useProfile.getState().outfit) : paletteOfCode(lookCode));
    scene.setGrounded(grounded);
    scene.setStage(stage);
    scene.setArmor(key ? key.split(',').map(Number) : []);
    scene.setTurntable(turntable);
    scene.setHeld(held);
    scene.setShield(shield);
    scene.setWings(wings);
    scene.setCompanion(companion);
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      scene.look(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height * 0.28));
    };
    window.addEventListener('mousemove', onMove);
    // A picture that is given more (or less) room later, as a page lays itself out, is drawn again to fit it.
    const fit = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scene.resize());
    fit?.observe(canvas);
    return () => {
      fit?.disconnect();
      window.removeEventListener('mousemove', onMove);
      sceneRef.current = null;
      scene.dispose();
    };
    // The scene is created once per screen; armor changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setLook(lookCode === undefined ? paletteOfLook(profileLook, profileOutfit) : paletteOfCode(lookCode));
  }, [lookCode, profileLook, profileOutfit]);

  useEffect(() => {
    sceneRef.current?.setArmor(key ? key.split(',').map(Number) : []);
  }, [key]);

  useEffect(() => {
    sceneRef.current?.setWings(wings);
  }, [wings]);

  useEffect(() => {
    sceneRef.current?.setCompanion(companion);
  }, [companion]);

  useEffect(() => {
    sceneRef.current?.setTurntable(turntable);
  }, [turntable]);

  useEffect(() => {
    sceneRef.current?.setStage(stage);
  }, [stage]);

  useEffect(() => {
    sceneRef.current?.setHeld(held);
  }, [held]);

  useEffect(() => {
    sceneRef.current?.setShield(shield);
  }, [shield]);

  // Drag the figure to turn it round.
  const drag = useRef<{ id: number; x: number } | null>(null);
  const onDown = (e: ReactPointerEvent<HTMLElement>) => {
    drag.current = { id: e.pointerId, x: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    sceneRef.current?.dragBy(e.clientX - d.x);
    d.x = e.clientX;
  };
  const onUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
    sceneRef.current?.release();
  };

  const canvas = <canvas ref={canvasRef} className="char-preview" onPointerDown={stage ? undefined : onDown} onPointerMove={stage ? undefined : onMove} onPointerUp={stage ? undefined : onUp} onPointerCancel={stage ? undefined : onUp} />;
  // On the lobby stage the picture is wider than the body (wings, a companion). Dragging stays on the body, so the panels beside it keep their clicks.
  if (!stage) return canvas;
  return (
    <div className="char-stage">
      {canvas}
      <div className="char-stage-hit" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
    </div>
  );
}
