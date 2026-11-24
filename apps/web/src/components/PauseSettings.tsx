'use client';

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { SETTING_RANGE, resetSettings, setSettings, useSettings, type Settings } from '../game/settings';
import { voiceKeyLabel, voiceKeyOk } from '../game/voiceBind';
import { useUi } from '../ui/store';

/** The keys the pause screen lists: [keys, what they do]. */
const CONTROLS: readonly (readonly [readonly string[], string])[] = [
  [['W', 'A', 'S', 'D'], 'Move'],
  [['Space'], 'Jump'],
  [['Shift'], 'Sneak'],
  [['W', 'W'], 'Sprint (double-tap, or Ctrl)'],
  [['Left click'], 'Mine (hold)'],
  [['Right click'], 'Place, use, eat'],
  [['1-9'], 'Hotbar (or mouse wheel)'],
  [['E'], 'Inventory'],
  [['Q'], 'Drop (Ctrl+Q the stack)'],
  [['F4'], 'Survival / creative'],
  [['F'], 'Fly (creative)'],
  [['M'], 'Music on / off'],
  [['F3'], 'Debug info'],
  [['F2'], 'Admin bar (frame rate, load)'],
  [['[', ']'], 'Render distance'],
  [['R'], 'Respawn'],
  [['T'], 'Chat (online)'],
  [['Esc'], 'Pause'],
];

type Tab = 'audio' | 'graphics' | 'gameplay' | 'controls';

const TABS: readonly { id: Tab; label: string; icon: string }[] = [
  { id: 'audio', label: 'Audio', icon: '\u266A' },
  { id: 'graphics', label: 'Graphics', icon: '\u25A3' },
  { id: 'gameplay', label: 'Gameplay', icon: '\u2726' },
  { id: 'controls', label: 'Controls', icon: '\u2328' },
];

/** One slider: a name, a bar that fills like the experience bar, and its value. */
function Slider({ id, label, hint, value, min, max, step, show, disabled, onChange }: { id: string; label: string; hint?: string; value: number; min: number; max: number; step: number; show: (v: number) => string; disabled?: boolean; onChange: (v: number) => void }) {
  const inputId = useId();
  const fill = (value - min) / (max - min);
  return (
    <div className={`ps-row${disabled ? ' off' : ''}`}>
      <label htmlFor={inputId}>
        {label}
        {hint && <small>{hint}</small>}
      </label>
      <input
        id={inputId}
        data-setting={id}
        className="ps-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${Math.round(fill * 1000) / 10}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        // The wheel over a slider scrolls the page, as everywhere else on it.
        onWheel={(e) => e.currentTarget.blur()}
      />
      <output htmlFor={inputId}>{show(value)}</output>
    </div>
  );
}

