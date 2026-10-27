export const WEAPON_CONFIG = {
  pistol:  { maxAmmo: 12, damage: 50,  fireRate: 200,  reloadTime: 1500, color: 0x00ffff, speed: 120, bullets: 1, spread: 0 },
  shotgun: { maxAmmo: 6,  damage: 25,  fireRate: 800,  reloadTime: 2500, color: 0xffff00, speed: 120, bullets: 5, spread: 0.2 },
  sniper:  { maxAmmo: 4,  damage: 150, fireRate: 1500, reloadTime: 3000, color: 0xff00ff, speed: 250, bullets: 1, spread: 0 }
}
export const weaponAmmo = { pistol: 12, shotgun: 6, sniper: 4 }

export const ENEMY_CONFIG = {
  normal:   { hp: 100,   scale: 1.0, speed: 3.5, color: 0xff0000, attackDist: 40,  bulletDmg: 15, bulletColor: 0xff0000, weakPoint: false },
  runner:   { hp: 50,    scale: 0.8, speed: 7,   color: 0xff5500, attackDist: 15,  bulletDmg: 0,  bulletColor: 0xff5500, weakPoint: false },
  tank:     { hp: 300,   scale: 1.5, speed: 1.8, color: 0x8800ff, attackDist: 50,  bulletDmg: 15, bulletColor: 0xff0000, weakPoint: true  },
  sniper:   { hp: 50,    scale: 0.9, speed: 3.5, color: 0xffff00, attackDist: 100, bulletDmg: 30, bulletColor: 0xffff00, weakPoint: false },
  boss:     { hp: 5000,  scale: 3.5, speed: 1.5, color: 0xff0000, attackDist: 60,  bulletDmg: 20, bulletColor: 0xff00ff, weakPoint: false }
}
