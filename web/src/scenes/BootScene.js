import * as Phaser from 'phaser';

// Memuat semua aset lalu masuk ke dunia.
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const { width: w, height: h } = this.scale;
    const bar = this.add.graphics();
    const label = this.add.text(w / 2, h / 2 - 24, 'BENONIA', {
      fontFamily: 'Georgia, serif', fontSize: '32px', color: '#f3e3b5',
    }).setOrigin(0.5);
    this.load.on('progress', p => {
      bar.clear().fillStyle(0x2b3a26).fillRect(w / 2 - 100, h / 2 + 8, 200, 8)
        .fillStyle(0xd8f5b0).fillRect(w / 2 - 100, h / 2 + 8, 200 * p, 8);
    });
    this.load.on('complete', () => { bar.destroy(); label.destroy(); });

    this.load.tilemapTiledJSON('forest', 'assets/maps/forest.tmj');
    this.load.image('ts-floor', 'assets/tilesets/TilesetFloor.png');
    this.load.image('ts-water', 'assets/tilesets/TilesetWater.png');
    this.load.image('ts-nature', 'assets/tilesets/TilesetNature.png');
    this.load.image('ts-ruins', 'assets/tilesets/TilesetVillageAbandoned.png');
    this.load.spritesheet('knight', 'assets/actors/knight.png', { frameWidth: 16, frameHeight: 16 });
    this.load.image('shadow', 'assets/actors/shadow.png');
  }

  create() {
    // Animasi jalan: kolom sheet = arah (bawah, atas, kiri, kanan), baris = frame.
    const dirs = ['down', 'up', 'left', 'right'];
    dirs.forEach((d, col) => {
      this.anims.create({
        key: `knight-walk-${d}`,
        frames: this.anims.generateFrameNumbers('knight', { frames: [col, col + 4, col + 8, col + 12] }),
        frameRate: 8, repeat: -1,
      });
    });
    this.scene.start('World');
    this.scene.launch('UI');
  }
}
