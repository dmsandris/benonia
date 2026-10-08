import * as Phaser from 'phaser';
import { joystick, touchButtons } from '../controls.js';
import { SKILLS } from '../combat.js';
import { api, isConfigured } from '../net/api.js';
import { GAME_VERSION } from '../config.js';
import { signOut } from '../net/auth.js';

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
    this.expText = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#e8ffd0', stroke: '#2a1408', strokeThickness: 3 }).setOrigin(0, 0.5);
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

    // ---- tas (inventory) ----
    this.bagBtn = this.add.text(0, 0, '🎒', { fontSize: '30px', backgroundColor: '#2a1408aa', padding: { x: 8, y: 4 } })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.bagBtn.on('pointerdown', () => this.toggleBag());
    this.input.keyboard?.on('keydown-I', () => this.toggleBag());
    const placeBag = () => this.bagBtn.setPosition(this.scale.width - 8, 8);
    placeBag(); this.scale.on('resize', placeBag);
    this.registry.events.on('changedata-profile', () => this.bag && this.renderBag());
    this.events.once('shutdown', () => this.bag?.remove());
  }

  toggleBag() {
    if (this.bag) { this.bag.remove(); this.bag = null; return; }
    this.bag = document.createElement('div');
    this.bag.className = 'bag';
    document.body.appendChild(this.bag);
    this.renderBag();
  }

  renderBag() {
    const pr = this.registry.get('profile') || { inventory: [] };
    const st = this.registry.get('stats') || {};
    const rows = pr.inventory.length
      ? pr.inventory.map(i => `<li><span class="ic">${i.icon}</span><span class="nm">${i.name}<small>${i.info}</small></span><b>×${i.qty}</b></li>`).join('')
      : '<li class="empty">Tas masih kosong. Kalahkan musuh untuk mendapat barang.</li>';
    this.bag.innerHTML = `
      <style>
        .bag{position:fixed;right:8px;top:62px;width:min(300px,calc(100vw - 16px));max-height:70vh;overflow:auto;
          background:#f4e7c6;color:#2a1408;border:3px solid #2a1408;border-radius:10px;padding:12px;font:14px Georgia,serif;
          box-shadow:0 6px 0 #2a140855;z-index:10}
        .bag h3{margin:0 0 2px;font-size:17px;display:flex;justify-content:space-between;align-items:baseline}
        .bag .sub{font:12px system-ui,sans-serif;color:#6b5434;margin-bottom:8px}
        .bag ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
        .bag li{display:flex;align-items:center;gap:8px;background:#fffaf0;border:1px solid #d9c49a;border-radius:6px;padding:6px 8px}
        .bag .ic{font-size:22px}.bag .nm{flex:1;min-width:0;display:flex;flex-direction:column}
        .bag small{font:11px system-ui,sans-serif;color:#7a6440}.bag b{font-variant-numeric:tabular-nums}
        .bag .empty{justify-content:center;color:#7a6440;font:13px system-ui,sans-serif}
        .bag .foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-variant-numeric:tabular-nums}
        .bag button{font:bold 13px Georgia,serif;padding:7px 12px;border:2px solid #2a1408;border-radius:6px;background:#e9d3a2;cursor:pointer}
      </style>
      <h3>${pr.username ?? ''} <span>Lv ${pr.level ?? 1}</span></h3>
      <div class="sub">${st.kills ?? pr.kills ?? 0} musuh dikalahkan</div>
      <ul>${rows}</ul>
      <div class="foot"><span>🪙 ${pr.zeny ?? 0} Zeny</span><button type="button" class="out">Keluar akun</button></div>`;
    this.bag.querySelector('.out').addEventListener('click', async () => {
      await this.scene.get('World').save(true);
      await signOut();
      location.reload();
    });
  }

  placeButtons() {
    const { width: w, height: h } = this.scale;
    const [atk, ...sk] = this.buttons;
    if (this.touch) {
      const ax = w - 74, ay = h - 96;
      atk.c.setPosition(ax, ay);
      // skill dalam dua lingkar di kiri-atas tombol serang: 1-3 dalam, 4-6 luar
      const ring = [[86, 180], [86, 225], [86, 270], [156, 192], [156, 230], [156, 266]];
      sk.forEach((b, i) => {
        const [r, deg] = ring[i];
        const a = Phaser.Math.DegToRad(deg);
        b.c.setPosition(ax + Math.cos(a) * r, ay + Math.sin(a) * r);
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
    this.info.setText(`${st.username ?? ''}  Lv ${st.level ?? 1}  ·  🪙 ${st.zeny ?? 0}  ·  ⚔ ${st.kills ?? 0}\nBenonia ${GAME_VERSION} · ${fps} fps · tile ${t.x},${t.y} · ${this.server}`);
    const x = 8, y = this.info.y + this.info.height + 6, w = 180, h = 14, k = Math.max(0, st.hp / st.maxHp);
    this.hpBar.clear().fillStyle(0x2a1408, 0.85).fillRoundedRect(x, y, w + 4, h + 4, 4)
      .fillStyle(k > 0.3 ? 0xd94b3d : 0xff2a1a, 1).fillRoundedRect(x + 2, y + 2, w * k, h, 3);
    this.hpText.setPosition(x + 2 + w / 2, y + 2 + h / 2).setText(`HP ${st.hp} / ${st.maxHp}`);
    const y2 = y + h + 8, km = Math.max(0, st.mp / st.maxMp);
    this.hpBar.fillStyle(0x2a1408, 0.85).fillRoundedRect(x, y2, w + 4, h, 4)
      .fillStyle(0x3d7bd9, 1).fillRoundedRect(x + 2, y2 + 2, w * km, h - 4, 3);
    this.mpText.setPosition(x + 2 + w / 2, y2 + h / 2).setText(`MP ${st.mp} / ${st.maxMp}`);
    const y3 = y2 + h + 6, ke = st.expNext ? Math.min(1, st.exp / st.expNext) : 0;
    this.hpBar.fillStyle(0x2a1408, 0.85).fillRoundedRect(x, y3, w + 4, 8, 3)
      .fillStyle(0xb9f27c, 1).fillRoundedRect(x + 2, y3 + 2, w * ke, 4, 2);
    this.expText.setPosition(x + w + 10, y3 + 4).setText(`EXP ${st.exp ?? 0}/${st.expNext ?? 0}`);
    this.notice.setPosition(this.scale.width / 2, this.scale.height * 0.3).setText(this.registry.get('notice') || '');
  }
}
