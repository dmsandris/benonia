import * as Phaser from 'phaser';
import { api, isConfigured } from '../net/api.js';
import { GAME_VERSION } from '../config.js';

// M0: layar uji. Membuktikan pipeline build -> GitHub Pages jalan,
// dan (jika config sudah diisi) koneksi ke Supabase lewat api_ping.
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    this.grass = this.add.graphics();
    this.title = this.add.text(0, 0, 'BENONIA', {
      fontFamily: 'Georgia, serif', fontSize: '56px', color: '#f3e3b5',
      stroke: '#2a1d0e', strokeThickness: 8,
    }).setOrigin(0.5);
    this.sub = this.add.text(0, 0, `Milestone ${GAME_VERSION} · fondasi`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#cfe3c2',
    }).setOrigin(0.5);
    this.status = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#9fb59a',
    }).setOrigin(0.5);

    this.layout();
    this.scale.on('resize', () => this.layout());
    this.tweens.add({ targets: this.title, y: '-=6', yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.inOut' });

    this.checkServer();
  }

  layout() {
    const { width: w, height: h } = this.scale;
    // Lantai rumput kotak-kotak 16px (diperbesar 3x) sebagai penanda pixel art.
    const t = 48;
    this.grass.clear();
    for (let y = 0; y < h; y += t) {
      for (let x = 0; x < w; x += t) {
        const odd = ((x / t) + (y / t)) % 2;
        this.grass.fillStyle(odd ? 0x2f5a2c : 0x346131, 1).fillRect(x, y, t, t);
      }
    }
    this.title.setPosition(w / 2, h / 2 - 40);
    this.sub.setPosition(w / 2, h / 2 + 20);
    this.status.setPosition(w / 2, h / 2 + 50);
  }

  async checkServer() {
    if (!isConfigured()) { this.status.setText('Server: belum dikonfigurasi'); return; }
    this.status.setText('Server: menghubungi...');
    try {
      const r = await api('api_ping');
      this.status.setText(`Server: tersambung (${r.world})`).setColor('#d8f5b0');
    } catch (e) {
      this.status.setText(`Server: gagal — ${e.message}`).setColor('#ffb3a3');
    }
  }
}
