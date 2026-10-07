import * as Phaser from 'phaser';
import { joystick, touchButtons } from '../controls.js';
import { SKILLS } from '../combat.js';
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
    this.mpText = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', stroke: '#0d1f3a', strokeThickness: 3 }).setOrigin(0.5);
    this.notice = this.add.text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '20px', color: '#f4f1de', stroke: '#2a1408', strokeThickness: 5 }).setOrigin(0.5);
    this.pingServer();

    // ---- joystick dinamis: sentuh di mana saja di separuh kiri layar ----
    this.joyBase = this.add.circle(0, 0, RADIUS, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.35).setVisible(false);
    this.joyKnob = this.add.circle(0, 0, 20, 0xffffff, 0.35).setVisible(false);
    this.joyId = null;
    this.input.addPointer(2);

    this.input.on('pointerdown', p => {
      if (this.joyId !== null || p.x > this.scale.width * 0.55) return;
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

    // ---- tombol aksi: serang + 3 skill ----
    // Sentuh: tombol besar di kanan bawah, skill melingkar di sekitarnya.
    // Desktop: baris di tengah bawah dengan label tombol keyboard (bisa juga diklik).
    this.touch = this.sys.game.device.input.touch;
    this.buttons = [];
    const mk = (id, icon, keyLabel, big, onPress) => {
      const r = big ? 40 : 30;
      const c = this.add.container(0, 0);
      const bg = this.add.circle(0, 0, r, 0x2a1408, 0.55).setStrokeStyle(3, 0xf3e3b5, 0.75);
      const ic = this.add.text(0, -1, icon, { fontSize: big ? '32px' : '24px' }).setOrigin(0.5);
      const cd = this.add.graphics();
      const cdText = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
      const kl = this.add.text(r * 0.62, r * 0.62, keyLabel, { fontFamily: 'monospace', fontSize: '11px', color: '#f3e3b5', backgroundColor: '#2a1408', padding: { x: 3, y: 1 } }).setOrigin(0.5).setVisible(!this.touch);
      c.add([bg, ic, cd, cdText, kl]);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', (ptr, lx, ly, ev) => { ev?.stopPropagation?.(); onPress(); bg.setFillStyle(0x5a3a18, 0.8); });
      bg.on('pointerup', () => bg.setFillStyle(0x2a1408, 0.55));
      bg.on('pointerout', () => bg.setFillStyle(0x2a1408, 0.55));
      const b = { id, c, bg, cd, cdText, r };
      this.buttons.push(b);
      return b;
    };
    mk('attack', '⚔', 'Spasi', true, () => { touchButtons.attack = true; });
    for (const sk of SKILLS) mk(sk.id, sk.icon, sk.key, false, () => { touchButtons.skill = sk.id; });
    this.placeButtons();
    this.scale.on('resize', () => this.placeButtons());
  }

  placeButtons() {
    const { width: w, height: h } = this.scale;
    const [atk, ...sk] = this.buttons;
    if (this.touch) {
      const ax = w - 74, ay = h - 96;
      atk.c.setPosition(ax, ay);
      // skill melingkar di kiri-atas tombol serang
      const angles = [180, 225, 270];
      sk.forEach((b, i) => {
        const a = Phaser.Math.DegToRad(angles[i]);
        b.c.setPosition(ax + Math.cos(a) * 86, ay + Math.sin(a) * 86);
      });
    } else {
      const gap = 78, total = gap * this.buttons.length;
      this.buttons.forEach((b, i) => b.c.setPosition(w / 2 - total / 2 + gap / 2 + i * gap, h - 56));
    }
  }

  drawCooldowns() {
    const st = this.registry.get('skills');
    const stats = this.registry.get('stats') || {};
    if (!st) return;
    const now = this.time.now;
    for (const b of this.buttons) {
      if (b.id === 'attack') continue;
      const sk = SKILLS.find(k => k.id === b.id);
      const left = Math.max(0, st.ready[b.id] - now);
      b.cd.clear();
      if (left > 0) {
        const k = left / sk.cd;
        b.cd.fillStyle(0x000000, 0.55).slice(0, 0, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false).fillPath();
        b.cdText.setText((left / 1000).toFixed(left < 1000 ? 1 : 0));
      } else {
        b.cdText.setText('');
        if ((stats.mp ?? 99) < sk.mp) b.cd.fillStyle(0x1b3f8f, 0.45).fillCircle(0, 0, b.r); // MP kurang
      }
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
    const st = this.registry.get('stats') || { hp: 0, maxHp: 1, mp: 0, maxMp: 1, kills: 0 };
    this.drawCooldowns();
    this.info.setText(`Benonia ${GAME_VERSION}  ·  ${fps} fps  ·  tile ${t.x},${t.y}\n${this.server}  ·  goblin kalah: ${st.kills}`);
    const x = 8, y = this.info.y + this.info.height + 6, w = 180, h = 14, k = Math.max(0, st.hp / st.maxHp);
    this.hpBar.clear().fillStyle(0x2a1408, 0.85).fillRoundedRect(x, y, w + 4, h + 4, 4)
      .fillStyle(k > 0.3 ? 0xd94b3d : 0xff2a1a, 1).fillRoundedRect(x + 2, y + 2, w * k, h, 3);
    this.hpText.setPosition(x + 2 + w / 2, y + 2 + h / 2).setText(`HP ${st.hp} / ${st.maxHp}`);
    const y2 = y + h + 8, km = Math.max(0, st.mp / st.maxMp);
    this.hpBar.fillStyle(0x2a1408, 0.85).fillRoundedRect(x, y2, w + 4, h, 4)
      .fillStyle(0x3d7bd9, 1).fillRoundedRect(x + 2, y2 + 2, w * km, h - 4, 3);
    this.mpText.setPosition(x + 2 + w / 2, y2 + h / 2).setText(`MP ${st.mp} / ${st.maxMp}`);
    this.notice.setPosition(this.scale.width / 2, this.scale.height * 0.3).setText(this.registry.get('notice') || '');
  }
}
