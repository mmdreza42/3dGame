// Player name rules. Shared by the name screen (client) and the server, which sanitizes again.
// Allowed: letters, numbers (any language), space, underscore, dot, dash. 3..16 characters.
// Never put a name into innerHTML: render it with Vue {{ }} / textContent only.

export const NAME_MIN = 3
export const NAME_MAX = 16

const ALLOWED = /^[\p{L}\p{N} _.-]+$/u

// Lenient: strips bad characters, collapses spaces, trims, truncates. Used by the server.
export function cleanName(raw) {
  if (typeof raw !== 'string') return ''
  return raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim()
}

// Strict: used by the name screen so the player sees what is wrong. Returns { ok, name, error }.
export function validateName(raw) {
  if (typeof raw !== 'string') return { ok: false, name: '', error: 'Enter a name' }
  const collapsed = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (collapsed.length < NAME_MIN) return { ok: false, name: collapsed, error: `At least ${NAME_MIN} characters` }
  if (collapsed.length > NAME_MAX) return { ok: false, name: collapsed, error: `At most ${NAME_MAX} characters` }
  if (!ALLOWED.test(collapsed)) return { ok: false, name: collapsed, error: 'Letters, numbers, space _ . - only' }
  return { ok: true, name: collapsed, error: '' }
}

// "Name" -> "Name#2", "Name#3", ... (case-insensitive). Keeps the result within NAME_MAX.
export function dedupeName(name, taken) {
  const lower = new Set([...taken].map((n) => String(n).toLowerCase()))
  if (!lower.has(name.toLowerCase())) return name
  for (let i = 2; i < 1000; i++) {
    const suffix = '#' + i
    const cand = name.slice(0, NAME_MAX - suffix.length).trimEnd() + suffix
    if (!lower.has(cand.toLowerCase())) return cand
  }
  return name.slice(0, NAME_MAX - 4) + '#' + Math.floor(Math.random() * 900 + 100)
}
