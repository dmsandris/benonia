import * as Phaser from 'phaser';
import { GOBLIN } from '../catalog.js';
import { UNIT_SHEETS } from '../unitsheets.js';
import { GOBLIN_STATS, HOG_STATS, SNAKE_STATS, rollDamage, damageText, flash } from '../combat.js';

const dist = (a, b) => Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);

// Musuh dasar: diam/berkeliaran -> mengejar -> menyerang -> kembali ke pos.
// Logika jalan di klien; hadiah kill divalidasi server (api_claimKill).
// Subkelas mengisi pickAttack() untuk memilih serangan khasnya.
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, spawnId, kind, cfg) {
    super(scene, x, y, cfg.tex, 0);
    this.spawnId = spawnId;
    this.kind = kind;
    this.cfg = cfg;
    this.S = cfg.stats;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.home = new Phaser.Math.Vector2(x, y);
    this.setOrigin(cfg.anchor[0] / cfg.fw, cfg.anchor[1] / cfg.fh);
    const [bw, bh] = cfg.body;
    this.body.setSize(bw, bh).setOffset(cfg.anchor[0] - bw / 2, cfg.anchor[1] - bh);
    this.reset();
  }

  reset() {
    this.hp = this.S.maxHp;
    this.state = 'idle';
    this.nextThink = 0;
    this.ready = {};           // waktu siap tiap serangan
    this.stunUntil = 0;
    this.wander = null;
    this.setPosition(this.home.x, this.home.y).setActive(true).setVisible(true).setAlpha(1).clearTint();
    this.body.enable = true;
    this.play(this.cfg.anims.idle);
    this.hpBar ||= this.scene.add.graphics();
    this.hpBar.setVisible(false);
  }

  get alive() { return this.state !== 'dead'; }
  get center() { return { x: this.x, y: this.y - this.S.midY }; }
  isReady(name, time) { return time >= (this.ready[name] ?? 0); }
  cool(name, ms) { this.ready[name] = this.scene.time.now + ms; }

  hit(amount, crit, fromX) {
    if (!this.alive || this.state === 'hidden') return false;
    this.hp -= amount;
    damageText(this.scene, this.x, this.y - this.S.hpY + 8, amount, { crit });
    flash(this.scene, this);
    if (!this.unstoppable) {
      const dir = Math.sign(this.x - fromX) || 1;
      this.setVelocity(dir * this.S.knockback, 0);
      this.stunUntil = this.scene.time.now + 220;
    }
    if (this.state === 'idle' || this.state === 'return') this.state = 'chase';
    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  die() {
    this.state = 'dead';
    this.unstoppable = false;
    this.body.enable = false;
    this.setVelocity(0, 0);
    this.hpBar.setVisible(false);
    this.removeAllListeners('animationupdate');
    const fx = this.scene.add.sprite(this.x, this.y, 'death', 0).setOrigin(0.5, 92 / 128).setDepth(this.y);
    fx.play('death-fx');
    fx.once('animationcomplete', () => fx.destroy());
    this.scene.tweens.add({ targets: this, alpha: 0, duration: 200, onComplete: () => this.setVisible(false) });
    this.scene.time.delayedCall(this.S.respawnMs, () => this.reset());
  }

  // dipanggil tiap frame oleh WorldScene
  think(time, player) {
    if (!this.alive) return;
    this.setDepth(this.y);
    this.drawHp();
    if (this.state === 'hidden') return;
    if (this.state === 'attack') { this.during?.(time, player); if (!this.during) this.setVelocity(0, 0); return; }
    if (time < this.stunUntil) return;

    const d = dist(this, player);
    const fromHome = dist(this, this.home);
    const playerOk = player.active && !player.dead;
    if (playerOk && fromHome < this.S.leash && this.pickAttack(time, player, d)) return;
    if (playerOk && (d < this.S.sight || this.state === 'chase') && fromHome < this.S.leash) {
      this.state = 'chase';
      return this.chase(player, d);
    }
    if (fromHome > 12 && (this.state === 'chase' || this.state === 'return')) {
      this.state = 'return';
      return this.moveTo(this.home.x, this.home.y, this.S.speed * 0.8);
    }
    this.state = 'idle';
    if (time > this.nextThink) {
      this.nextThink = time + Phaser.Math.Between(1500, 3500);
      this.wander = Math.random() < 0.5 ? null : new Phaser.Math.Vector2(
        this.home.x + Phaser.Math.Between(-90, 90), this.home.y + Phaser.Math.Between(-60, 60));
    }
    if (this.wander && dist(this, this.wander) > 8) this.moveTo(this.wander.x, this.wander.y, this.S.speed * 0.45);
    else this.idle();
  }

  // bawaan: kejar sampai jarak serang terdekat
  chase(player, d) {
    if (d > this.chaseStop) this.moveTo(player.x, player.y, this.S.speed);
    else { this.face(player); this.idle(); }
  }
  get chaseStop() { return 60; }

  idle() { this.setVelocity(0, 0); this.play(this.cfg.anims.idle, true); }
  face(t) { if (Math.abs(t.x - this.x) > 4) this.setFlipX(t.x < this.x); }

  moveTo(x, y, speed) {
    const a = Phaser.Math.Angle.Between(this.x, this.y, x, y);
    this.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
    if (Math.abs(Math.cos(a)) > 0.2) this.setFlipX(Math.cos(a) < 0);
    this.play(this.cfg.anims.run, true);
  }

  // Mainkan animasi serangan; onFrame(index0) dipanggil tiap frame; selesai -> kembali mengejar.
  attackAnim(key, onFrame, { repeat } = {}) {
    this.state = 'attack';
    this.setVelocity(0, 0);
    this.removeAllListeners('animationupdate');
    this.play(repeat !== undefined ? { key, repeat } : key);
    if (onFrame) this.on('animationupdate', (anim, frame) => this.alive && onFrame(frame.index - 1));
    this.once('animationcomplete', () => this.endAttack());
  }

  endAttack() {
    this.removeAllListeners('animationupdate');
    this.during = null;
    this.unstoppable = false;
    if (this.alive && this.state === 'attack') { this.state = 'chase'; this.idle(); }
  }

  drawHp() {
    const g = this.hpBar;
    if (this.hp >= this.S.maxHp || this.state === 'hidden') { g.setVisible(false); return; }
    const w = this.cfg.hpW ?? 44, x = this.x - w / 2, y = this.y - this.S.hpY;
    g.setVisible(true).setDepth(this.y + 1).clear()
      .fillStyle(0x2a1408, 0.85).fillRect(x - 2, y - 2, w + 4, 9)
      .fillStyle(0xd94b3d, 1).fillRect(x, y, w * Math.max(0, this.hp) / this.S.maxHp, 5);
  }
}

