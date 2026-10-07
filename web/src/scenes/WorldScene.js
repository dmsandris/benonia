import * as Phaser from 'phaser';
import { readMove, attackPressed } from '../controls.js';
import { SPRITES, WARRIOR, TILE } from '../catalog.js';

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

    // ---- objek dari peta ----
    this.blockers = this.physics.add.staticGroup();
    let spawn = { x: W / 2, y: H / 2 };
    for (const o of map.getObjectLayer('objects').objects) {
      if (o.type === 'spawn') { spawn = o; continue; }
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
        const box = this.add.zone(o.x, o.y - bh / 2, bw, bh);
        this.blockers.add(box);
      }
    }

    // ---- pemain ----
    const p = this.physics.add.sprite(spawn.x, spawn.y, 'warrior-idle', 0)
      .setOrigin(WARRIOR.anchor[0] / WARRIOR.fw, WARRIOR.anchor[1] / WARRIOR.fh);
    const [bw, bh] = WARRIOR.body;
    p.body.setSize(bw, bh).setOffset(WARRIOR.anchor[0] - bw / 2, WARRIOR.anchor[1] - bh);
    p.setCollideWorldBounds(true);
    p.play('warrior-idle');
    this.player = p;
    this.attacking = false;
    this.combo = 0;
    p.on('animationcomplete', anim => {
      if (anim.key.startsWith('warrior-attack')) { this.attacking = false; p.play('warrior-idle'); }
    });

    this.physics.add.collider(p, solid);
    this.physics.add.collider(p, this.blockers);
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
      space: K.SPACE, j: K.J,
    });
  }

  // Target ±16 x 10 tile terlihat. Zoom dibulatkan ke bawah ke kelipatan 0,25 supaya piksel rapi.
  fitZoom() {
    const { width: w, height: h } = this.scale;
    let z = Math.min(w / (16 * TILE), h / (10 * TILE));
    z = Phaser.Math.Clamp(Math.floor(z * 4) / 4, 0.5, 2);
    this.cameras.main.setZoom(z);
  }

  update() {
    const p = this.player;
    if (attackPressed(this.keys) && !this.attacking) {
      this.attacking = true;
      this.combo = (this.combo + 1) % 2;
      p.setVelocity(0, 0);
      p.play(this.combo ? 'warrior-attack1' : 'warrior-attack2');
    }

    if (this.attacking) { p.setVelocity(0, 0); }
    else {
      const { x, y } = readMove(this.keys);
      p.setVelocity(x * SPEED, y * SPEED);
      if (x !== 0) p.setFlipX(x < 0);
      p.play(x !== 0 || y !== 0 ? 'warrior-run' : 'warrior-idle', true);
    }
    p.setDepth(p.y);

    this.registry.set('playerTile', { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
  }
}
