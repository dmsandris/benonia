import * as Phaser from 'phaser';
import { readMove } from '../controls.js';

const SPEED = 80; // piksel dunia per detik (5 tile/detik)
const DIR_FRAME = { down: 0, up: 1, left: 2, right: 3 };

export class WorldScene extends Phaser.Scene {
  constructor() { super('World'); }

  create() {
    // ---- peta ----
    const map = this.make.tilemap({ key: 'forest' });
    const sets = [
      map.addTilesetImage('floor', 'ts-floor'),
      map.addTilesetImage('water', 'ts-water'),
      map.addTilesetImage('nature', 'ts-nature'),
      map.addTilesetImage('ruins', 'ts-ruins'),
    ];
    map.createLayer('ground', sets).setDepth(0);
    map.createLayer('decor', sets).setDepth(1);
    map.createLayer('low', sets).setDepth(2);
    map.createLayer('high', sets).setDepth(20); // di atas pemain (puncak pohon, atap)
    const solid = map.createLayer('collide', sets).setVisible(false);
    solid.setCollisionByExclusion([-1]);
    this.map = map;

    // ---- pemain ----
    const spawn = map.findObject('objects', o => o.name === 'spawn') || { x: 64, y: 64 };
    this.shadow = this.add.image(spawn.x, spawn.y + 7, 'shadow').setDepth(9).setAlpha(0.6);
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'knight', 0).setDepth(10);
    // badan fisik hanya di kaki, supaya bisa "masuk" di depan pohon
    this.player.body.setSize(10, 6).setOffset(3, 10);
    this.player.setCollideWorldBounds(true);
    this.facing = 'down';
    this.physics.add.collider(this.player, solid);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // ---- kamera ----
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.startFollow(this.player, true, 0.2, 0.2);
    cam.setRoundPixels(true);
    this.fitZoom();
    this.scale.on('resize', () => this.fitZoom());

    // ---- input ----
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard?.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D,
    });
  }

  // Zoom bulat (2x, 3x, 4x) supaya piksel tetap tajam; target ±20 tile terlihat.
  fitZoom() {
    const { width: w, height: h } = this.scale;
    const z = Math.max(2, Math.min(4, Math.floor(Math.min(w / (20 * 16), h / (12 * 16))) || 2));
    this.cameras.main.setZoom(z);
  }

  update() {
    const { x, y } = readMove(this.keys);
    const p = this.player;
    p.setVelocity(x * SPEED, y * SPEED);

    if (x !== 0 || y !== 0) {
      // arah hadap mengikuti sumbu yang dominan
      this.facing = Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
      p.anims.play(`knight-walk-${this.facing}`, true);
    } else {
      p.anims.stop();
      p.setFrame(DIR_FRAME[this.facing]);
    }
    this.shadow.setPosition(p.x, p.y + 7);

    this.registry.set('playerTile', {
      x: Math.floor(p.x / 16), y: Math.floor(p.y / 16),
    });
  }
}
