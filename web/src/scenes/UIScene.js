import * as Phaser from 'phaser';
import { joystick } from '../controls.js';
import { api, isConfigured } from '../net/api.js';
import { GAME_VERSION } from '../config.js';

const RADIUS = 48; // jangkauan jempol joystick (piksel layar)

// Lapisan antarmuka tanpa zoom: info kecil + joystick sentuh.
export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create() {
    const style = { fontFamily: 'monospace', fontSize: '12px', color: '#f4f1de', backgroundColor: '#00000066', padding: { x: 6, y: 4 } };
    this.info = this.add.text(8, 8, '', style).setScrollFactor(0);
    this.server = 'Server: ...';
    this.pingServer();

    // ---- joystick dinamis: sentuh di mana saja di separuh kiri layar ----
    this.joyBase = this.add.circle(0, 0, RADIUS, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.35).setVisible(false);
    this.joyKnob = this.add.circle(0, 0, 20, 0xffffff, 0.35).setVisible(false);
    this.joyId = null;
    this.input.addPointer(2);

    this.input.on('pointerdown', p => {
      if (this.joyId !== null || p.x > this.scale.width * 0.6) return;
      if (!p.wasTouch) return; // mouse desktop tidak memunculkan joystick
      this.joyId = p.id;
      this.joyBase.setPosition(p.x, p.y).setVisible(true);
      this.joyKnob.setPosition(p.x, p.y).setVisible(true);
      joystick.active = true;
    });
    this.input.on('pointermove', p => {
      if (p.id !== this.joyId) return;
      const dx = p.x - this.joyBase.x, dy = p.y - this.joyBase.y;
      const len = Math.hypot(dx, dy), k = len > RADIUS ? RADIUS / len : 1;
      this.joyKnob.setPosition(this.joyBase.x + dx * k, this.joyBase.y + dy * k);
      const dead = 8;
      joystick.x = len > dead ? (dx * k) / RADIUS : 0;
      joystick.y = len > dead ? (dy * k) / RADIUS : 0;
    });
    const release = p => {
      if (p.id !== this.joyId) return;
      this.joyId = null;
      this.joyBase.setVisible(false); this.joyKnob.setVisible(false);
      joystick.x = joystick.y = 0; joystick.active = false;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  async pingServer() {
    if (!isConfigured()) { this.server = 'Server: belum dikonfigurasi'; return; }
    try {
      const r = await api('api_ping');
      this.server = `Server: ok (${r.world})`;
    } catch (e) {
      this.server = 'Server: gagal';
      console.warn('api_ping gagal', e);
    }
  }

  update() {
    const t = this.registry.get('playerTile') || { x: 0, y: 0 };
    const fps = Math.round(this.game.loop.actualFps);
    this.info.setText(`Benonia ${GAME_VERSION}  ·  ${fps} fps  ·  tile ${t.x},${t.y}\n${this.server}`);
  }
}
