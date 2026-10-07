import * as Phaser from 'phaser';
import { readMove, attackPressed, touchButtons, skillPressed } from '../controls.js';
import { SPRITES, WARRIOR, TILE } from '../catalog.js';
import { PLAYER, SKILLS, rollDamage, damageText, flash } from '../combat.js';
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
    p.mp = PLAYER.maxMp;
    p.dead = false;
    this.player = p;
    this.attacking = false;
    this.combo = 0;
    this.hurtUntil = 0;
    this.kills = 0;
    this.lastMove = { x: 1, y: 0 };
    this.skillReady = Object.fromEntries(SKILLS.map(k => [k.id, 0]));
    this.guardUntil = 0;
    this.dashing = null;
    this.fx = this.add.graphics().setDepth(99999);
    this.pushStats();

    p.on('animationupdate', (anim, frame) => {
      if (this.skillAnim || this.dashing) return; // animasi dipakai skill: damage diatur skill sendiri
      if (anim.key.startsWith('warrior-attack') && frame.index - 1 === PLAYER.hitFrame) this.swordHit();
    });
    p.on('animationcomplete', anim => {
      if (anim.key.startsWith('warrior-attack') && !this.dashing) {
        if (this.skillAnim === 'whirl1') return; // tebasan pertama Putaran; lanjut ke kedua
        this.attacking = false; this.skillAnim = null; p.play('warrior-idle');
      }
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
    for (const sk of SKILLS) {
      const name = { 1: 'ONE', 2: 'TWO', 3: 'THREE' }[sk.key];
      this.input.keyboard?.on(`keydown-${name}`, () => { touchButtons.skill = sk.id; });
    }
  }

  // Target ±16 x 10 tile terlihat. Zoom dibulatkan ke bawah ke kelipatan 0,25 supaya piksel rapi.
  fitZoom() {
    const { width: w, height: h } = this.scale;
    let z = Math.min(w / (16 * TILE), h / (10 * TILE));
    z = Phaser.Math.Clamp(Math.floor(z * 4) / 4, 0.5, 2);
    this.cameras.main.setZoom(z);
  }

  // ---------- serangan dasar ----------
  nearestEnemy(range) {
    let best = null, bd = range;
    for (const g of this.enemies.getChildren()) {
      if (!g.alive) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, g.x, g.y);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  startAttack() {
    const p = this.player;
    // otomatis menghadap musuh terdekat supaya tebasan tidak meleset
    const t = this.nearestEnemy(PLAYER.autoAim);
    if (t && Math.abs(t.x - p.x) > 6) p.setFlipX(t.x < p.x);
    this.attacking = true;
    this.combo = (this.combo + 1) % 2;
    p.setVelocity(0, 0);
    p.play(this.combo ? 'warrior-attack1' : 'warrior-attack2');
  }

  // Kena: musuh di kotak depan pemain, ATAU yang sudah menempel dari arah mana pun.
  swordHit() {
    const p = this.player, dir = p.flipX ? -1 : 1;
    const [w, h] = PLAYER.hitbox;
    const box = new Phaser.Geom.Rectangle(p.x + dir * PLAYER.reach - w / 2, p.y - h * 0.7, w, h);
    const hits = this.enemies.getChildren().filter(g => g.alive &&
      (box.contains(g.x, g.y) || Phaser.Math.Distance.Between(p.x, p.y, g.x, g.y) < PLAYER.closeRange));
    for (const g of hits) this.hitEnemy(g, PLAYER.dmg, PLAYER.critChance);
    if (hits.length) this.cameras.main.shake(70, 0.004);
  }

  hitEnemy(g, range, critChance = PLAYER.critChance) {
    const { amount, crit } = rollDamage(range, critChance, PLAYER.critMul);
    if (g.hit(amount, crit, this.player.x)) { this.kills++; this.pushStats(); }
  }

  // ---------- skill ----------
  castSkill(id) {
    const p = this.player, sk = SKILLS.find(k => k.id === id), now = this.time.now;
    if (!sk || p.dead || this.dashing || this.skillAnim) return; // skill boleh memotong tebasan biasa
    if (now < this.skillReady[id]) return this.say('Belum siap');
    if (p.mp < sk.mp) return this.say('MP kurang');
    p.mp -= sk.mp;
    this.skillReady[id] = now + sk.cd;
    this[`skill_${id}`](sk);
    this.pushStats();
  }

  say(text) {
    const t = this.add.text(this.player.x, this.player.y - 110, text, {
      fontFamily: 'Georgia, serif', fontSize: '20px', color: '#f4f1de', stroke: '#2a1408', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(100000);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  // 1. Putaran: dua tebasan cepat bolak-balik + cincin angin, kena semua musuh di sekeliling.
  skill_whirl(sk) {
    const p = this.player;
    this.attacking = true;
    this.skillAnim = 'whirl1';
    p.setVelocity(0, 0);
    p.play('warrior-attack1');
    this.time.delayedCall(140, () => { this.skillAnim = 'whirl2'; p.setFlipX(!p.flipX); p.play('warrior-attack2'); });
    this.ring(p.x, p.y - 30, sk.radius, 0xe8f6ff);
    this.time.delayedCall(120, () => {
      const hits = this.enemies.getChildren().filter(g => g.alive &&
        Phaser.Math.Distance.Between(p.x, p.y, g.x, g.y) < sk.radius);
      for (const g of hits) { this.hitEnemy(g, sk.dmg); g.setVelocity(Math.sign(g.x - p.x || 1) * 340, Math.sign(g.y - p.y) * 200); }
      if (hits.length) this.cameras.main.shake(110, 0.007);
    });
  }

  // 2. Terjang: melesat ke arah gerak terakhir, menebas yang dilewati, kebal selama melesat.
  skill_dash(sk) {
    const p = this.player;
    const mv = readMove(this.keys);
    let { x, y } = (mv.x || mv.y) ? mv : this.lastMove;
    if (!x && !y) x = p.flipX ? -1 : 1;
    const len = Math.hypot(x, y); x /= len; y /= len;
    if (x) p.setFlipX(x < 0);
    const speed = sk.dist / (sk.ms / 1000);
    this.attacking = true;
    this.dashing = { until: this.time.now + sk.ms * 2.5, sx: p.x, sy: p.y, hit: new Set(), sk, vx: x * speed, vy: y * speed };
    this.hurtUntil = Math.max(this.hurtUntil, this.time.now + sk.ms * 2.5 + 100);
    p.play('warrior-attack2');
    p.setVelocity(this.dashing.vx, this.dashing.vy);
  }

  updateDash(time) {
    const d = this.dashing, p = this.player;
    p.setVelocity(d.vx, d.vy);
    // bayangan yang memudar
    const ghost = this.add.image(p.x, p.y, p.texture.key, p.frame.name).setOrigin(p.originX, p.originY)
      .setFlipX(p.flipX).setAlpha(0.45).setTint(0x9fd8ff).setDepth(p.y - 1);
    this.tweens.add({ targets: ghost, alpha: 0, duration: 260, onComplete: () => ghost.destroy() });
    for (const g of this.enemies.getChildren()) {
      if (!g.alive || d.hit.has(g)) continue;
      if (Phaser.Math.Distance.Between(p.x, p.y, g.x, g.y) < d.sk.width) { d.hit.add(g); this.hitEnemy(g, d.sk.dmg); }
    }
    // selesai bila jarak tercapai (tidak bergantung fps), atau tertahan/batas waktu
    const moved = Phaser.Math.Distance.Between(d.sx, d.sy, p.x, p.y);
    if (moved >= d.sk.dist || time > d.until) {
      this.dashing = null; this.attacking = false;
      p.setVelocity(0, 0); p.play('warrior-idle');
      if (d.hit.size) this.cameras.main.shake(90, 0.006);
    }
  }

  // 3. Perisai: tahan 80% damage, gerak melambat.
  skill_guard(sk) {
    this.guardUntil = this.time.now + sk.ms;
    this.player.play('warrior-guard');
    this.say('Bertahan!');
  }

  ring(x, y, r, color) {
    const g = this.add.graphics().setDepth(y + 200);
    const state = { k: 0 };
    this.tweens.add({
      targets: state, k: 1, duration: 320, ease: 'Cubic.out',
      onUpdate: () => {
        g.clear().lineStyle(10 * (1 - state.k) + 2, color, 0.8 * (1 - state.k))
          .strokeEllipse(x, y + 20, r * 2 * state.k, r * 1.2 * state.k);
      },
      onComplete: () => g.destroy(),
    });
  }

  damagePlayer(amount, fromX) {
    const p = this.player, now = this.time.now;
    if (p.dead || now < this.hurtUntil) return;
    this.hurtUntil = now + PLAYER.hurtCooldown;
    if (now < this.guardUntil) {
      const sk = SKILLS.find(k => k.id === 'guard');
      amount = Math.max(1, Math.round(amount * (1 - sk.reduce)));
      flash(this, p, 0x9fd8ff);
    }
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
      p.body.enable = true; p.dead = false; p.hp = PLAYER.maxHp; p.mp = PLAYER.maxMp;
      this.hurtUntil = this.time.now + 1500; // kebal sebentar setelah bangkit
      this.tweens.add({ targets: p, alpha: 0.4, yoyo: true, repeat: 5, duration: 120 });
      this.registry.set('notice', '');
      this.pushStats();
    });
  }

  pushStats() {
    const p = this.player;
    this.registry.set('stats', { hp: p.hp, maxHp: PLAYER.maxHp, mp: Math.floor(p.mp), maxMp: PLAYER.maxMp, kills: this.kills });
    this.registry.set('skills', { ready: { ...this.skillReady }, guardUntil: this.guardUntil });
  }

  update(time, delta) {
    const p = this.player;
    for (const g of this.enemies.getChildren()) g.think(time, p);
    if (p.dead) return;

    // MP terisi pelan
    const mpBefore = Math.floor(p.mp);
    p.mp = Math.min(PLAYER.maxMp, p.mp + PLAYER.mpRegen * delta / 1000);
    if (Math.floor(p.mp) !== mpBefore) this.pushStats();

    const sk = skillPressed();
    if (sk) this.castSkill(sk);
    if (attackPressed() && !this.attacking) this.startAttack();

    const guarding = time < this.guardUntil;
    if (this.dashing) this.updateDash(time);
    else if (this.attacking) { p.setVelocity(0, 0); }
    else if (time > this.hurtUntil - PLAYER.hurtCooldown + 150) {
      const { x, y } = readMove(this.keys);
      if (x || y) this.lastMove = { x, y };
      const sp = guarding ? SPEED * 0.45 : SPEED;
      p.setVelocity(x * sp, y * sp);
      if (x !== 0) p.setFlipX(x < 0);
      p.play(guarding ? 'warrior-guard' : (x !== 0 || y !== 0 ? 'warrior-run' : 'warrior-idle'), true);
    }
    // gelembung perisai
    this.fx.clear();
    if (guarding) this.fx.setDepth(p.y + 1).lineStyle(3, 0x9fd8ff, 0.7).fillStyle(0x9fd8ff, 0.12)
      .fillEllipse(p.x, p.y - 40, 120, 130).strokeEllipse(p.x, p.y - 40, 120, 130);
    p.setDepth(p.y);

    this.registry.set('playerTile', { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
  }
}
