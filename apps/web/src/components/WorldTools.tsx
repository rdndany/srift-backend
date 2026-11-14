'use client';

import { useRef, useState } from 'react';

/** Export / import the current world as a `.solrift` file. Lives in the start/pause overlay. */
export function WorldTools() {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg('');
    try {
      const res = await fn();
      if (res) setMsg(res);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="world-tools" data-no-play>
      <button
        id="export-world"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const { exportWorld } = await import('../game/worldIO');
            return `Saved ${await exportWorld()}`;
          })
        }
      >
        Export world
      </button>
      <button id="import-world" disabled={busy} onClick={() => input.current?.click()}>
        Import world
      </button>
      <input
        ref={input}
        id="import-file"
        type="file"
        accept={`.solrift,.${'sol' + 'craft'}`} /* backups made before the rename still import */
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (!window.confirm('Importing replaces the current world (same seed) with the file. Export first if you want a backup. Continue?')) return;
          void run(async () => {
            const { importWorld } = await import('../game/worldIO');
            await importWorld(file);
          });
        }}
      />
      <span id="world-msg">{msg}</span>
    </div>
  );
}
