import * as Phaser from 'phaser';
import { readMove, attackPressed, touchButtons, skillPressed } from '../controls.js';
import { SPRITES, WARRIOR, TILE } from '../catalog.js';
import { PLAYER, SKILLS, AIM_RANGE, rollDamage, damageText, flash } from '../combat.js';
import { ENEMY_TYPES } from '../entities/Enemy.js';
import { UNIT_SHEETS } from '../unitsheets.js';
import { api } from '../net/api.js';

const SAVE_EVERY = 8000; // ms

const SPEED = 230; // piksel dunia per detik (±3,6 tile/detik)

// Dua keluarga gambar pemain dengan ukuran frame & titik kaki berbeda:
// Warrior Tiny Swords (samping) dan Knight baru (hadap atas/bawah + skill lempar/api).
const KN = UNIT_SHEETS.knight;
const FAMILY = {
  warrior: { fw: WARRIOR.fw, fh: WARRIOR.fh, ax: WARRIOR.anchor[0], ay: WARRIOR.anchor[1] },
  knight: { fw: KN.fw, fh: KN.fh, ax: KN.anchor[0], ay: KN.anchor[1] },
};

// Urutan gambar: air < buih < pasir < rumput < objek (diurut berdasarkan y kaki).
const DEPTH = { water: -40, foam: -30, sand: -20, grass: -10 };

export class WorldScene extends Phaser.Scene {
  constructor() { super('World'); }

  init(data) {
    this.profile = data.profile; // state dari server (level, exp, posisi terakhir, tas, ...)
  }

  create() {
    const map = this.make.tilemap({ key: 'island' });
    const ts = map.addTilesetImage('flat', 'flat');
    const W = map.widthInPixels, H = map.heightInPixels;

    this.add.tileSprite(0, 0, W, H, 'water').setOrigin(0).setDepth(DEPTH.water);
    map.createLayer('sand', ts).setDepth(DEPTH.sand);
    map.createLayer('grass', ts).setDepth(DEPTH.grass);
    const solid = map.createLayer('collide', ts).setVisible(false);
    this.solid = solid;
    solid.setCollisionByExclusion([-1]);

    // ---- objek & musuh dari peta ----
    this.blockers = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group({ runChildUpdate: false });
    let spawn = { x: W / 2, y: H / 2 };
    const counter = {};
    for (const o of map.getObjectLayer('objects').objects) {
      if (o.type === 'spawn') { spawn = o; continue; }
      // id titik muncul stabil (urutan di peta) dipakai server untuk cek respawn
      const Kind = ENEMY_TYPES[o.type];
      if (Kind) {
        counter[o.type] = (counter[o.type] ?? -1) + 1;
        this.enemies.add(new Kind(this, o.x, o.y, `${o.type}:${counter[o.type]}`));
        continue;
      }
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
    const pr = this.profile;
    const start = pr.x != null ? { x: pr.x, y: pr.y } : spawn;
    const p = this.physics.add.sprite(start.x, start.y, 'warrior-idle', 0);
    this.player = p;
    const [bw, bh] = WARRIOR.body;
    p.body.setSize(bw, bh);
    p.setCollideWorldBounds(true);
    this.face = 'side';            // side | up | down
    this.pfam = null;
    this.playP('warrior-idle');
    p.hp = Math.max(1, pr.hp);
    p.mp = pr.mp;
    p.dead = false;
    this.attacking = false;
    this.shots = [];               // proyektil pemain (perisai, pedang)
    this.enemyShots = [];          // proyektil musuh (ludah racun)
    this.shieldOut = false;
    this.combo = 0;
    this.hurtUntil = 0;
    this.lastSave = { t: 0, x: -1, y: -1, hp: -1 };
    this.time.addEvent({ delay: SAVE_EVERY, loop: true, callback: () => this.save() });
    this.onHide = () => { if (document.visibilityState === 'hidden') this.save(true); };
    document.addEventListener('visibilitychange', this.onHide);
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', this.onHide));
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
        this.attacking = false; this.skillAnim = null; this.playP('warrior-idle');
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
      const name = { 1: 'ONE', 2: 'TWO', 3: 'THREE', 4: 'FOUR', 5: 'FIVE', 6: 'SIX' }[sk.key];
      this.input.keyboard?.on(`keydown-${name}`, () => { touchButtons.skill = sk.id; });
    }
  }