// ---------------------------------------------------------------- Goblin obor
export class Goblin extends Enemy {
  constructor(scene, x, y, spawnId) {
    super(scene, x, y, spawnId, 'goblin', {
      tex: 'goblin', fw: GOBLIN.fw, fh: GOBLIN.fh, anchor: GOBLIN.anchor, body: GOBLIN.body,
      anims: { idle: 'goblin-idle', run: 'goblin-run' },
      stats: { ...GOBLIN_STATS, hpY: 92, midY: 40 },
    });
  }
  get chaseStop() { return GOBLIN_STATS.range * 0.8; }

  pickAttack(time, player, d) {
    const G = GOBLIN_STATS;
    if (d >= G.range || !this.isReady('melee', time)) return false;
    const dx = player.x - this.x, dy = player.y - this.y;
    let key = 'goblin-attackSide';
    if (Math.abs(dy) > Math.abs(dx) * 1.2) key = dy > 0 ? 'goblin-attackDown' : 'goblin-attackUp';
    else this.setFlipX(dx < 0);
    this.cool('melee', G.cooldown);
    this.attackAnim(key, i => {
      if (i === G.hitFrame && dist(this, player) < G.range + 18) this.scene.damagePlayer(rollDamage(G.dmg).amount, this.x);
    });
    return true;
  }
}

// ---------------------------------------------------------------- Babi Hutan Goblin
const HOG = UNIT_SHEETS.hog;
export class Hog extends Enemy {
  constructor(scene, x, y, spawnId) {
    super(scene, x, y, spawnId, 'hog', {
      tex: 'hog-idle', fw: HOG.fw, fh: HOG.fh, anchor: HOG.anchor, body: [60, 18], hpW: 64,
      anims: { idle: 'hog-idle', run: 'hog-run' }, stats: HOG_STATS,
    });
  }
  get chaseStop() { return HOG_STATS.swipe.range * 0.8; }

  pickAttack(time, player, d) {
    const S = HOG_STATS;
    // terdesak & dekat: putaran taring ke segala arah
    if (d < S.spin.range && this.hp < S.maxHp * S.spin.below && this.isReady('spin', time)) {
      this.cool('spin', S.spin.cooldown); this.cool('swipe', 900);
      const hit = new Set();
      this.attackAnim('hog-spin', i => {
        if (S.spin.hitFrames.includes(i) && !hit.has(i) && dist(this, player) < S.spin.range + 20) {
          hit.add(i); this.scene.damagePlayer(rollDamage(S.spin.dmg).amount, this.x);
        }
      });
      this.scene.ringAt?.(this.x, this.y - 30, S.spin.range, 0xe8e0d0);
      return true;
    }
    if (d < S.swipe.range && this.isReady('swipe', time)) {
      this.face(player); this.cool('swipe', S.swipe.cooldown);
      this.attackAnim('hog-swipe', i => {
        if (i !== S.swipe.hitFrame) return;
        const front = (player.x - this.x) * (this.flipX ? -1 : 1) > -20;
        if (front && dist(this, player) < S.swipe.range + 26) this.scene.damagePlayer(rollDamage(S.swipe.dmg).amount, this.x);
      });
      return true;
    }
    if (d > S.charge.min && d < S.charge.max && this.isReady('charge', time)) {
      this.startCharge(player);
      return true;
    }
    return false;
  }

