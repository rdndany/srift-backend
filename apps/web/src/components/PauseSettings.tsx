'use client';

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { SETTING_RANGE, resetSettings, setSettings, useSettings, type Settings } from '../game/settings';

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
function Switch({ id, label, hint, on, onChange }: { id: string; label: string; hint?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="ps-row ps-switch">
      <span className="ps-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button type="button" id={id} role="switch" aria-checked={on} className={`ps-toggle${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
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

function AudioTab({ s }: { s: Settings }) {
  const r = SETTING_RANGE;
  return (
    <>
      <Group title="Volume" reset={() => resetSettings(['master', 'effects', 'ambience', 'music', 'muted'])}>
        <Switch id="mute-toggle" label="Mute everything" hint="Keeps your levels" on={s.muted} onChange={(muted) => setSettings({ muted })} />
        <Slider id="master" label="Master" hint="Everything you hear" value={s.master} min={r.master[0]} max={r.master[1]} step={0.01} show={pct} disabled={s.muted} onChange={(master) => setSettings({ master })} />
        <Slider id="effects" label="Effects" hint="Blocks, steps, fights, spells" value={s.effects} min={r.effects[0]} max={r.effects[1]} step={0.01} show={pct} disabled={s.muted} onChange={(effects) => setSettings({ effects })} />
        <Slider id="ambience" label="Ambience" hint="Wind, rain, birds, caves" value={s.ambience} min={r.ambience[0]} max={r.ambience[1]} step={0.01} show={pct} disabled={s.muted} onChange={(ambience) => setSettings({ ambience })} />
        <Slider id="music" label="Music" hint="Press M to switch it" value={s.music} min={r.music[0]} max={r.music[1]} step={0.01} show={pct} disabled={s.muted} onChange={(music) => setSettings({ music })} />
      </Group>
      <p className="ps-note">Sound starts once you have clicked into the game. The sliders keep their place between visits.</p>
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
  return (
    <section className="ps-group">
      <dl className="ps-keys">
        {CONTROLS.map(([keys, what]) => (
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