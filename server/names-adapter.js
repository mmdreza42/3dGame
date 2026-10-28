// Bridges shared/names.js to the GameRoom sanitizer signature: (raw, takenNames) -> unique clean name.
// ASSUMPTION (verify with tests/server/names-adapter.test.js): cleanName(raw) -> string,
// dedupeName(name, takenNamesArray) -> string.
import { cleanName, dedupeName } from '../shared/names.js'

export function makeSanitizer() {
  return (raw, taken) => {
    let name = cleanName(raw)
    if (typeof name !== 'string' || !name) name = 'PLAYER'
    return dedupeName(name, taken)
  }
}