  // Main animasi pemain; ganti titik kaki & badan fisik bila keluarga gambar berubah.
  playP(key, ignoreIfPlaying = true) {
    const p = this.player;
    const fam = key.startsWith('knight-') ? FAMILY.knight : FAMILY.warrior;
    p.play(key, ignoreIfPlaying);
    if (this.pfam !== fam) {
      this.pfam = fam;
      p.setOrigin(fam.ax / fam.fw, fam.ay / fam.fh);
      const [bw, bh] = WARRIOR.body;
      p.body.setOffset(fam.ax - bw / 2, fam.ay - bh);
    }
  }

  // Arah bidik: ke musuh terdekat (dalam AIM_RANGE), kalau tidak ada ke arah hadap.
  aimDir() {
    const p = this.player, t = this.nearestEnemy(AIM_RANGE);
    if (t) {
      const c = t.center, a = Phaser.Math.Angle.Between(p.x, p.y - 40, c.x, c.y);
      return { x: Math.cos(a), y: Math.sin(a), target: t };
    }
    if (this.face === 'up') return { x: 0, y: -1 };
    if (this.face === 'down') return { x: 0, y: 1 };
    return { x: p.flipX ? -1 : 1, y: 0 };
  }

  // Animasi lempar/api hanya menghadap samping: hadapkan ke sisi arah bidik.
  faceSide(dir) {
    this.face = 'side';
    if (Math.abs(dir.x) > 0.05) this.player.setFlipX(dir.x < 0);
  }

  isWalkable(x, y) {
    const W = this.physics.world.bounds;
    if (x < 64 || y < 64 || x > W.width - 64 || y > W.height - 64) return false;
    if (this.solid.getTileAtWorldXY(x, y)) return false;
    return !this.blockers.getChildren().some(z => Math.abs(z.x - x) < z.width / 2 + 24 && Math.abs(z.y - y) < z.height / 2 + 20);
  }

