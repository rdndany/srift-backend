'use client';

import { GUILD_RANKS, type GuildCard, type WebChatLine } from '@solrift/shared';
import { useEffect, useRef, useState } from 'react';
import { fetchChat, sendChat } from '../camp/store';

const POLL_MS = 3000;
const KEEP = 200;

/** The realm's public chat: the same lines the players in the game see. */
function useRealmChat(hero: string) {
  const [lines, setLines] = useState<WebChatLine[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const [you, setYou] = useState('');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [off, setOff] = useState(false);
  const since = useRef(0);
  const list = useRef<HTMLUListElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    let live = true;
    since.current = 0;
    setLines([]);
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      const r = await fetchChat(since.current);
      if (!live) return;
      setOff(!r);
      if (!r) return;
      // A server that restarted starts counting again: a head below ours means start over.
      if (r.head < since.current) {
        since.current = 0;
        setLines([]);
        return;
      }
      since.current = r.head;
      setOnline(r.online);
      setYou(r.you);
      if (r.lines.length) setLines((old) => [...old, ...r.lines].slice(-KEEP));
    };
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [hero]);

  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const err = await sendChat(t);
    setSending(false);
    if (err) return setNote(err);
    setNote('');
    setText('');
    stick.current = true;
    const r = await fetchChat(since.current);
    if (r && r.head >= since.current) {
      since.current = r.head;
      if (r.lines.length) setLines((old) => [...old, ...r.lines].slice(-KEEP));
    }
  };

  return { lines, online, you, text, setText, note, sending, off, list, stick, send };
}

/** The realm's chat, on a phone: the same lines the players in the game see, and a box to say something (guild chat is the game's own /commands: say it here as plain words). */
export function CampChat({ hero, guild }: { hero: string; guild: GuildCard | null }) {
  const { lines, online, you, text, setText, note, sending, off, list, stick, send } = useRealmChat(hero);

  return (
    <div className="camp-pane camp-chat" data-testid="camp-chat">
      <GuildPanel guild={guild} />
      <p className="camp-hint" data-testid="camp-online">
        {online.length === 0 ? 'Nobody is in the realm right now.' : `In the realm: ${online.slice(0, 12).join(', ')}${online.length > 12 ? ` and ${online.length - 12} more` : ''}.`}
      </p>
      {off && <p className="camp-warn small">The chat cannot be reached right now.</p>}
      <ul
        className="camp-lines"
        ref={list}
        aria-live="polite"
        aria-label="Chat"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {lines.length === 0 && <li className="camp-empty">Quiet so far. Say hello.</li>}
        {lines.map((l) => (
          <li key={l.n} className={l.from ? (l.from === you ? 'me' : '') : 'note'}>
            {l.from ? (
              <>
                <b>{l.from}</b> {l.text}
              </>
            ) : (
              l.text
            )}
          </li>
        ))}
      </ul>
      <form
        className="camp-say"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input value={text} maxLength={200} placeholder="Say something to the realm" aria-label="Message" enterKeyHint="send" autoComplete="off" onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={sending || !text.trim()}>
          Send
        </button>
      </form>
      {note && <p className="camp-warn small">{note}</p>}
    </div>
  );
}

/** The realm's chat on the lobby. Closed, it is a faint bar like the turn hint. A click opens the conversation. */
export function RealmChat({ hero }: { hero: string }) {
  const { lines, online, you, text, setText, note, sending, off, list, stick, send } = useRealmChat(hero);
  const [open, setOpen] = useState(false);
  const last = lines[lines.length - 1];
  const preview = off ? 'The chat cannot be reached right now.' : !last ? 'Quiet so far' : last.from ? `${last.from}: ${last.text.replace(/\s+/g, ' ')}` : last.text.replace(/\s+/g, ' ');
  const who = off ? 'The chat cannot be reached right now.' : online.length === 0 ? 'Nobody is in the realm right now.' : `${online.length} in the realm`;

  useEffect(() => {
    if (!open) return;
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, lines, list]);

  return (
    <section className={`gp-chat${open ? ' open' : ''}`} aria-label="Realm chat">
      <button type="button" className="gp-chat-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <b>Realm</b>
        <span>{open ? who : preview}</span>
        <em className="gp-chat-cue">{open ? 'Close' : 'Click to chat'}<i aria-hidden="true" /></em>
      </button>
      <div className="gp-chat-fold">
        <div className="gp-chat-body">
          <ul
            className="gp-chat-lines"
            ref={list}
            aria-live="polite"
            aria-label="Realm chat"
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
          >
            {lines.length === 0 && <li className="note">Quiet so far. Say hello.</li>}
            {lines.map((l) => (
              <li key={l.n} className={l.from ? (l.from === you ? 'me' : '') : 'note'}>
                {l.from ? (
                  <>
                    <b>{l.from}</b> {l.text}
                  </>
                ) : (
                  l.text
                )}
              </li>
            ))}
          </ul>
          <form
            className="gp-chat-say"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input value={text} maxLength={200} placeholder="Say something to the realm" aria-label="Message" enterKeyHint="send" autoComplete="off" onChange={(e) => setText(e.target.value)} />
            <button type="submit" disabled={sending || !text.trim()}>
              Send
            </button>
          </form>
          {note && <p className="gp-chat-note">{note}</p>}
        </div>
      </div>
    </section>
  );
}

/** The guild, to look at (founding, inviting and the rest are the game's). */
function GuildPanel({ guild }: { guild: GuildCard | null }) {
  if (!guild) {
    return (
      <p className="camp-hint" data-testid="camp-guild">
        You are not in a guild. Found or join one in the game with /guild.
      </p>
    );
  }
  const here = guild.members.filter((m) => m.online).length;
  return (
    <details className="camp-guild" data-testid="camp-guild" open>
      <summary>
        <b>{guild.name}</b> <small>&lt;{guild.tag}&gt;</small>
        <span>
          {here} of {guild.members.length} in the realm
        </span>
      </summary>
      {guild.motd && <p className="camp-motd">{guild.motd}</p>}
      <ul className="camp-roster">
        {guild.members.map((m) => (
          <li key={m.name} className={m.online ? 'on' : ''}>
            <i aria-hidden="true" />
            <b>{m.name}</b>
            <small>{GUILD_RANKS[m.rank]}</small>
            <span className="sr-only">{m.online ? 'in the realm' : 'away'}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
