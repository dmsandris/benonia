import * as Phaser from 'phaser';
import { joystick, touchButtons } from '../controls.js';
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
    // bar HP + jumlah kalahkan
    this.hpBar = this.add.graphics();
    this.hpText = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', stroke: '#2a1408', strokeThickness: 3 }).setOrigin(0.5);
    this.notice = this.add.text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '20px', color: '#f4f1de', stroke: '#2a1408', strokeThickness: 5 }).setOrigin(0.5);
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

    // ---- tombol serang (hanya perangkat sentuh) ----
    if (this.sys.game.device.input.touch) {
      this.atk = this.add.circle(0, 0, 38, 0xf3e3b5, 0.28).setStrokeStyle(3, 0xf3e3b5, 0.6)
        .setInteractive({ useHandCursor: false });
      this.atkLabel = this.add.text(0, 0, '⚔', { fontSize: '30px', color: '#ffffff' }).setOrigin(0.5);
      this.atk.on('pointerdown', () => { touchButtons.attack = true; this.atk.setFillStyle(0xf3e3b5, 0.5); });
      this.atk.on('pointerup', () => this.atk.setFillStyle(0xf3e3b5, 0.28));
      this.atk.on('pointerout', () => this.atk.setFillStyle(0xf3e3b5, 0.28));
      const place = () => {
        const { width: w, height: h } = this.scale;
        this.atk.setPosition(w - 70, h - 90); this.atkLabel.setPosition(w - 70, h - 90);
      };
      place(); this.scale.on('resize', place);
    }
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
    const st = this.registry.get('stats') || { hp: 0, maxHp: 1, kills: 0 };
    this.info.setText(`Benonia ${GAME_VERSION}  ·  ${fps} fps  ·  tile ${t.x},${t.y}\n${this.server}  ·  goblin kalah: ${st.kills}`);
    const x = 8, y = this.info.y + this.info.height + 6, w = 180, h = 14, k = Math.max(0, st.hp / st.maxHp);
    this.hpBar.clear().fillStyle(0x2a1408, 0.85).fillRoundedRect(x, y, w + 4, h + 4, 4)
      .fillStyle(k > 0.3 ? 0xd94b3d : 0xff2a1a, 1).fillRoundedRect(x + 2, y + 2, w * k, h, 3);
    this.hpText.setPosition(x + 2 + w / 2, y + 2 + h / 2).setText(`HP ${st.hp} / ${st.maxHp}`);
    this.notice.setPosition(this.scale.width / 2, this.scale.height * 0.3).setText(this.registry.get('notice') || '');
  }
}
