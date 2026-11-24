'use client';

import { useEffect, useRef, useState } from 'react';
import { SIGN_LINES, SIGN_LINE_MAX } from '@solrift/shared';
import { useUi } from '../ui/store';
import './signEditor.css';

/**
 * The board of a sign being written, as in Minecraft's: four lines on a plank, Enter goes to the next line (and finishes on the last),
 * Escape leaves the sign as it was. What is typed is sent to the server, which keeps it for everybody (it cleans it and checks that the
 * sign is yours to write on).
 */
function Board({ at }: { at: { x: number; y: number; z: number; lines: string[] } }) {
  const api = useUi((s) => s.api);
  const [lines, setLines] = useState<string[]>(() => Array.from({ length: SIGN_LINES }, (_, i) => at.lines[i] ?? ''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    refs.current[0]?.focus();
    refs.current[0]?.select();
  }, []);
  if (!api) return null;
  const done = () => api.signDone(lines.map((l) => l.slice(0, SIGN_LINE_MAX)));
  return (
    <div id="sign-editor-layer" onMouseDown={(e) => e.target === e.currentTarget && api.signDone(null)} onContextMenu={(e) => e.preventDefault()}>
      <div id="sign-editor" role="dialog" aria-label="Edit sign">
        <h3>Edit sign message</h3>
        <div className="sign-board">
          {lines.map((text, i) => (
            <input
              key={i}
              ref={(el) => void (refs.current[i] = el)}
              className="sign-line"
              data-line={i}
              value={text}
              maxLength={SIGN_LINE_MAX}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setLines((l) => l.map((v, j) => (j === i ? e.target.value : v)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (i < SIGN_LINES - 1) refs.current[i + 1]?.focus();
                  else done();
                } else if (e.key === 'ArrowDown' && i < SIGN_LINES - 1) {
                  e.preventDefault();
                  refs.current[i + 1]?.focus();
                } else if (e.key === 'ArrowUp' && i > 0) {
                  e.preventDefault();
                  refs.current[i - 1]?.focus();
                }
              }}
            />
          ))}
        </div>
        <div className="sign-buttons">
          <button id="sign-done" onClick={done}>
            Done
          </button>
          <button id="sign-cancel" onClick={() => api.signDone(null)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function SignEditor() {
  const at = useUi((s) => s.signEdit);
  if (!at) return null;
  // (A new board is a new editor: the lines start from what that sign says.)
  return <Board key={`${at.x},${at.y},${at.z}`} at={at} />;
}
