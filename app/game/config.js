// Weapon tuning.
//  hipSpread / moveSpread : cone half-angle (radians) when firing from the hip / extra while moving
//  adsSpread              : cone half-angle while aiming down sights
//  adsFov / adsSpeed      : zoom level and how fast the aim transition is
//  adsMove                : walk speed while aiming
//  recoil                 : camera pitch kick per shot (radians), recovers on its own
//  kickZ / kickRot        : visual kick of the gun model
export const WEAPON_CONFIG = {
  pistol: {
    maxAmmo: 12, damage: 50, fireRate: 200, reloadTime: 1500, color: 0x00ffff, speed: 120, bullets: 1,
    hipSpread: 0.012, moveSpread: 0.03, adsSpread: 0,
    adsFov: 55, adsSpeed: 14, adsMove: 3.5,
    recoil: 0.012, kickZ: 0.04, kickRot: 0.09, shake: 0.03, fovKick: 2, bloom: 0.006,
    flashSize: 1, flashLight: 0.5, ejectDelay: 0,
    tracer: { color: 0xffd890, len: 2.5, radius: 0.012 }
  },
  shotgun: {
    maxAmmo: 6, damage: 25, fireRate: 800, reloadTime: 2500, color: 0xffff00, speed: 120, bullets: 5,
    hipSpread: 0.1, moveSpread: 0.02, adsSpread: 0.03,
    adsFov: 58, adsSpeed: 11, adsMove: 3.2,
    recoil: 0.05, kickZ: 0.1, kickRot: 0.2, shake: 0.075, fovKick: 4, bloom: 0,
    flashSize: 1.4, flashLight: 1, ejectDelay: 350,
    tracer: { color: 0xffb060, len: 1.6, radius: 0.01 }
  },
  sniper: {
    maxAmmo: 4, damage: 150, fireRate: 1500, reloadTime: 3000, color: 0xff00ff, speed: 250, bullets: 1,
    hipSpread: 0.05, moveSpread: 0.06, adsSpread: 0,
    adsFov: 18, adsSpeed: 8, adsMove: 2,
    recoil: 0.07, kickZ: 0.13, kickRot: 0.25, shake: 0.12, fovKick: 6, bloom: 0,
    flashSize: 1.6, flashLight: 1.5, ejectDelay: 450,
    tracer: { color: 0xffc8ff, len: 5, radius: 0.014 }
  }
}
export const weaponAmmo = { pistol: 12, shotgun: 6, sniper: 4 }

export const ENEMY_CONFIG = {
  normal: { hp: 100,  scale: 1.0, speed: 3.5, color: 0xff0000, attackDist: 40,  bulletDmg: 15, bulletColor: 0xff4444, weakPoint: false },
  runner: { hp: 50,   scale: 0.8, speed: 7,   color: 0xff5500, attackDist: 15,  bulletDmg: 0,  bulletColor: 0xff5500, weakPoint: false },
  tank:   { hp: 300,  scale: 1.5, speed: 1.8, color: 0x8800ff, attackDist: 50,  bulletDmg: 15, bulletColor: 0xb266ff, weakPoint: true  },
  sniper: { hp: 50,   scale: 0.9, speed: 3.5, color: 0xffff00, attackDist: 100, bulletDmg: 30, bulletColor: 0xffff00, weakPoint: false },
  bomber: { hp: 40,   scale: 0.9, speed: 8.5, color: 0xff3300, attackDist: 0,   bulletDmg: 0,  bulletColor: 0xff3300, weakPoint: false },
  elite:  { hp: 220,  scale: 1.1, speed: 4.2, color: 0x00ccff, attackDist: 55,  bulletDmg: 12, bulletColor: 0x66e0ff, weakPoint: false, shield: 80 },
  boss:   { hp: 5000, scale: 3.5, speed: 1.5, color: 0xff0000, attackDist: 60,  bulletDmg: 20, bulletColor: 0xff00ff, weakPoint: false }
}
