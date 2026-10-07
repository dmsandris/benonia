import * as Phaser from 'phaser';
import { SPRITES, WARRIOR, FLAT, WATER_TILE } from '../catalog.js';

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
    for (const [name, a] of Object.entries(WARRIOR.anims)) {
      this.load.spritesheet(`warrior-${name}`, `assets/${a.file}`, { frameWidth: WARRIOR.fw, frameHeight: WARRIOR.fh });
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
    this.scene.start('World');
    this.scene.launch('UI');
  }
}
