// Transport interface used by NetClient. Implementations: WebSocketTransport now, LocalTransport in step 4.
// Events: 'open' (), 'message' (decoded server message), 'close' ({code, reason}), 'error' ({reason})
export class Transport {
  constructor() {
    this._h = { open: [], message: [], close: [], error: [] }
  }

  on(evt, fn) {
    if (!this._h[evt]) throw new Error(`Transport: unknown event ${evt}`)
    this._h[evt].push(fn)
    return () => { this._h[evt] = this._h[evt].filter((f) => f !== fn) }
  }

  _emit(evt, arg) {
    for (const fn of [...this._h[evt]]) fn(arg)
  }

  connect() { throw new Error('Transport.connect not implemented') }
  send(_msg) { throw new Error('Transport.send not implemented') } // returns true if sent
  close(_code, _reason) { throw new Error('Transport.close not implemented') }
  get isOpen() { return false }
}
