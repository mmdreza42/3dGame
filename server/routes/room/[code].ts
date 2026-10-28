// Game room WebSocket: /room/<code>. defineWebSocketHandler is auto-imported by Nitro.
import { getHub } from '../../roomHub.js'

export default defineWebSocketHandler({
  open(peer) {
    getHub().open(peer.id, peer.request?.url, {
      send: (s: string) => peer.send(s),
      close: (c?: number, r?: string) => peer.close(c, r),
    })
  },
  message(peer, message) {
    if (!getHub().message(peer.id, message.text())) peer.close(1012, 'restart')
  },
  close(peer) {
    getHub().close(peer.id)
  },
  error(peer) {
    getHub().close(peer.id)
  },
})
