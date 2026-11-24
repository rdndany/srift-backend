/**
 * The key that opens the microphone. A key the game already uses (move, inventory, chat, abilities) cannot be chosen:
 * holding it would do both.
 */

/** Keyboard codes that already do something while you play. */
const TAKEN = new Set<string>([
  // Moving, jumping, sneaking, sprinting.
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  // Windows and actions.
  'KeyE', 'KeyQ', 'KeyF', 'KeyR', 'KeyH', 'KeyB', 'KeyL', 'KeyO', 'KeyU', 'KeyP', 'KeyY', 'KeyN', 'KeyT', 'KeyV', 'KeyM', 'KeyK',
  'Slash', 'BracketLeft', 'BracketRight',
  // The four abilities.
  'KeyZ', 'KeyX', 'KeyC', 'KeyG',
  // The mouse is let go, a window closes, or the browser takes the key.
  'Escape', 'Tab', 'Enter', 'NumpadEnter', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock',
]);

/** A code may be the talk key: one physical key, and not one the game already uses. */
export function voiceKeyOk(code: string): boolean {
  if (!/^[A-Za-z0-9]{1,20}$/.test(code)) return false;
  if (TAKEN.has(code)) return false;
  if (/^F\d+$/.test(code)) return false;
  if (/^Digit\d$/.test(code)) return false;
  return true;
}

const NAMED: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  Backspace: 'Backspace',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
};

/** The short name of a key, as it is printed on the key (` for Backquote, J for KeyJ). */
export function voiceKeyLabel(code: string): string {
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return code.slice(5);
  return code;
}
