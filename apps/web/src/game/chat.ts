/**
 * Chat for online games: a log in the corner that fades out, and an input opened with T (or `/` for a
 * command). Plain DOM so it works even while the React UI is idle.
 */
export class Chat {
  private root = document.createElement('div');
  private logEl = document.createElement('div');
  private input = document.createElement('input');
  private lines: { el: HTMLElement; born: number }[] = [];
  private open = false;

  constructor(
    private readonly onSend: (text: string) => void,
    private readonly onOpenChange: (open: boolean) => void,
  ) {
    this.root.id = 'chat';
    this.logEl.className = 'chat-log';
    this.input.className = 'chat-input';
    this.input.maxLength = 200;
    this.input.placeholder = 'Say something (Enter to send, Esc to cancel)';
    this.input.style.display = 'none';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.autocapitalize = 'off';
    this.root.append(this.logEl, this.input);
    document.body.appendChild(this.root);
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // keep game keys out of the text box
      if (e.key === 'Enter') {
        const text = this.input.value.trim();
        if (text) this.onSend(text);
        this.close();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Lay the box out once, while the loading screen still covers it, so the first time it opens is not the first time it exists. */
  prepare(): void {
    if (this.open) return;
    this.input.style.display = 'block';
    this.input.value = 'Say something 0123456789';
    void this.input.offsetWidth;
    this.input.value = '';
    this.input.style.display = 'none';
  }

  show(prefix = ''): void {
    if (this.open) return;
    this.open = true;
    this.input.value = prefix;
    this.input.style.display = 'block';
    this.input.focus();
    this.onOpenChange(true);
  }

  private close(): void {
    this.open = false;
    this.input.value = '';
    this.input.style.display = 'none';
    this.input.blur();
    this.onOpenChange(false);
  }

  /** Add a line. `kind` colours it (notices are grey, whispers pink, party chat blue, emotes orange). */
  add(text: string, kind: 'chat' | 'notice' | 'whisper' | 'party' | 'emote' | 'guild' = 'chat'): void {
    const el = document.createElement('div');
    el.className = `chat-line ${kind}`;
    el.textContent = text;
    this.logEl.appendChild(el);
    this.lines.push({ el, born: performance.now() });
    while (this.lines.length > 12) this.lines.shift()!.el.remove();
  }

  history(): string[] {
    return this.lines.map((l) => l.el.textContent ?? '');
  }

  /** Fade old lines (all stay visible while the input is open). */
  tick(): void {
    const now = performance.now();
    for (const l of this.lines) {
      const age = (now - l.born) / 1000;
      l.el.style.opacity = this.open || age < 8 ? '1' : String(Math.max(0, 1 - (age - 8) / 2));
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