  // Ancang-ancang (berkedip merah + "!") lalu menyeruduk lurus ke posisi pemain saat itu.
  startCharge(player) {
    const S = HOG_STATS.charge;
    this.cool('charge', S.cooldown);
    this.state = 'attack';
    this.setVelocity(0, 0);
    this.face(player);
    this.play(this.cfg.anims.idle, true);
    const mark = this.scene.add.text(this.x, this.y - HOG_STATS.hpY - 14, '!', {
      fontFamily: 'Georgia, serif', fontStyle: 'bold', fontSize: '34px', color: '#ff5a3c', stroke: '#2a1408', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(100000);
    this.scene.tweens.add({ targets: this, alpha: 0.55, yoyo: true, repeat: 2, duration: S.windup / 6 });
    this.during = () => this.setVelocity(0, 0);
    this.scene.time.delayedCall(S.windup, () => {
      mark.destroy();
      if (!this.alive || this.state !== 'attack') return;
      this.setAlpha(1);
      const a = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
      const vx = Math.cos(a) * S.speed, vy = Math.sin(a) * S.speed;
      this.setFlipX(vx < 0);
      this.unstoppable = true;
      const until = this.scene.time.now + S.ms, sx = this.x, sy = this.y;
      let hitDone = false;
      this.play({ key: 'hog-charge', repeat: -1, startFrame: 2 });
      this.during = time => {
        this.setVelocity(vx, vy);
        if (!hitDone && dist(this, player) < 72 && !player.dead) {
          hitDone = true;
          this.scene.damagePlayer(rollDamage(S.dmg).amount, this.x);
        }
        const blocked = this.body.blocked.left || this.body.blocked.right || this.body.blocked.up || this.body.blocked.down;
        const moved = Phaser.Math.Distance.Between(sx, sy, this.x, this.y);
        if (time > until || (blocked && moved > 20)) {
          if (blocked) this.scene.cameras.main.shake(80, 0.004);
          this.setVelocity(0, 0);
          this.endAttack();
        }
      };
    });
  }
}

// ---------------------------------------------------------------- Ular Goblin
const SNK = UNIT_SHEETS.snake;
export class Snake extends Enemy {
  constructor(scene, x, y, spawnId) {
    super(scene, x, y, spawnId, 'snake', {
      tex: 'snake-idle', fw: SNK.fw, fh: SNK.fh, anchor: SNK.anchor, body: [50, 14], hpW: 56,
      anims: { idle: 'snake-idle', run: 'snake-move' }, stats: SNAKE_STATS,
    });
  }

  // menjaga jarak tembak: mendekat bila terlalu jauh, diam bila sudah di jangkauan ludah
  chase(player, d) {
    const S = SNAKE_STATS;
    if (d > S.spit.max - 20) this.moveTo(player.x, player.y, S.speed);
    else { this.face(player); this.idle(); }
  }

  pickAttack(time, player, d) {
    const S = SNAKE_STATS;
    if (this.hp < S.maxHp * S.vanish.below && d < 160 && this.isReady('vanish', time)) {
      this.vanish(player); return true;
    }
    if (d < S.bite.range && this.isReady('bite', time)) {
      this.face(player); this.cool('bite', S.bite.cooldown);
      this.attackAnim('snake-bite', i => {
        if (i === S.bite.hitFrame && dist(this, player) < S.bite.range + 22) this.scene.damagePlayer(rollDamage(S.bite.dmg).amount, this.x);
      });
      return true;
    }
    if (d > S.spit.min && d < S.spit.max && this.isReady('spit', time)) {
      this.face(player); this.cool('spit', S.spit.cooldown);
      let shot = false;
      this.attackAnim('snake-spit', i => {
        if (i !== S.spit.hitFrame || shot) return;
        shot = true;
        const mouth = { x: this.x + (this.flipX ? -38 : 38), y: this.y - 34 };
        this.scene.spawnEnemyShot({
          tex: 'snake-poison', from: mouth, to: { x: player.x, y: player.y - 40 },
          speed: S.spit.speed, life: S.spit.life, dmg: S.spit.dmg, poison: S.spit.poison, radius: 30,
        });
      });
      return true;
    }
    return false;
  }

  // Masuk ke pusaran, hilang sebentar, muncul lagi di sisi lain pemain.
  vanish(player) {
    const S = SNAKE_STATS.vanish;
    this.cool('vanish', S.cooldown); this.cool('spit', 600);
    this.state = 'attack';
    this.setVelocity(0, 0);
    this.removeAllListeners('animationupdate');
    this.play('snake-vanish');
    this.once('animationcomplete', () => {
      if (!this.alive) return;
      this.state = 'hidden';
      this.setVisible(false);
      this.body.enable = false;
      this.scene.time.delayedCall(S.hidden, () => {
        if (!this.alive) return;
        const spot = this.scene.findSpotNear(player.x, player.y, S.near[0], S.near[1]) || { x: this.x, y: this.y };
        this.setPosition(spot.x, spot.y).setVisible(true);
        this.body.enable = true;
        this.face(player);
        this.state = 'attack';
        this.playReverse('snake-vanish');
        this.once('animationcomplete', () => this.endAttack());
      });
    });
  }
}

export const ENEMY_TYPES = { goblin: Goblin, hog: Hog, snake: Snake };
