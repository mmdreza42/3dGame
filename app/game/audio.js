let audioCtx = null

export function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume() }
export function playSound(type) {
  if (!audioCtx) return
  const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain()
  osc.connect(gain); gain.connect(audioCtx.destination)
  const now = audioCtx.currentTime
  if (type === 'pistol') { osc.type='square'; osc.frequency.setValueAtTime(800,now); osc.frequency.exponentialRampToValueAtTime(100,now+0.1); gain.gain.setValueAtTime(0.1,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.1); osc.start(now); osc.stop(now+0.1) }
  else if (type === 'shotgun') { osc.type='sawtooth'; osc.frequency.setValueAtTime(300,now); osc.frequency.exponentialRampToValueAtTime(40,now+0.3); gain.gain.setValueAtTime(0.3,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.3); osc.start(now); osc.stop(now+0.3) }
  else if (type === 'sniper') { osc.type='sawtooth'; osc.frequency.setValueAtTime(1500,now); osc.frequency.exponentialRampToValueAtTime(50,now+0.4); gain.gain.setValueAtTime(0.4,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.4); osc.start(now); osc.stop(now+0.4) }
  else if (type === 'hit') { osc.type='sine'; osc.frequency.setValueAtTime(1200,now); osc.frequency.exponentialRampToValueAtTime(2000,now+0.05); gain.gain.setValueAtTime(0.1,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.05); osc.start(now); osc.stop(now+0.05) }
  else if (type === 'headshot') { osc.type='square'; osc.frequency.setValueAtTime(2000,now); osc.frequency.exponentialRampToValueAtTime(3500,now+0.1); gain.gain.setValueAtTime(0.15,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.12); osc.start(now); osc.stop(now+0.12) }
  else if (type === 'hurt') { osc.type='triangle'; osc.frequency.setValueAtTime(200,now); osc.frequency.linearRampToValueAtTime(50,now+0.2); gain.gain.setValueAtTime(0.3,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.2); osc.start(now); osc.stop(now+0.2) }
  else if (type === 'explosion') { osc.type='sawtooth'; osc.frequency.setValueAtTime(100,now); osc.frequency.linearRampToValueAtTime(10,now+0.8); gain.gain.setValueAtTime(0.6,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.8); osc.start(now); osc.stop(now+0.8) }
  else if (type === 'heal') { osc.type='sine'; osc.frequency.setValueAtTime(400,now); osc.frequency.linearRampToValueAtTime(800,now+0.2); gain.gain.setValueAtTime(0.2,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.3); osc.start(now); osc.stop(now+0.3) }
  else if (type === 'empty') { osc.type='square'; osc.frequency.setValueAtTime(200,now); gain.gain.setValueAtTime(0.05,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.05); osc.start(now); osc.stop(now+0.05) }
  else if (type === 'reload') { osc.type='triangle'; osc.frequency.setValueAtTime(300,now); osc.frequency.linearRampToValueAtTime(600,now+0.3); gain.gain.setValueAtTime(0.1,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.3); osc.start(now); osc.stop(now+0.3) }
  else if (type === 'loot') { osc.type='sine'; osc.frequency.setValueAtTime(600,now); osc.frequency.linearRampToValueAtTime(1200,now+0.1); gain.gain.setValueAtTime(0.2,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.1); osc.start(now); osc.stop(now+0.1) }
  else if (type === 'combo') { osc.type='triangle'; osc.frequency.setValueAtTime(600,now); osc.frequency.linearRampToValueAtTime(1400,now+0.15); gain.gain.setValueAtTime(0.15,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.2); osc.start(now); osc.stop(now+0.2) }
  else if (type === 'ding') { osc.type='sine'; osc.frequency.setValueAtTime(1800,now); gain.gain.setValueAtTime(0.2,now); gain.gain.exponentialRampToValueAtTime(0.01,now+0.35); osc.start(now); osc.stop(now+0.35); const o2=audioCtx.createOscillator(); const g2=audioCtx.createGain(); o2.type='sine'; o2.frequency.setValueAtTime(2700,now+0.06); g2.gain.setValueAtTime(0.0001,now); g2.gain.setValueAtTime(0.15,now+0.06); g2.gain.exponentialRampToValueAtTime(0.01,now+0.4); o2.connect(g2); g2.connect(audioCtx.destination); o2.start(now+0.06); o2.stop(now+0.4) }
  else if (type === 'boing') { osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(150, now + 0.3); gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3); osc.start(now); osc.stop(now + 0.3) }
}
