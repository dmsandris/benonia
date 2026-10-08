// Angka & efek pertarungan yang dipakai pemain dan musuh.
import * as Phaser from 'phaser';

export const PLAYER = {
  maxHp: 100,
  maxMp: 60,
  mpRegen: 5,          // MP per detik
  closeRange: 88,      // musuh sedekat ini kena tebas dari arah mana pun (atas/bawah juga)
  autoAim: 150,        // sebelum menebas, pemain otomatis menghadap musuh terdekat dalam jarak ini
  dmg: [10, 14],       // rentang damage tebasan
  critChance: 0.12,
  critMul: 2,
  hitFrame: 1,         // frame animasi serang saat pedang mengenai
  reach: 78,           // jarak pusat kotak serang di depan pemain (px)
  hitbox: [96, 84],    // lebar x tinggi kotak serang
  hurtCooldown: 600,   // ms kebal setelah kena pukul
  respawnMs: 1500,
};

// Skill pemain. key = tombol keyboard, mp = biaya, cd = jeda (ms).
export const SKILLS = [
  { id: 'whirl', key: '1', name: 'Putaran', icon: '🌀', mp: 15, cd: 5000,
    dmg: [16, 22], radius: 150, desc: 'Berputar menebas semua musuh di sekeliling' },
  { id: 'dash', key: '2', name: 'Terjang', icon: '💨', mp: 12, cd: 4000,
    dmg: [14, 20], dist: 260, width: 90, ms: 190, desc: 'Melesat ke depan, menebas yang dilewati, kebal saat melesat' },
  { id: 'guard', key: '3', name: 'Perisai', icon: '🛡', mp: 10, cd: 9000,
    ms: 2500, reduce: 0.8, desc: 'Menahan 80% damage selama 2,5 detik' },
  { id: 'shield', key: '4', name: 'Lempar Perisai', icon: '🥏', mp: 14, cd: 6000,
    dmg: [12, 16], range: 340, speed: 560, back: 680, radius: 52,
    desc: 'Perisai berputar terbang lalu kembali, mengenai musuh saat pergi dan pulang' },
  { id: 'sword', key: '5', name: 'Lempar Pedang', icon: '🗡', mp: 10, cd: 4000,
    dmg: [18, 24], range: 540, speed: 780, radius: 40, desc: 'Pedang melesat lurus menembus semua musuh di jalurnya' },
  { id: 'fire', key: '6', name: 'Napas Api', icon: '🔥', mp: 20, cd: 8000,
    dmg: [8, 11], length: 185, angle: 30, ticks: [140, 340, 540], ms: 720,
    desc: 'Semburan api ke depan, membakar 3 kali' },
];

// Bidik: musuh terdekat dalam jarak ini, kalau tidak ada pakai arah hadap.
export const AIM_RANGE = 440;

export const GOBLIN_STATS = {
  maxHp: 34,
  speed: 120,
  sight: 300,          // mulai mengejar
  leash: 520,          // berhenti mengejar bila sejauh ini dari titik muncul
  range: 66,           // jarak mulai menyerang
  dmg: [6, 9],
  hitFrame: 3,
  cooldown: 1300,
  respawnMs: 20000,
  knockback: 220,
};

export const rollDamage = ([lo, hi], crit = 0, mul = 2) => {
  const base = Phaser.Math.Between(lo, hi);
  const isCrit = Math.random() < crit;
  return { amount: isCrit ? base * mul : base, crit: isCrit };
};

// Angka damage yang melayang lalu memudar.
export function damageText(scene, x, y, amount, { crit = false, color = '#ffffff' } = {}) {
  const t = scene.add.text(x + Phaser.Math.Between(-10, 10), y, String(amount), {
    fontFamily: 'Georgia, serif', fontStyle: 'bold',
    fontSize: crit ? '40px' : '30px', color: crit ? '#ffd54a' : color,
    stroke: '#2a1408', strokeThickness: 6,
  }).setOrigin(0.5).setDepth(100000);
  if (crit) t.setScale(0.6);
  scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.out' });
  scene.tweens.add({
    targets: t, y: y - 70, alpha: 0, delay: 250, duration: 650, ease: 'Cubic.in',
    onComplete: () => t.destroy(),
  });
}

// Kilat warna sesaat pada sprite yang terkena.
export function flash(scene, sprite, color = 0xffffff) {
  // Phaser 4: setTintFill sudah dihapus, diganti tint + mode FILL
  sprite.setTint(color).setTintMode(Phaser.TintModes.FILL);
  scene.time.delayedCall(80, () => {
    if (sprite.active) sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  });
}

// Babi Hutan Goblin: lambat, tebal, menyeruduk dari jauh, sabetan taring, putaran saat terdesak.
export const HOG_STATS = {
  maxHp: 95, speed: 100, sight: 340, leash: 620, respawnMs: 35000, knockback: 70,
  swipe: { range: 92, dmg: [12, 16], hitFrame: 4, cooldown: 1700 },
  charge: { min: 170, max: 380, dmg: [16, 21], speed: 540, ms: 700, windup: 450, cooldown: 5200 },
  spin: { range: 120, dmg: [13, 17], hitFrames: [2, 3], cooldown: 7000, below: 0.55 },
  hpY: 128, midY: 55,
};

// Ular Goblin: menjaga jarak, meludah racun, menggigit bila didekati, menghilang & muncul di dekat pemain.
export const SNAKE_STATS = {
  maxHp: 58, speed: 78, sight: 380, leash: 600, respawnMs: 30000, knockback: 160,
  bite: { range: 82, dmg: [9, 12], hitFrame: 3, cooldown: 1500 },
  spit: { min: 130, max: 330, dmg: [5, 7], poison: { ticks: 3, dmg: 3, every: 1000 }, speed: 280, life: 1500,
    hitFrame: 3, cooldown: 2800 },
  vanish: { cooldown: 9000, below: 0.6, hidden: 550, near: [150, 220] },
  hpY: 104, midY: 40,
};
