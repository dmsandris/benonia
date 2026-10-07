import * as Phaser from 'phaser';
import { readMove, attackPressed, touchButtons } from '../controls.js';
import { SPRITES, WARRIOR, TILE } from '../catalog.js';
import { PLAYER, rollDamage, damageText, flash } from '../combat.js';
import { Goblin } from '../entities/Goblin.js';

const SPEED = 230; // piksel dunia per detik (±3,6 tile/detik)

// Urutan gambar: air < buih < pasir < rumput < objek (diurut berdasarkan y kaki).
const DEPTH = { water: -40, foam: -30, sand: -20, grass: -10 };

export class WorldScene extends Phaser.Scene {
  constructor() { super('World'); }

  create() {
    const map = this.make.tilemap({ key: 'island' });
    const ts = map.addTilesetImage('flat', 'flat');
    const W = map.widthInPixels, H = map.heightInPixels;

    this.add.tileSprite(0, 0, W, H, 'water').setOrigin(0).setDepth(DEPTH.water);
    map.createLayer('sand', ts).setDepth(DEPTH.sand);
    map.createLayer('grass', ts).setDepth(DEPTH.grass);
    const solid = map.createLayer('collide', ts).setVisible(false);
    solid.setCollisionByExclusion([-1]);

    // ---- objek & musuh dari peta ----
    this.blockers = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group({ runChildUpdate: false });
    let spawn = { x: W / 2, y: H / 2 };
    for (const o of map.getObjectLayer('objects').objects) {
      if (o.type === 'spawn') { spawn = o; continue; }
      if (o.type === 'goblin') { this.enemies.add(new Goblin(this, o.x, o.y)); continue; }
      const s = SPRITES[o.type];
      if (!s) continue;
      const spr = this.add.sprite(o.x, o.y, o.type, 0)
        .setOrigin(s.anchor[0] / s.fw, s.anchor[1] / s.fh);
      spr.setDepth(s.layer === 'foam' ? DEPTH.foam : o.y);
      if (s.frames) {
        spr.play({ key: `${o.type}-loop`, startFrame: Phaser.Math.Between(0, s.frames - 1) });
        spr.anims.timeScale = Phaser.Math.FloatBetween(0.85, 1.15);
      }
      if (s.body) {
        const [bw, bh] = s.body;
        this.blockers.add(this.add.zone(o.x, o.y - bh / 2, bw, bh));
      }
    }
    this.spawnPoint = { x: spawn.x, y: spawn.y };

    // ---- pemain ----
    const p = this.physics.add.sprite(spawn.x, spawn.y, 'warrior-idle', 0)
      .setOrigin(WARRIOR.anchor[0] / WARRIOR.fw, WARRIOR.anchor[1] / WARRIOR.fh);
    const [bw, bh] = WARRIOR.body;
    p.body.setSize(bw, bh).setOffset(WARRIOR.anchor[0] - bw / 2, WARRIOR.anchor[1] - bh);
    p.setCollideWorldBounds(true);
    p.play('warrior-idle');
    p.hp = PLAYER.maxHp;
    p.dead = false;
    this.player = p;
    this.attacking = false;
    this.combo = 0;
    this.hurtUntil = 0;
    this.kills = 0;
    this.pushStats();

    p.on('animationupdate', (anim, frame) => {
      if (anim.key.startsWith('warrior-attack') && frame.index - 1 === PLAYER.hitFrame) this.swordHit();
    });
    p.on('animationcomplete', anim => {
      if (anim.key.startsWith('warrior-attack')) { this.attacking = false; p.play('warrior-idle'); }
    });

    this.physics.add.collider(p, solid);
    this.physics.add.collider(p, this.blockers);
    this.physics.add.collider(this.enemies, solid);
    this.physics.add.collider(this.enemies, this.blockers);
    this.physics.world.setBounds(0, 0, W, H);

    // ---- kamera ----
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(p, true, 0.15, 0.15);
    cam.setBackgroundColor('#47ABA9');
    this.fitZoom();
    this.scale.on('resize', () => this.fitZoom());

    // ---- input ----
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard?.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D,
    });
    for (const k of ['SPACE', 'J']) this.input.keyboard?.on(`keydown-${k}`, () => { touchButtons.attack = true; });
  }

  // Target ±16 x 10 tile terlihat. Zoom dibulatkan ke bawah ke kelipatan 0,25 supaya piksel rapi.
  fitZoom() {
    const { width: w, height: h } = this.scale;
    let z = Math.min(w / (16 * TILE), h / (10 * TILE));
    z = Phaser.Math.Clamp(Math.floor(z * 4) / 4, 0.5, 2);
    this.cameras.main.setZoom(z);
  }

  // Kotak serang di depan pemain, mengenai semua goblin yang kakinya di dalam kotak.
  swordHit() {
    const p = this.player, dir = p.flipX ? -1 : 1;
    const [w, h] = PLAYER.hitbox;
    const box = new Phaser.Geom.Rectangle(p.x + dir * PLAYER.reach - w / 2, p.y - h * 0.7, w, h);
    let hitAny = false;
    for (const g of this.enemies.getChildren()) {
      if (!g.alive || !box.contains(g.x, g.y)) continue;
      const { amount, crit } = rollDamage(PLAYER.dmg, PLAYER.critChance, PLAYER.critMul);
      if (g.hit(amount, crit, p.x)) { this.kills++; this.pushStats(); }
      hitAny = true;
    }
    if (hitAny) this.cameras.main.shake(70, 0.004);
  }

  damagePlayer(amount, fromX) {
    const p = this.player, now = this.time.now;
    if (p.dead || now < this.hurtUntil) return;
    this.hurtUntil = now + PLAYER.hurtCooldown;
    p.hp = Math.max(0, p.hp - amount);
    damageText(this, p.x, p.y - 90, amount, { color: '#ff7a6b' });
    flash(this, p, 0xff4a3a);
    this.cameras.main.shake(90, 0.006);
    p.setVelocity(Math.sign(p.x - fromX || 1) * 160, 0);
    this.pushStats();
    if (p.hp <= 0) this.killPlayer();
  }

  killPlayer() {
    const p = this.player;
    p.dead = true; this.attacking = false;
    p.setVelocity(0, 0).setVisible(false);
    p.body.enable = false;
    const fx = this.add.sprite(p.x, p.y, 'death', 0).setOrigin(0.5, 92 / 128).setDepth(p.y);
    fx.play('death-fx'); fx.once('animationcomplete', () => fx.destroy());
    this.registry.set('notice', 'Kamu tumbang… bangkit lagi di titik awal');
    this.time.delayedCall(PLAYER.respawnMs, () => {
      p.setPosition(this.spawnPoint.x, this.spawnPoint.y).setVisible(true).setAlpha(1);
      p.body.enable = true; p.dead = false; p.hp = PLAYER.maxHp;
      this.hurtUntil = this.time.now + 1500; // kebal sebentar setelah bangkit
      this.tweens.add({ targets: p, alpha: 0.4, yoyo: true, repeat: 5, duration: 120 });
      this.registry.set('notice', '');
      this.pushStats();
    });
  }

  pushStats() {
    this.registry.set('stats', { hp: this.player.hp, maxHp: PLAYER.maxHp, kills: this.kills });
  }

  update(time) {
    const p = this.player;
    for (const g of this.enemies.getChildren()) g.think(time, p);
    if (p.dead) return;

    if (attackPressed() && !this.attacking) {
      this.attacking = true;
      this.combo = (this.combo + 1) % 2;
      p.setVelocity(0, 0);
      p.play(this.combo ? 'warrior-attack1' : 'warrior-attack2');
    }

    if (this.attacking) { p.setVelocity(0, 0); }
    else if (time > this.hurtUntil - PLAYER.hurtCooldown + 150) {
      const { x, y } = readMove(this.keys);
      p.setVelocity(x * SPEED, y * SPEED);
      if (x !== 0) p.setFlipX(x < 0);
      p.play(x !== 0 || y !== 0 ? 'warrior-run' : 'warrior-idle', true);
    }
    p.setDepth(p.y);

    this.registry.set('playerTile', { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
  }
}