/** An on / off switch with a label. */
function Switch({ id, label, hint, on, disabled, onChange }: { id: string; label: string; hint?: string; on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className={`ps-row ps-switch${disabled ? ' off' : ''}`}>
      <span className="ps-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button type="button" id={id} role="switch" aria-checked={on} className={`ps-toggle${on ? ' on' : ''}`} disabled={disabled} onClick={() => onChange(!on)}>
        <i aria-hidden="true" />
        <span>{on ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

function Group({ title, children, reset }: { title: string; children: ReactNode; reset?: () => void }) {
  return (
    <section className="ps-group">
      <header>
        <h3>{title}</h3>
        {reset && (
          <button type="button" className="ps-reset" onClick={reset}>
            Reset
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** The microphones the browser will offer. Names appear after the microphone has been allowed. */
function useMics(refresh: boolean): { id: string; label: string }[] {
  const [list, setList] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    const devices = navigator.mediaDevices;
    if (!devices?.enumerateDevices) return;
    let stop = false;
    const load = () => {
      void devices.enumerateDevices().then((all) => {
        if (stop) return;
        const mics = all.filter((d) => d.kind === 'audioinput' && d.deviceId);
        setList(mics.map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })));
      }).catch(() => undefined);
    };
    load();
    devices.addEventListener('devicechange', load);
    return () => {
      stop = true;
      devices.removeEventListener('devicechange', load);
    };
  }, [refresh]);
  return list;
}

/** The key that talks. Click it, then press a key. A key the game already uses is refused. */
function TalkKey({ code, onPick }: { code: string; onPick: (code: string) => void }) {
  const [listen, setListen] = useState(false);
  const [taken, setTaken] = useState(false);
  useEffect(() => {
    if (!listen) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') {
        setListen(false);
        setTaken(false);
        return;
      }
      if (!voiceKeyOk(e.code)) {
        setTaken(true);
        return;
      }
      setTaken(false);
      setListen(false);
      onPick(e.code);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listen, onPick]);
  return (
    <div className="ps-row ps-switch">
      <span className="ps-label">
        Talk key
        <small>{taken ? 'That key already does something' : listen ? 'Press a key. Escape cancels.' : 'The one you talk with'}</small>
      </span>
      <button type="button" id="mic-key" className={`ps-key${listen ? ' listen' : ''}`} onClick={() => { setTaken(false); setListen(true); }}>
        {listen ? 'Press a key' : voiceKeyLabel(code)}
      </button>
    </div>
  );
}

function AudioTab({ s }: { s: Settings }) {
  const r = SETTING_RANGE;
  const live = useUi((st) => st.voiceLive);
  const micOn = useUi((st) => st.voiceOn);
  const mics = useMics(micOn);
  const chosen = mics.some((m) => m.id === s.micDevice) ? s.micDevice : '';
  const pickMic = (micDevice: string) => {
    setSettings({ micDevice });
    if (useUi.getState().voiceOn) useUi.getState().api?.toggleVoice(true);
  };
  const talk = voiceKeyLabel(s.voiceKey);
  const hold = s.pushToTalk;
  return (
    <>
      <Group title="Volume" reset={() => resetSettings(['master', 'effects', 'ambience', 'music', 'muted'])}>
        <Switch id="mute-toggle" label="Mute everything" hint="Keeps your levels" on={s.muted} onChange={(muted) => setSettings({ muted })} />
        <Slider id="master" label="Master" hint="Everything you hear" value={s.master} min={r.master[0]} max={r.master[1]} step={0.01} show={pct} disabled={s.muted} onChange={(master) => setSettings({ master })} />
        <Slider id="effects" label="Effects" hint="Blocks, steps, fights, spells" value={s.effects} min={r.effects[0]} max={r.effects[1]} step={0.01} show={pct} disabled={s.muted} onChange={(effects) => setSettings({ effects })} />
        <Slider id="ambience" label="Ambience" hint="Wind, rain, birds, caves" value={s.ambience} min={r.ambience[0]} max={r.ambience[1]} step={0.01} show={pct} disabled={s.muted} onChange={(ambience) => setSettings({ ambience })} />
        <Slider id="music" label="Music" hint="Press M to switch it" value={s.music} min={r.music[0]} max={r.music[1]} step={0.01} show={pct} disabled={s.muted} onChange={(music) => setSettings({ music })} />
      </Group>
      <Group
        title="Microphone"
        reset={() => {
          resetSettings(['voice', 'micDevice', 'pushToTalk', 'voiceKey']);
          if (useUi.getState().voiceOn) useUi.getState().api?.toggleVoice(false, true);
        }}
      >
        <Switch
          id="mic-ptt"
          label="Push to talk"
          hint={hold ? `Hold ${talk} while you play. The microphone is on only then.` : 'The key switches the microphone on and off'}
          on={hold}
          onChange={(pushToTalk) => {
            setSettings({ pushToTalk });
            if (pushToTalk && useUi.getState().voiceOn) useUi.getState().api?.toggleVoice(false, true);
          }}
        />
        <TalkKey code={s.voiceKey} onPick={(voiceKey) => setSettings({ voiceKey })} />
        <Switch id="mic-toggle" label="Microphone" hint={live ? (hold ? `Hold ${talk} in the game.` : `Press ${talk} in the game.`) : 'Only while you play online'} on={micOn} disabled={!live || hold} onChange={(on) => useUi.getState().api?.toggleVoice(on)} />
        <div className="ps-row ps-switch">
          <label htmlFor="mic-device">
            Input
            <small>The one you speak into</small>
          </label>
          <select id="mic-device" className="ps-select" value={chosen || s.micDevice} onChange={(e) => pickMic(e.target.value)}>
            <option value="">Default</option>
            {s.micDevice && !mics.some((m) => m.id === s.micDevice) ? <option value={s.micDevice}>Saved microphone</option> : null}
            {mics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <Slider id="voice" label="Voices" hint="How loud other players are" value={s.voice} min={r.voice[0]} max={r.voice[1]} step={0.01} show={pct} disabled={s.muted} onChange={(voice) => setSettings({ voice })} />
      </Group>
      <p className="ps-note">Sound starts once you have clicked into the game. The sliders keep their place between visits. The microphone stays off until you turn it on, or until you hold its key.</p>
    </>
  );
}

function GraphicsTab({ s }: { s: Settings }) {
  const r = SETTING_RANGE;
  return (
    <>
      <Group title="View" reset={() => resetSettings(['fov', 'renderDistance'])}>
        <Slider id="fov" label="Field of view" hint="Wider sees more at the sides" value={s.fov} min={r.fov[0]} max={r.fov[1]} step={1} show={(v) => `${v}\u00B0`} onChange={(fov) => setSettings({ fov })} />
        <Slider id="render-distance" label="Render distance" hint="Chunks drawn around you ([ and ])" value={s.renderDistance} min={r.renderDistance[0]} max={r.renderDistance[1]} step={1} show={(v) => `${v} chunks`} onChange={(renderDistance) => setSettings({ renderDistance })} />
      </Group>
      <Group title="Effects" reset={() => resetSettings(['shadows', 'ao', 'glow', 'grade', 'rays', 'menuBlur'])}>
        <Switch id="fx-shadows" label="Shadows" hint="The sun's shadows on the ground" on={s.shadows} onChange={(shadows) => setSettings({ shadows })} />
        <Switch id="fx-ao" label="Ambient occlusion" hint="Soft dark corners and creases (F6)" on={s.ao} onChange={(ao) => setSettings({ ao })} />
        <Switch id="fx-glow" label="Glow" hint="Light round torches, lava and gems (F7)" on={s.glow} onChange={(glow) => setSettings({ glow })} />
        <Switch id="fx-grade" label="Colour grading" hint="Warm light by day's end, a soft vignette (F8)" on={s.grade} onChange={(grade) => setSettings({ grade })} />
        <Switch id="fx-rays" label="Sun rays" hint="Shafts of light from the sun (F9)" on={s.rays} onChange={(rays) => setSettings({ rays })} />
        <Switch id="fx-menu-blur" label="Menu blur" hint="Blur the world behind windows (F10)" on={s.menuBlur} onChange={(menuBlur) => setSettings({ menuBlur })} />
      </Group>
      <Group title="Performance" reset={() => resetSettings(['adaptive'])}>
        <Switch id="fx-adaptive" label="Adaptive quality" hint="Give back the dearest effects, then the resolution, if the frame rate stays low" on={s.adaptive} onChange={(adaptive) => setSettings({ adaptive })} />
      </Group>
      <p className="ps-note">A long view and every effect look grandest and ask the most of your computer. If the game stutters, switch off ambient occlusion first, then shadows, and bring the view in.</p>
    </>
  );
}
function GameplayTab({ s }: { s: Settings }) {
  const r = SETTING_RANGE;
  return (
    <>
      <Group title="Mouse" reset={() => resetSettings(['sensitivity', 'invertY'])}>
        <Slider id="sensitivity" label="Sensitivity" hint="How fast the view turns" value={s.sensitivity} min={r.sensitivity[0]} max={r.sensitivity[1]} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(sensitivity) => setSettings({ sensitivity })} />
        <Switch id="invert-y" label="Invert Y" hint="Move the mouse up to look down" on={s.invertY} onChange={(invertY) => setSettings({ invertY })} />
      </Group>
    </>
  );
}

function ControlsTab() {
  const s = useSettings();
  const talk = voiceKeyLabel(s.voiceKey);
  const rows: readonly (readonly [readonly string[], string])[] = [...CONTROLS, [[talk], s.pushToTalk ? 'Push to talk (online)' : 'Microphone (online)']];
  return (
    <section className="ps-group">
      <dl className="ps-keys">
        {rows.map(([keys, what]) => (
          <div key={what}>
            <dt>
              {keys.map((k, i) => (
                <kbd key={i}>{k}</kbd>
              ))}
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The right side of the pause screen: Audio, Graphics, Gameplay and the list of keys, as tabs. */
export function PauseSettings() {
  const [tab, setTab] = useState<Tab>('audio');
  const s = useSettings();
  return (
    <section className="pause-side" data-no-play id="pause-settings">
      <div className="ps-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`ps-tab-${t.id}`} aria-selected={tab === t.id} className={`ps-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
            <i aria-hidden="true">{t.icon}</i>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="ps-page" role="tabpanel" key={tab}>
        {tab === 'audio' && <AudioTab s={s} />}
        {tab === 'graphics' && <GraphicsTab s={s} />}
        {tab === 'gameplay' && <GameplayTab s={s} />}
        {tab === 'controls' && <ControlsTab />}
      </div>
    </section>
  );
}