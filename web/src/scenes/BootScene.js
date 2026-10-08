import * as Phaser from 'phaser';
import { SPRITES, WARRIOR, FLAT, WATER_TILE, GOBLIN, DEATH_FX } from '../catalog.js';
import { UNIT_SHEETS } from '../unitsheets.js';

// Memuat semua aset dari katalog lalu masuk ke dunia.
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const { width: w, height: h } = this.scale;
    const bar = this.add.graphics();
    const label = this.add.text(w / 2, h / 2 - 24, 'BENONIA', {
      fontFamily: 'Georgia, serif', fontSize: '32px', color: '#f3e3b5',
    }).setOrigin(0.5);
    this.load.on('progress', p => {
      bar.clear().fillStyle(0x24413f).fillRect(w / 2 - 100, h / 2 + 8, 200, 8)
        .fillStyle(0xf3e3b5).fillRect(w / 2 - 100, h / 2 + 8, 200 * p, 8);
    });
    this.load.on('complete', () => { bar.destroy(); label.destroy(); });

    this.load.tilemapTiledJSON('island', 'assets/maps/island.tmj');
    this.load.image('flat', `assets/${FLAT.file}`);
    this.load.image('water', `assets/${WATER_TILE}`);
    for (const [key, s] of Object.entries(SPRITES)) {
      this.load.spritesheet(key, `assets/${s.file}`, { frameWidth: s.fw, frameHeight: s.fh });
    }
    this.load.spritesheet('goblin', `assets/${GOBLIN.file}`, { frameWidth: GOBLIN.fw, frameHeight: GOBLIN.fh });
    this.load.spritesheet('death', `assets/${DEATH_FX.file}`, { frameWidth: DEATH_FX.fw, frameHeight: DEATH_FX.fh });
    for (const [name, a] of Object.entries(WARRIOR.anims)) {
      this.load.spritesheet(`warrior-${name}`, `assets/${a.file}`, { frameWidth: WARRIOR.fw, frameHeight: WARRIOR.fh });
    }
    // knight (pemain hadap atas/bawah + skill), babi & ular goblin: strip hasil tools/sprites/build_units.py
    for (const [unit, m] of Object.entries(UNIT_SHEETS)) {
      for (const [name, a] of Object.entries(m.anims)) {
        this.load.spritesheet(`${unit}-${name}`, `assets/${a.file}`, { frameWidth: m.fw, frameHeight: m.fh });
      }
      for (const [name, e] of Object.entries(m.extra)) this.load.image(`${unit}-${name}`, `assets/${e.file}`);
    }
  }

  create() {
    for (const [key, s] of Object.entries(SPRITES)) {
      if (!s.frames) continue;
      this.anims.create({
        key: `${key}-loop`, frameRate: s.fps,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: s.frames - 1 }), repeat: -1,
      });
    }
    for (const [name, a] of Object.entries(WARRIOR.anims)) {
      this.anims.create({
        key: `warrior-${name}`, frameRate: a.fps, repeat: a.repeat,
        frames: this.anims.generateFrameNumbers(`warrior-${name}`, { start: 0, end: a.frames - 1 }),
      });
    }
    for (const [name, a] of Object.entries(GOBLIN.anims)) {
      const start = a.row * GOBLIN.cols;
      this.anims.create({
        key: `goblin-${name}`, frameRate: a.fps, repeat: a.repeat,
        frames: this.anims.generateFrameNumbers('goblin', { start, end: start + a.frames - 1 }),
      });
    }
    for (const [unit, m] of Object.entries(UNIT_SHEETS)) {
      for (const [name, a] of Object.entries(m.anims)) {
        const key = `${unit}-${name}`;
        this.anims.create({
          key, frameRate: a.fps, repeat: a.repeat,
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: a.frames - 1 }),
        });
      }
    }
    // knight diam menghadap atas/bawah = frame pertama jalan
    for (const d of ['Up', 'Down']) {
      this.anims.create({ key: `knight-idle${d}`, frameRate: 1, repeat: -1,
        frames: this.anims.generateFrameNumbers(`knight-walk${d}`, { frames: [0] }) });
    }
    this.anims.create({
      key: 'death-fx', frameRate: 12, repeat: 0,
      frames: this.anims.generateFrameNumbers('death', { start: 0, end: DEATH_FX.cols * 2 - 1 }),
    });
    this.scene.start('Title');
  }
}
