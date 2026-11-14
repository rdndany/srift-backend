'use client';

import { useEffect, useState } from 'react';
import {
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLE_NAMES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  CLASSES,
  cleanPlayerName,
  lookCode,
  lookOfCode,
  outfitItems,
  playerNameProblem,
  randomLook,
  type CharacterLook,
  type ClassId,
  type LookPart,
} from '@solrift/shared';
import { shortAddress, useAuth } from '../auth/store';
import { hydrateProfile, useProfile } from '../profile/store';
import { CharacterPreview } from './CharacterPreview';
import { ClassCards, ClassDetails } from './ClassPicker';
import { SHOT } from './homeAssets';

type Step = 'who' | 'creator' | 'class' | 'character';

/** One row of colour swatches (or labelled buttons) for a part of the character. */
function Choice({
  part,
  title,
  count,
  label,
  color,
  look,
  onPick,
}: {
  part: LookPart;
  title: string;
  count: number;
  label?: (i: number) => string;
  color?: (i: number) => string;
  look: CharacterLook;
  onPick: (i: number) => void;
}) {
  return (
    <div className="cc-row" data-part={part}>
      <h3>{title}</h3>
      <div className="cc-swatches">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`${color ? 'swatch' : 'pill'} ${look[part] === i ? 'on' : ''}`}
            data-index={i}
            aria-pressed={look[part] === i}
            aria-label={label ? label(i) : `${title} ${i + 1}`}
            title={label ? label(i) : undefined}
            style={color ? { background: color(i) } : undefined}
            onClick={() => onPick(i)}
          >
            {!color && label ? label(i) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Step one: guest or Solana wallet. */
function WhoStep({ onGuest, onWallet }: { onGuest: () => void; onWallet: () => void }) {
  const { status, account, wallets, busy, error, logout, login } = useAuth();
  const [picking, setPicking] = useState(false);
  const signedIn = status === 'in' && account;

  return (
    <>
      <h2 className="step">
        <i>3</i> How do you want to enter?
      </h2>
      <div className="who-cards">
        <section className="who-card guest" id="who-guest-card">
          <div className="who-img" style={{ backgroundImage: `url(${SHOT.isle})` }} />
          <div className="who-body">
            <span className="who-title">Play as guest</span>
            <span className="who-tag">No account needed</span>
            <ul>
              <li>Pick a name and a character</li>
              <li>Jump straight in</li>
              <li className="warn">Nothing is saved: your world, progress and character are gone when you leave</li>
            </ul>
            <button className="gold-btn" id="who-guest" disabled={busy} onClick={onGuest}>
              Play as guest
            </button>
          </div>
        </section>

        <section className="who-card wallet" id="who-wallet-card">
          <div className="who-img" style={{ backgroundImage: `url(${SHOT.dusk})` }} />
          <div className="who-body">
            <span className="who-title">Solana wallet</span>
            <span className="who-tag good">Progress saved</span>
            <ul>
              <li>Sign in with Phantom, Solflare or Backpack. It costs nothing and cannot touch your funds</li>
              <li className="good">Your progress and your character are saved to your account</li>
            </ul>
            {status === 'loading' ? (
              <span className="seed-hint">Checking your session...</span>
            ) : signedIn ? (
              <>
                <span className="who-signed" id="who-account">
                  Signed in as <b>{account.displayName}</b> &middot; <code title={account.wallet}>{shortAddress(account.wallet)}</code>
                </span>
                <button className="gold-btn" id="who-wallet-continue" disabled={busy} onClick={onWallet}>
                  Continue
                </button>
                <button className="link-btn" id="who-signout" disabled={busy} onClick={() => void logout()}>
                  Use another wallet
                </button>
              </>
            ) : !picking ? (
              <button className="gold-btn" id="who-wallet" disabled={busy} onClick={() => setPicking(true)}>
                Sign in with wallet
              </button>
            ) : wallets.length === 0 ? (
              <>
                <span className="seed-note" id="who-no-wallet">
                  No Solana wallet found. Install Phantom, Solflare or Backpack, then reload this page.
                </span>
                <button className="link-btn" onClick={() => setPicking(false)}>
                  Back
                </button>
              </>
            ) : (
              <div className="who-wallets">
                {wallets.map((w) => (
                  <button
                    key={w.name}
                    className="ghost-btn wallet-pick"
                    disabled={busy}
                    onClick={() => {
                      void login(w).then(() => {
                        if (useAuth.getState().status === 'in') onWallet();
                      });
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={w.icon} alt="" width={20} height={20} /> {w.name}
                  </button>
                ))}
                <button className="link-btn" onClick={() => setPicking(false)}>
                  Cancel
                </button>
              </div>
            )}
            {error && (
              <span className="home-error" id="who-error">
                {error}
              </span>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

/** Step two: the name and the look of the character. */
function CreatorStep({ identity, onBack, onDone }: { identity: 'guest' | 'wallet'; onBack: () => void; onDone: () => void }) {
  const { name, look, setName, setLook, replaceLook } = useProfile();
  const account = useAuth((s) => s.account);
  const [touched, setTouched] = useState(false);
  const problem = playerNameProblem(name);
  const wallet = identity === 'wallet';

  const go = () => {
    setTouched(true);
    if (problem) return;
    setName(cleanPlayerName(name));
    onDone();
  };
  return (
    <>
      <h2 className="step">
        <i>4</i> {wallet && (account?.characters.length ?? 0) > 0 ? `New character (${(account?.characters.length ?? 0) + 1} of ${account?.maxCharacters ?? 3})` : 'Create your character'}
      </h2>
      <div className="creator">
        <div className="cc-stage-wrap">
          <div className="cc-stage" id="cc-stage">
            <CharacterPreview armor={[]} />
          </div>
          <p className="seed-hint">Drag to turn your character around.</p>
        </div>

        <div className="cc-form">
          <label htmlFor="char-name">Your name</label>
          <input
            id="char-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            placeholder="a name others will see"
            spellCheck={false}
            autoComplete="off"
            maxLength={20}
          />
          {touched && problem ? (
            <span className="seed-note" id="name-problem">
              {problem}
            </span>
          ) : (
            <span className="seed-hint">3 to 16 letters, digits, spaces, dots, dashes or underscores.</span>
          )}

          <div className="cc-rows">
            <Choice part="skin" title="Skin" count={SKIN_TONES.length} color={(i) => SKIN_TONES[i]} look={look} onPick={(i) => setLook({ skin: i })} />
            <Choice part="style" title="Hair style" count={HAIR_STYLE_NAMES.length} label={(i) => HAIR_STYLE_NAMES[i]} look={look} onPick={(i) => setLook({ style: i })} />
            <Choice part="hair" title="Hair colour" count={HAIR_COLORS.length} color={(i) => HAIR_COLORS[i]} look={look} onPick={(i) => setLook({ hair: i })} />
            <Choice part="eyes" title="Eyes" count={EYE_COLORS.length} color={(i) => EYE_COLORS[i]} look={look} onPick={(i) => setLook({ eyes: i })} />
            <Choice part="shirt" title="Hoodie" count={SHIRT_COLORS.length} color={(i) => SHIRT_COLORS[i]} look={look} onPick={(i) => setLook({ shirt: i })} />
            <Choice part="pants" title="Trousers" count={PANTS_COLORS.length} color={(i) => PANTS_COLORS[i]} look={look} onPick={(i) => setLook({ pants: i })} />
          </div>

          <button type="button" className="ghost-btn" id="cc-random" onClick={() => replaceLook(randomLook())}>
            Randomise
          </button>

          <p className={`who-save ${wallet ? 'good' : 'warn'}`} id="who-save-note">
            {wallet
              ? `Saved to your account${account ? ` (${shortAddress(account.wallet)})` : ''}: you will look like this on every device, and your progress is kept.`
              : 'Guest mode: this character and everything you do are forgotten when you leave.'}
          </p>
          {wallet && (
            <p className="who-save warn" id="permanent-note">
              A wallet character is permanent: its name, look and class cannot be edited or renamed later. You can only delete it, and that erases all its progress.
            </p>
          )}
          <div className="cc-actions">
            <button type="button" className="ghost-btn" id="cc-back" onClick={onBack}>
              Back
            </button>
            <button type="button" className="gold-btn" id="who-continue" onClick={go}>
              Choose a class
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Step three: the class. Nothing is chosen until it is confirmed, and for a wallet character the confirmation is a
 * second, deliberate click, because the class (like the name and the look) can never change afterwards.
 */
function ClassStep({ identity, onBack, onDone }: { identity: 'guest' | 'wallet'; onBack: () => void; onDone: () => void }) {
  const { name, look, classId, setClassId } = useProfile();
  const account = useAuth((s) => s.account);
  const createCharacter = useAuth((s) => s.createCharacter);
  const [pick, setPick] = useState<ClassId | null>(identity === 'guest' ? classId : null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const wallet = identity === 'wallet';
  const cleaned = cleanPlayerName(name);
  const def = pick ? CLASSES[pick] : null;

  const choose = (id: ClassId) => {
    setPick(id);
    setArmed(false);
    setError('');
  };

  const confirm = async () => {
    if (!pick || busy) return;
    if (wallet && !armed) {
      setArmed(true);
      return;
    }
    if (wallet) {
      setBusy(true);
      setError('');
      try {
        await createCharacter({ displayName: cleaned, look: lookCode(look), class: pick });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
        setArmed(false);
        return;
      }
      setBusy(false);
    }
    setClassId(pick);
    onDone();
  };

  return (
    <>
      <h2 className="step">
        <i>5</i> {wallet && (account?.characters.length ?? 0) > 0 ? `Choose a class (character ${(account?.characters.length ?? 0) + 1} of ${account?.maxCharacters ?? 3})` : 'Choose your class'}
      </h2>
      <ClassCards value={pick} onPick={choose} disabled={busy} />
      {pick ? (
        <div className="cls-look">
          {/* The character in the gear of the class: a Warrior's cape, a Mage's hat, a Ranger's quiver. */}
          <div className="cc-stage cls-stage" id="cls-stage">
            <CharacterPreview armor={pick ? outfitItems(pick) : []} turntable />
          </div>
          <ClassDetails id={pick} />
        </div>
      ) : (
        <p className="seed-hint" id="class-hint">
          Pick a class to see what it can do. Every class can mine, build, craft and explore.
        </p>
      )}
      {wallet && pick && (
        <p className="who-save warn" id="class-permanent-note">
          {armed
            ? `Last chance: "${cleaned}" the ${def?.name} can never be changed, renamed or given another class. The only way to start over is to delete the character, which erases all its progress.`
            : 'A wallet character is permanent: its class cannot be changed later. You can only delete the character, and that erases all its progress.'}
        </p>
      )}
      {!wallet && pick && (
        <p className="who-save warn" id="class-guest-note">
          Guest mode: your class and everything you do are forgotten when you leave.
        </p>
      )}
      {error && (
        <span className="seed-note" id="class-error">
          {error}
        </span>
      )}
      <div className="cc-actions cls-actions">
        <button type="button" className="ghost-btn" id="class-back" disabled={busy} onClick={onBack}>
          Back
        </button>
        <button type="button" className="gold-btn" id="class-confirm" disabled={!pick || busy} onClick={() => void confirm()}>
          {busy ? 'Saving...' : !pick ? 'Choose a class' : wallet ? (armed ? `Yes, create ${cleaned} for good` : `Confirm ${def?.name}`) : `Confirm ${def?.name}`}
        </button>
      </div>
    </>
  );
}

/** Put a saved character on the page: its name and look are what the preview and the play page show. */
function showCharacter(c: { displayName: string; look: number }) {
  useProfile.setState({ name: c.displayName });
  useProfile.getState().replaceLook(lookOfCode(c.look));
}

/**
 * A wallet player who already has characters: the one in play is shown, not edited, and the wallet's others can be
 * picked (up to three, each with its own progress). The only change on offer is deleting one.
 */
function CharacterStep({ onBack, onDone, onNew, onDeleted }: { onBack: () => void; onDone: () => void; onNew: () => void; onDeleted: () => void }) {
  const account = useAuth((s) => s.account);
  const selectCharacter = useAuth((s) => s.selectCharacter);
  const deleteCharacter = useAuth((s) => s.deleteCharacter);
  const name = account?.displayName ?? '';
  const characters = account?.characters ?? [];
  const max = account?.maxCharacters ?? 3;
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = typed.trim().toLowerCase() === name.toLowerCase() && name !== '';

  const pick = async (id: string) => {
    if (busy || id === account?.id) return;
    setBusy(true);
    setError('');
    try {
      const next = await selectCharacter(id);
      if (next.look !== null) showCharacter({ displayName: next.displayName, look: next.look });
      setDeleting(false);
      setTyped('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  };

  const wipe = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteCharacter(name);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="step">
        <i>4</i> Your characters
      </h2>
      <div className="char-slots" id="char-slots" role="group" aria-label="Your characters">
        {characters.map((c) => (
          <button key={c.id} type="button" className="char-slot" data-id={c.id} aria-pressed={c.id === account?.id} disabled={busy} onClick={() => void pick(c.id)}>
            {c.displayName}
            {c.class ? <small className="slot-class">{CLASSES[c.class].name}</small> : null}
          </button>
        ))}
        {characters.length < max ? (
          <button type="button" className="char-slot new" id="char-new" disabled={busy} onClick={onNew}>
            + New character
          </button>
        ) : (
          <span className="seed-hint" id="char-full">
            {max} of {max} characters: delete one to make another.
          </span>
        )}
      </div>
      <div className="creator">
        <div className="cc-stage-wrap">
          <div className="cc-stage" id="cc-stage">
            <CharacterPreview armor={account?.class ? outfitItems(account.class) : []} turntable />
          </div>
          <p className="seed-hint">Drag to turn your character around.</p>
        </div>
        <div className="cc-form">
          <label>Your name</label>
          <div className="char-name-fixed" id="char-name-fixed">
            {name}
          </div>
          <label>Class</label>
          <div className="char-name-fixed" id="char-class-fixed" data-class={account?.class ?? ''}>
            {account?.class ? CLASSES[account.class].name : 'None (made before classes existed)'}
          </div>
          <p className="who-save good" id="who-save-note">
            Saved to your account{account ? ` (${shortAddress(account.wallet)})` : ''}. Its name and look are permanent: they cannot be edited or renamed. It has its own progress, separate from your
            other characters.
          </p>
          {error && !deleting && (
            <span className="seed-note" id="char-error">
              {error}
            </span>
          )}
          {!deleting ? (
            <div className="cc-actions">
              <button type="button" className="ghost-btn" id="cc-back" onClick={onBack}>
                Back
              </button>
              <button type="button" className="gold-btn" id="who-continue" disabled={busy} onClick={onDone}>
                Continue
              </button>
            </div>
          ) : (
            <div className="danger-box" id="delete-box">
              <h3>Delete {name}?</h3>
              <p>
                This erases this character for good, with all its progress: the realm progress, its cloud worlds, and every world it saved on this device. Your other characters are not touched, and
                you can make a new one in its place. This cannot be undone.
              </p>
              <label htmlFor="delete-confirm">Type the name to confirm</label>
              <input
                id="delete-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void wipe()}
                placeholder={name}
                spellCheck={false}
                autoComplete="off"
              />
              {error && (
                <span className="seed-note" id="delete-error">
                  {error}
                </span>
              )}
              <div className="cc-actions">
                <button type="button" className="ghost-btn" id="delete-cancel" disabled={busy} onClick={() => (setDeleting(false), setTyped(''), setError(''))}>
                  Keep it
                </button>
                <button type="button" className="danger-btn" id="delete-go" disabled={!matches || busy} onClick={() => void wipe()}>
                  {busy ? 'Deleting...' : 'Delete everything'}
                </button>
              </div>
            </div>
          )}
          {!deleting && (
            <button type="button" className="link-btn danger" id="delete-open" onClick={() => setDeleting(true)}>
              Delete this character...
            </button>
          )}
        </div>
      </div>
      {account?.class && <ClassDetails id={account.class} />}
    </>
  );
}
/**
 * Right before the game (after single player / multiplayer and the mode or realm are chosen): choose to play as a guest
 * or with a Solana wallet, then name and shape the character. `destination` says where this leads.
 */
export function IdentityPage({ destination, onBack, onDone }: { destination: { title: string; sub: string }; onBack: () => void; onDone: () => void }) {
  const init = useAuth((s) => s.init);
  const setIdentity = useProfile((s) => s.setIdentity);
  const identity = useProfile((s) => s.identity);
  const accountId = useAuth((s) => s.account?.id);
  const [step, setStep] = useState<Step>('who');

  useEffect(() => init(), [init]);
  useEffect(() => hydrateProfile(), []);

  const toStep = (s: Step) => {
    setStep(s);
    document.getElementById('home-layer')?.scrollTo(0, 0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (step === 'creator') backFromCreator();
      else if (step === 'class') toStep('creator');
      else if (step !== 'who') toStep('who');
      else onBack();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [step, onBack]);

  const chooseGuest = async () => {
    // A guest is nobody's account: leave a signed-in session so nothing is saved or shared by accident.
    if (useAuth.getState().status === 'in') {
      await useAuth.getState().logout();
      if (useAuth.getState().status === 'in') return; // sign-out failed: stay on this page and show why
    }
    setIdentity('guest');
    useProfile.setState({ hydrated: false });
    hydrateProfile();
    // A guest who never picked a name gets a random one to start from.
    if (!useProfile.getState().name) useProfile.getState().setName(`Player${Math.floor(Math.random() * 900 + 100)}`);
    toStep('creator');
  };

  /** A character was deleted: another one of the wallet is shown, or (it was the last) a new one is made. */
  const afterDelete = () => {
    const account = useAuth.getState().account;
    if (account && account.look !== null) {
      showCharacter({ displayName: account.displayName, look: account.look });
      toStep('character');
      return;
    }
    useProfile.setState({ name: account?.displayName ?? '' });
    useProfile.getState().replaceLook(randomLook());
    toStep('creator');
  };

  /** Make one more character of the wallet: it starts from a fresh name and a random look. */
  const startNew = () => {
    useProfile.setState({ name: `Player${Math.floor(Math.random() * 900 + 100)}` });
    useProfile.getState().replaceLook(randomLook());
    toStep('creator');
  };

  /** From the creator: back to the wallet's characters when it has some, else to the first choice. */
  const backFromCreator = () => {
    const account = useAuth.getState().account;
    if (useProfile.getState().identity === 'wallet' && account && account.look !== null) {
      showCharacter({ displayName: account.displayName, look: account.look });
      toStep('character');
    } else toStep('who');
  };

  const chooseWallet = () => {
    const account = useAuth.getState().account;
    if (!account) return;
    // The saved character (and name) come with the account; a new account starts from the look on screen.
    setIdentity('wallet');
    useProfile.setState({ name: account.displayName });
    if (account.look !== null) useProfile.getState().replaceLook(lookOfCode(account.look));
    // A character that exists is shown as it is; only a new account gets to make one.
    toStep(account.look !== null ? 'character' : 'creator');
  };

  return (
    <div className="playpage who-page">
      <div className="play-bg" aria-hidden>
        <div className="on" style={{ backgroundImage: `url(${SHOT.dusk})` }} />
      </div>
      <header className="play-top" data-no-play>
        <button className="back-btn" id="back-home" onClick={onBack}>
          &larr; Back
        </button>
        <div className="play-logo">
          Sol<b>Rift</b>
        </div>
        <div className="who-chip" id="dest-chip" data-no-play>
          <span className="who-chip-text">
            <b id="dest-title">{destination.title}</b>
            <i id="dest-sub">{destination.sub}</i>
          </span>
        </div>
      </header>
      <main className="play-main who-main">
        <h1 className="play-title">{step === 'who' ? 'Who goes there?' : step === 'character' ? 'Welcome back' : 'Make your mark'}</h1>
        {step === 'who' ? (
          <WhoStep onGuest={() => void chooseGuest()} onWallet={chooseWallet} />
        ) : step === 'character' ? (
          <CharacterStep key={accountId} onBack={() => toStep('who')} onDone={onDone} onNew={startNew} onDeleted={afterDelete} />
        ) : step === 'class' ? (
          <ClassStep identity={identity ?? 'guest'} onBack={() => toStep('creator')} onDone={onDone} />
        ) : (
          <CreatorStep identity={identity ?? 'guest'} onBack={backFromCreator} onDone={() => toStep('class')} />
        )}
      </main>
    </div>
  );
}