  findSpotNear(x, y, rMin, rMax) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, r = Phaser.Math.Between(rMin, rMax);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.75;
      if (this.isWalkable(px, py)) return { x: px, y: py };
    }
    return null;
  }

  ringAt(x, y, r, color) { this.ring(x, y, r, color); }

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
    this.face = 'side';
    this.attacking = true;
    this.combo = (this.combo + 1) % 2;
    p.setVelocity(0, 0);
    this.playP(this.combo ? 'warrior-attack1' : 'warrior-attack2');
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

  get maxHp() { return this.profile.maxHp; }
  get maxMp() { return this.profile.maxMp; }

  // +1 damage per level di atas 1
  hitEnemy(g, range, critChance = PLAYER.critChance, fromX = this.player.x) {
    const bonus = this.profile.level - 1;
    const { amount, crit } = rollDamage([range[0] + bonus, range[1] + bonus], critChance, PLAYER.critMul);
    if (g.hit(amount, crit, fromX)) this.claimKill(g);
  }

  // ---------- server: kill, simpan, tumbang ----------
  async claimKill(g) {
    const x = g.x, y = g.y;
    try {
      const r = await api('api_claimKill', g.spawnId, g.kind);
      if (!r.ok) return; // ditolak server (terlalu cepat / belum respawn): tanpa hadiah
      this.profile = r.state;
      this.registry.set('profile', r.state);
      let dy = 0;
      const pop = (text, color) => { this.rewardText(x, y - 120 - dy, text, color); dy += 26; };
      pop(`+${r.exp} EXP`, '#b9f27c');
      pop(`+${r.zeny} Zeny`, '#ffd54a');
      for (const d of r.drops) pop(`${d.icon} ${d.name} ×${d.qty}`, d.id === 'stone_of_dunex' ? '#7fe0ff' : '#f4f1de');
      if (r.levelUp) this.levelUp();
      this.pushStats();
    } catch (e) {
      console.warn('claimKill gagal', e);
    }
  }

  rewardText(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      fontFamily: 'Georgia, serif', fontStyle: 'bold', fontSize: '20px', color,
      stroke: '#2a1408', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(100001).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, y: y - 10, duration: 200 });
    this.tweens.add({ targets: t, alpha: 0, y: y - 50, delay: 1300, duration: 500, onComplete: () => t.destroy() });
  }

  levelUp() {
    const p = this.player;
    p.hp = this.maxHp; p.mp = this.maxMp;
    this.ring(p.x, p.y - 30, 160, 0xffd54a);
    this.registry.set('notice', `Naik ke level ${this.profile.level}!`);
    this.time.delayedCall(1800, () => this.registry.get('notice')?.startsWith('Naik') && this.registry.set('notice', ''));
  }

  async save(force = false) {
    const p = this.player, ls = this.lastSave;
    if (p.dead) return;
    const x = Math.round(p.x), y = Math.round(p.y), hp = Math.round(p.hp);
    if (!force && Math.hypot(x - ls.x, y - ls.y) < 8 && hp === ls.hp) return;
    Object.assign(ls, { x, y, hp });
    try { await api('api_saveProgress', x, y, hp, Math.floor(p.mp)); }
    catch (e) { console.warn('simpan gagal', e); }
  }

  // ---------- skill ----------
  castSkill(id) {
    const p = this.player, sk = SKILLS.find(k => k.id === id), now = this.time.now;
    if (!sk || p.dead || this.dashing || this.skillAnim) return; // skill boleh memotong tebasan biasa
    if ((id === 'shield' || id === 'guard') && this.shieldOut) return this.say('Perisai sedang terbang');
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
    this.face = 'side';
    this.playP('warrior-attack1');
    this.time.delayedCall(140, () => { this.skillAnim = 'whirl2'; p.setFlipX(!p.flipX); this.playP('warrior-attack2'); });
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
    this.face = 'side';
    const speed = sk.dist / (sk.ms / 1000);
    this.attacking = true;
    this.dashing = { until: this.time.now + sk.ms * 2.5, sx: p.x, sy: p.y, hit: new Set(), sk, vx: x * speed, vy: y * speed };
    this.hurtUntil = Math.max(this.hurtUntil, this.time.now + sk.ms * 2.5 + 100);
    this.playP('warrior-attack2');
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
      p.setVelocity(0, 0); this.playP('warrior-idle');
      if (d.hit.size) this.cameras.main.shake(90, 0.006);
    }
  }

  // 3. Perisai: tahan 80% damage, gerak melambat.
  skill_guard(sk) {
    this.guardUntil = this.time.now + sk.ms;
    this.face = 'side';
    this.playP('warrior-guard');
    this.say('Bertahan!');
  }

  // Animasi skill knight: callback di frame tertentu, selesai -> lepas kendali (atau ditahan sampai holdMs).
  knightCast(key, atFrame, fn, holdMs = 0) {
    const p = this.player;
    this.attacking = true;
    this.skillAnim = key;
    p.setVelocity(0, 0);
    this.playP(key, false);
    let done = false;
    const onUpd = (anim, frame) => {
      if (anim.key === key && !done && frame.index - 1 >= atFrame) { done = true; fn(); }
    };
    p.on('animationupdate', onUpd);
    const release = () => {
      p.off('animationupdate', onUpd);
      if (!done) { done = true; fn(); }
      if (this.skillAnim !== key) return;
      this.attacking = false; this.skillAnim = null;
    };
    if (holdMs) this.time.delayedCall(holdMs, release);
    else {
      const onDone = anim => { if (anim.key === key) { p.off('animationcomplete', onDone); release(); } };
      p.on('animationcomplete', onDone);
    }
  }

  // 4. Lempar Perisai: bumerang berputar, kena musuh saat pergi dan saat pulang.
  skill_shield(sk) {
    const dir = this.aimDir();
    this.faceSide(dir);
    this.shieldOut = true;
    this.knightCast('knight-throwShield', 3, () => {
      const p = this.player;
      const img = this.add.image(p.x + dir.x * 30, p.y - 45, 'knight-shieldSpin').setDepth(p.y + 50);
      this.shots.push({
        kind: 'shield', img, sk, dir, phase: 'out', traveled: 0, hit: new Set(),
      });
    });
  }

  // 5. Lempar Pedang: lurus, menembus.
  skill_sword(sk) {
    const dir = this.aimDir();
    this.faceSide(dir);
    this.knightCast('knight-throwSword', 3, () => {
      const p = this.player;
      const img = this.add.image(p.x + dir.x * 34, p.y - 48, 'knight-swordFly')
        .setRotation(Math.atan2(dir.y, dir.x)).setDepth(p.y + 50);
      this.shots.push({ kind: 'sword', img, sk, dir, traveled: 0, hit: new Set() });
      this.swordOut = true;
    });
  }

  // 6. Napas Api: kerucut di depan, 3 kali bakar.
  skill_fire(sk) {
    const dir = this.aimDir();
    this.faceSide(dir);
    const side = this.player.flipX ? -1 : 1;
    this.knightCast('knight-fire', 0, () => {}, sk.ms);
    for (const t of sk.ticks) {
      this.time.delayedCall(t, () => {
        const p = this.player;
        if (p.dead) return;
        const mouth = { x: p.x + side * 22, y: p.y - 58 };
        let n = 0;
        for (const g of this.enemies.getChildren()) {
          if (!g.alive || g.state === 'hidden') continue;
          const c = g.center, dx = c.x - mouth.x, dy = c.y - mouth.y;
          const d = Math.hypot(dx, dy);
          const ang = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - (side > 0 ? 0 : Math.PI)));
          if (d < sk.length && (ang < Phaser.Math.DegToRad(sk.angle) || d < 50)) { this.hitEnemy(g, sk.dmg, 0.05, p.x); n++; }
        }
        if (n) this.cameras.main.shake(50, 0.003);
      });
    }
  }

  updateShots(delta) {
    const dt = delta / 1000, p = this.player;
    for (const s of this.shots) {
      const { img, sk } = s;
      if (s.kind === 'shield') {
        img.rotation += dt * 18;
        if (s.phase === 'out') {
          const step = sk.speed * dt;
          img.x += s.dir.x * step; img.y += s.dir.y * step; s.traveled += step;
          if (s.traveled >= sk.range) { s.phase = 'back'; s.hit = new Set(); }
        } else {
          const tx = p.x, ty = p.y - 45, a = Math.atan2(ty - img.y, tx - img.x), step = sk.back * dt;
          img.x += Math.cos(a) * step; img.y += Math.sin(a) * step;
          if (Math.hypot(tx - img.x, ty - img.y) < 26 || p.dead) { s.done = true; this.shieldOut = false; }
        }
      } else {
        const step = sk.speed * dt;
        img.x += s.dir.x * step; img.y += s.dir.y * step; s.traveled += step;
        if (s.traveled >= sk.range) s.done = true;
        else if (s.traveled > sk.range - 120) img.setAlpha((sk.range - s.traveled) / 120);
      }
      img.setDepth(img.y + 50);
      for (const g of this.enemies.getChildren()) {
        if (!g.alive || g.state === 'hidden' || s.hit.has(g)) continue;
        const c = g.center;
        if (Math.hypot(c.x - img.x, c.y - img.y) < sk.radius) { s.hit.add(g); this.hitEnemy(g, sk.dmg, PLAYER.critChance, img.x); }
      }
    }
    for (const s of this.shots.filter(s => s.done)) s.img.destroy();
    this.shots = this.shots.filter(s => !s.done);
    this.swordOut = this.shots.some(s => s.kind === 'sword');
  }

  // ---------- proyektil musuh ----------
  spawnEnemyShot({ tex, from, to, speed, life, dmg, poison, radius }) {
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    const img = this.add.image(from.x, from.y, tex).setDepth(from.y + 60).setScale(0.6).setFlipX(Math.cos(a) < 0);
    this.tweens.add({ targets: img, scale: 1, duration: 250 });
    this.enemyShots.push({ img, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, until: this.time.now + life, dmg, poison, radius });
  }

  updateEnemyShots(time, delta) {
    const dt = delta / 1000, p = this.player;
    for (const s of this.enemyShots) {
      s.img.x += s.vx * dt; s.img.y += s.vy * dt; s.img.setDepth(s.img.y + 60);
      if (time > s.until - 300) s.img.setAlpha(Math.max(0, (s.until - time) / 300));
      if (!p.dead && Math.hypot(p.x - s.img.x, p.y - 40 - s.img.y) < s.radius) {
        this.damagePlayer(rollDamage(s.dmg).amount, s.img.x);
        if (s.poison) this.poisonPlayer(s.poison);
        s.done = true;
      }
      if (time > s.until) s.done = true;
    }
    for (const s of this.enemyShots.filter(s => s.done)) s.img.destroy();
    this.enemyShots = this.enemyShots.filter(s => !s.done);
  }

  // Racun: damage kecil berkala, tidak terhalang jeda kebal. Racun baru mengganti yang lama.
  poisonPlayer({ ticks, dmg, every }) {
    this.poisonTimer?.remove();
    const p = this.player;
    p.setTint(0x9dff7a);
    let left = ticks;
    this.poisonTimer = this.time.addEvent({
      delay: every, repeat: ticks - 1,
      callback: () => {
        left--;
        if (p.dead) return;
        const amount = this.time.now < this.guardUntil ? 1 : dmg;
        p.hp = Math.max(0, p.hp - amount);
        damageText(this, p.x + 18, p.y - 80, amount, { color: '#9dff7a' });
        this.pushStats();
        if (p.hp <= 0) this.killPlayer();
        if (left <= 0) p.clearTint();
      },
    });
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
    p.dead = true; this.attacking = false; this.skillAnim = null;
    this.poisonTimer?.remove(); p.clearTint();
    p.setVelocity(0, 0).setVisible(false);
    p.body.enable = false;
    const fx = this.add.sprite(p.x, p.y, 'death', 0).setOrigin(0.5, 92 / 128).setDepth(p.y);
    fx.play('death-fx'); fx.once('animationcomplete', () => fx.destroy());
    this.registry.set('notice', 'Kamu tumbang… EXP level ini hilang');
    api('api_playerDied').then(st => { this.profile = st; this.registry.set('profile', st); this.pushStats(); })
      .catch(e => console.warn('playerDied gagal', e));
    this.time.delayedCall(PLAYER.respawnMs, () => {
      p.setPosition(this.spawnPoint.x, this.spawnPoint.y).setVisible(true).setAlpha(1);
      p.body.enable = true; p.dead = false; p.hp = this.maxHp; p.mp = this.maxMp;
      this.hurtUntil = this.time.now + 1500; // kebal sebentar setelah bangkit
      this.tweens.add({ targets: p, alpha: 0.4, yoyo: true, repeat: 5, duration: 120 });
      this.registry.set('notice', '');
      this.pushStats();
    });
  }

  pushStats() {
    const p = this.player, pr = this.profile;
    this.registry.set('stats', {
      hp: p.hp, maxHp: this.maxHp, mp: Math.floor(p.mp), maxMp: this.maxMp,
      kills: pr.kills, level: pr.level, exp: pr.exp, expNext: pr.expNext, zeny: pr.zeny, username: pr.username,
    });
    this.registry.set('skills', { ready: { ...this.skillReady }, guardUntil: this.guardUntil });
  }

  update(time, delta) {
    const p = this.player;
    for (const g of this.enemies.getChildren()) g.think(time, p);
    this.updateShots(delta);
    this.updateEnemyShots(time, delta);
    if (p.dead) return;

    // MP terisi pelan
    const mpBefore = Math.floor(p.mp);
    p.mp = Math.min(this.maxMp, p.mp + PLAYER.mpRegen * delta / 1000);
    if (Math.floor(p.mp) !== mpBefore) this.pushStats();

    const sk = skillPressed();
    if (sk) this.castSkill(sk);
    if (attackPressed() && !this.attacking) this.startAttack();

    const guarding = time < this.guardUntil;
    if (this.dashing) this.updateDash(time);
    else if (this.attacking) { p.setVelocity(0, 0); }
    else if (time > this.hurtUntil - PLAYER.hurtCooldown + 150) {
      const { x, y } = readMove(this.keys);
      const moving = x !== 0 || y !== 0;
      if (moving) {
        this.lastMove = { x, y };
        if (Math.abs(y) > Math.abs(x) * 1.15) { this.face = y < 0 ? 'up' : 'down'; p.setFlipX(false); }
        else { this.face = 'side'; p.setFlipX(x < 0); }
      }
      const sp = guarding ? SPEED * 0.45 : SPEED;
      p.setVelocity(x * sp, y * sp);
      let key;
      if (guarding) { this.face = 'side'; key = 'warrior-guard'; }
      else if (this.face === 'up') key = moving ? 'knight-walkUp' : 'knight-idleUp';
      else if (this.face === 'down') key = moving ? 'knight-walkDown' : 'knight-idleDown';
      else if (moving) key = 'warrior-run';
      else key = this.shieldOut ? 'knight-noShield' : this.swordOut ? 'knight-noSword' : 'warrior-idle';
      this.playP(key);
    }
    // gelembung perisai
    this.fx.clear();
    if (guarding) this.fx.setDepth(p.y + 1).lineStyle(3, 0x9fd8ff, 0.7).fillStyle(0x9fd8ff, 0.12)
      .fillEllipse(p.x, p.y - 40, 120, 130).strokeEllipse(p.x, p.y - 40, 120, 130);
    p.setDepth(p.y);

    this.registry.set('playerTile', { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
  }
}
