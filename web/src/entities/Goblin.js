import * as Phaser from 'phaser';
import { GOBLIN } from '../catalog.js';
import { GOBLIN_STATS as G, rollDamage, damageText, flash } from '../combat.js';

// Goblin obor: diam/berkeliaran -> mengejar pemain -> menyerang -> kembali ke pos.
// Logika jalan di klien (M2). Hadiah/kill akan divalidasi server di M3.
export class Goblin extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, spawnId) {
    super(scene, x, y, 'goblin', 0);
    this.spawnId = spawnId;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.home = new Phaser.Math.Vector2(x, y);
    this.setOrigin(GOBLIN.anchor[0] / GOBLIN.fw, GOBLIN.anchor[1] / GOBLIN.fh);
    const [bw, bh] = GOBLIN.body;
    this.body.setSize(bw, bh).setOffset(GOBLIN.anchor[0] - bw / 2, GOBLIN.anchor[1] - bh);
    this.reset();
  }

  reset() {
    this.hp = G.maxHp;
    this.state = 'idle';
    this.nextThink = 0;
    this.nextAttack = 0;
    this.stunUntil = 0;
    this.wander = null;
    this.setPosition(this.home.x, this.home.y).setActive(true).setVisible(true).setAlpha(1);
    this.body.enable = true;
    this.play('goblin-idle');
    this.hpBar ||= this.scene.add.graphics();
    this.hpBar.setVisible(false);
  }

  get alive() { return this.state !== 'dead'; }

  hit(amount, crit, fromX) {
    if (!this.alive) return false;
    this.hp -= amount;
    damageText(this.scene, this.x, this.y - 80, amount, { crit });
    flash(this.scene, this);
    const dir = Math.sign(this.x - fromX) || 1;
    this.setVelocity(dir * G.knockback, 0);
    this.stunUntil = this.scene.time.now + 220;
    if (this.state !== 'attack') this.state = 'chase';
    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  die() {
    this.state = 'dead';
    this.body.enable = false;
    this.setVelocity(0, 0);
    this.hpBar.setVisible(false);
    const fx = this.scene.add.sprite(this.x, this.y, 'death', 0).setOrigin(0.5, 92 / 128).setDepth(this.y);
    fx.play('death-fx');
    fx.once('animationcomplete', () => fx.destroy());
    this.scene.tweens.add({ targets: this, alpha: 0, duration: 200, onComplete: () => this.setVisible(false) });
    this.scene.time.delayedCall(G.respawnMs, () => this.reset());
  }

  // dipanggil tiap frame oleh WorldScene
  think(time, player) {
    if (!this.alive) return;
    this.setDepth(this.y);
    this.drawHp();
    if (time < this.stunUntil) return;
    if (this.state === 'attack') { this.setVelocity(0, 0); return; }

    const toPlayer = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const fromHome = Phaser.Math.Distance.Between(this.x, this.y, this.home.x, this.home.y);
    const playerOk = player.active && !player.dead;

    if (playerOk && toPlayer < G.range && time > this.nextAttack) return this.attack(player);
    if (playerOk && (toPlayer < G.sight || this.state === 'chase') && fromHome < G.leash) {
      this.state = 'chase';
      return this.moveTo(player.x, player.y, G.speed, toPlayer > G.range * 0.8);
    }
    if (fromHome > 12 && (this.state === 'chase' || this.state === 'return')) {
      this.state = 'return';
      return this.moveTo(this.home.x, this.home.y, G.speed * 0.8, true);
    }
    // berkeliaran pelan di sekitar pos
    this.state = 'idle';
    if (time > this.nextThink) {
      this.nextThink = time + Phaser.Math.Between(1500, 3500);
      this.wander = Math.random() < 0.5 ? null : new Phaser.Math.Vector2(
        this.home.x + Phaser.Math.Between(-90, 90), this.home.y + Phaser.Math.Between(-60, 60));
    }
    if (this.wander && Phaser.Math.Distance.BetweenPoints(this, this.wander) > 8) {
      this.moveTo(this.wander.x, this.wander.y, G.speed * 0.4, true);
    } else { this.setVelocity(0, 0); this.play('goblin-idle', true); }
  }

  moveTo(x, y, speed, go) {
    if (!go) { this.setVelocity(0, 0); this.play('goblin-idle', true); return; }
    const a = Phaser.Math.Angle.Between(this.x, this.y, x, y);
    this.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
    if (Math.abs(Math.cos(a)) > 0.2) this.setFlipX(Math.cos(a) < 0);
    this.play('goblin-run', true);
  }

  attack(player) {
    this.state = 'attack';
    this.setVelocity(0, 0);
    const dx = player.x - this.x, dy = player.y - this.y;
    let key = 'goblin-attackSide';
    if (Math.abs(dy) > Math.abs(dx) * 1.2) key = dy > 0 ? 'goblin-attackDown' : 'goblin-attackUp';
    else this.setFlipX(dx < 0);
    this.play(key);
    this.nextAttack = this.scene.time.now + G.cooldown;
    const onFrame = (anim, frame) => {
      if (frame.index - 1 !== G.hitFrame) return;
      this.off('animationupdate', onFrame);
      const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      if (this.alive && d < G.range + 18) this.scene.damagePlayer(rollDamage(G.dmg).amount, this.x);
    };
    this.on('animationupdate', onFrame);
    this.once('animationcomplete', () => {
      this.off('animationupdate', onFrame);
      if (this.alive) { this.state = 'chase'; this.play('goblin-idle'); }
    });
  }

  drawHp() {
    const g = this.hpBar;
    if (this.hp >= G.maxHp) { g.setVisible(false); return; }
    const w = 44, x = this.x - w / 2, y = this.y - 92;
    g.setVisible(true).setDepth(this.y + 1).clear()
      .fillStyle(0x2a1408, 0.85).fillRect(x - 2, y - 2, w + 4, 9)
      .fillStyle(0xd94b3d, 1).fillRect(x, y, w * Math.max(0, this.hp) / G.maxHp, 5);
  }
}
