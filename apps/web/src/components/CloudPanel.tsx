'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/store';
import { cloud, useCloud } from '../cloud/sync';

const ago = (t: number | null): string => {
  if (!t) return 'never';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 10) return 'just now';
  if (s < 90) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h} h ago` : new Date(t).toLocaleDateString();
};

const size = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Cloud save status and the few decisions it can ask for. Shown on the start/pause overlay when signed in. */
export function CloudPanel() {
  const { status, account } = useAuth();
  const s = useCloud();
  const [showBackups, setShowBackups] = useState(false);
  const accountId = account?.id;

  useEffect(() => {
    if (status === 'in' && accountId) cloud.start(accountId);
    else cloud.stop();
    return () => cloud.stop();
  }, [status, accountId]);

  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return;
    (window as unknown as Record<string, unknown>).__cloud = {
      state: () => useCloud.getState(),
      syncNow: () => cloud.syncNow(),
      takeover: () => cloud.takeover(),
    };
  }, []);

  if (status !== 'in' || s.phase === 'off') return null;

  const exportCopy = async () => {
    const { exportWorld } = await import('../game/worldIO');
    await exportWorld();
  };
  const busy = s.busy || s.phase === 'syncing' || s.phase === 'checking';
  const when = s.cloud?.updatedAt ? ago(s.cloud.updatedAt) : '';

  let body: React.ReactNode;
  switch (s.phase) {
    case 'checking':
      body = <span id="cloud-status">Cloud saves: checking...</span>;
      break;
    case 'choose':
      body = (
        <>
          <span id="cloud-status">
            {s.cloud
              ? `Your account already has a cloud copy of this world (saved ${when}, ${size(s.cloud.bytes)}), and this device has its own.`
              : 'This device has a world. Back it up to your account so it follows you?'}
          </span>
          <button id="cloud-choice-upload" disabled={busy} onClick={() => void cloud.choose('upload')}>
            {s.cloud ? "Upload this device's world (replaces the cloud copy)" : 'Upload this world'}
          </button>
          {s.cloud && (
            <button id="cloud-choice-cloud" disabled={busy} onClick={() => void cloud.choose('cloud')}>
              {"Use the cloud world (replaces this device's)"}
            </button>
          )}
          <button id="cloud-choice-later" disabled={busy} onClick={() => void cloud.choose('later')}>
            Not now
          </button>
          {s.cloud && (
            <button className="link" id="cloud-export" onClick={() => void exportCopy()}>
              Download this device&apos;s copy first
            </button>
          )}
        </>
      );
      break;
    case 'conflict':
      body = (
        <>
          <span id="cloud-status">
            The cloud copy changed on another device (saved {when || 'recently'}). Keeping this device&apos;s world overwrites the cloud copy, which is kept as a backup. Using the cloud world replaces this device&apos;s.
          </span>
          <button id="cloud-conflict-mine" disabled={busy} onClick={() => void cloud.resolveConflict('mine')}>
            {"Keep this device's world"}
          </button>
          <button id="cloud-conflict-cloud" disabled={busy} onClick={() => void cloud.resolveConflict('cloud')}>
            Use the cloud world
          </button>
          <button className="link" id="cloud-export" onClick={() => void exportCopy()}>
            Download this device&apos;s copy first
          </button>
        </>
      );
      break;
    case 'locked':
      body = (
        <>
          <span id="cloud-status">This world is open on another device or tab, so this one is not uploading.</span>
          <button id="cloud-takeover" disabled={busy} onClick={() => void cloud.takeover()}>
            Take over here
          </button>
          <button className="link" id="cloud-off" onClick={() => void cloud.disable()}>
            Stop syncing on this device
          </button>
        </>
      );
      break;
    case 'missing':
      body = (
        <>
          <span id="cloud-status">The cloud copy of this world was deleted from another device.</span>
          <button id="cloud-missing-upload" disabled={busy} onClick={() => void cloud.resolveMissing('upload')}>
            Upload this world again
          </button>
          <button id="cloud-missing-off" disabled={busy} onClick={() => void cloud.resolveMissing('off')}>
            Stop syncing
          </button>
        </>
      );
      break;
    case 'disabled':
      body = (
        <>
          <span id="cloud-status">Cloud saves are off for this world on this device.</span>
          <button id="cloud-enable" disabled={busy} onClick={() => void cloud.enable()}>
            Turn on cloud saves
          </button>
        </>
      );
      break;
    case 'offline':
    case 'error':
      body = (
        <>
          <span id="cloud-status" className="warn">
            {s.message || 'Cloud sync is paused.'}
          </span>
          <button id="cloud-sync" disabled={busy} onClick={() => void cloud.syncNow()}>
            Try again
          </button>
        </>
      );
      break;
    default:
      body = (
        <>
          <span id="cloud-status">
            {s.phase === 'syncing' ? 'Cloud saves: syncing...' : s.lastSync ? `Cloud saves on, synced ${ago(s.lastSync)}` : 'Cloud saves on'}
            {s.message ? ` ${s.message}` : ''}
          </span>
          <button id="cloud-sync" disabled={busy} onClick={() => void cloud.syncNow()}>
            Sync now
          </button>
          <button
            id="cloud-backups-btn"
            disabled={busy}
            onClick={() => {
              const next = !showBackups;
              setShowBackups(next);
              if (next) void cloud.loadBackups();
            }}
          >
            Backups
          </button>
          <button className="link" id="cloud-off" disabled={busy} onClick={() => void cloud.disable()}>
            Turn off
          </button>
          <button
            className="link"
            id="cloud-delete"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Delete the cloud copy of this world? Your world on this device is kept, and the next sync uploads it again.')) void cloud.deleteCloud();
            }}
          >
            Delete cloud copy
          </button>
          {showBackups && (
            <ul id="cloud-backup-list">
              {s.backups.length === 0 && <li>No backups yet. Backups are taken automatically about once an hour and before anything is overwritten.</li>}
              {s.backups.map((b) => (
                <li key={b.id}>
                  {new Date(b.createdAt).toLocaleString()} &middot; {b.kind} &middot; {size(b.bytes)}{' '}
                  <button
                    className="cloud-restore"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Restore this backup? It becomes the cloud world and replaces this device\'s copy. The current cloud world is kept as a backup.')) void cloud.restoreBackup(b.id);
                    }}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      );
  }

  return (
    <div className="cloud-panel" id="cloud-panel" data-phase={s.phase} data-no-play>
      {body}
    </div>
  );
}
