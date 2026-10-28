export const WEAPON_CONFIG = {
  pistol:  { maxAmmo: 12, damage: 50,  fireRate: 200,  reloadTime: 1500, color: 0x00ffff, speed: 120, bullets: 1, spreadHip: 0.015, spreadAds: 0.001, recoilPitch: 0.015, recoilYaw: 0.005, recoilKickBack: 0.05, recoverySpeed: 15, auto: true, bloomPerShot: 0.005 },
  shotgun: { maxAmmo: 6,  damage: 25,  fireRate: 800,  reloadTime: 2500, color: 0xffff00, speed: 120, bullets: 5, spreadHip: 0.08,  spreadAds: 0.06,  recoilPitch: 0.05,  recoilYaw: 0.02,  recoilKickBack: 0.15, recoverySpeed: 10, auto: false, bloomPerShot: 0.02 },
  sniper:  { maxAmmo: 4,  damage: 150, fireRate: 1500, reloadTime: 3000, color: 0xff00ff, speed: 250, bullets: 1, spreadHip: 0.05,  spreadAds: 0.0005, recoilPitch: 0.08,  recoilYaw: 0.01,  recoilKickBack: 0.2, recoverySpeed: 8, auto: false, bloomPerShot: 0.05 }
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
