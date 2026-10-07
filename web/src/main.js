import * as Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';

// Resolusi dasar kecil lalu diperbesar: piksel tetap tajam (pixel art 16x16).
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#10170f',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [BootScene],
});

window.__benonia = game; // memudahkan debug dari console
