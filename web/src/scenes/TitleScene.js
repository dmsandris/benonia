import * as Phaser from 'phaser';
import { currentProfile, signIn, signUp } from '../net/auth.js';
import { GAME_VERSION } from '../config.js';

// Layar judul + masuk/daftar. Form memakai elemen HTML biasa di atas canvas
// supaya keyboard HP, isi-otomatis kata sandi, dan tombol Enter bekerja normal.
export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    const { width: w, height: h } = this.scale;
    this.add.tileSprite(0, 0, w, h, 'water').setOrigin(0).setScrollFactor(0);
    this.add.text(w / 2, h * 0.2, 'BENONIA', {
      fontFamily: 'Georgia, serif', fontSize: '54px', color: '#f3e3b5', stroke: '#2a1408', strokeThickness: 10,
    }).setOrigin(0.5);
    this.add.text(w / 2, h * 0.2 + 46, `versi ${GAME_VERSION}`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#e6f4f1',
    }).setOrigin(0.5);
    this.showForm('Memeriksa sesi…', true);
    currentProfile()
      .then(p => (p ? this.enter(p) : this.showForm('')))
      .catch(e => this.showForm(`Tidak bisa menghubungi server: ${e.message}`));
  }

  showForm(message, busy = false) {
    this.form?.remove();
    const f = document.createElement('form');
    f.className = 'auth';
    f.innerHTML = `
      <style>
        .auth{position:fixed;left:50%;top:56%;transform:translate(-50%,-50%);width:min(320px,calc(100vw - 32px));
          display:flex;flex-direction:column;gap:10px;font:15px Georgia,serif;color:#2a1408;
          background:#f4e7c6;border:3px solid #2a1408;border-radius:10px;padding:18px;box-shadow:0 6px 0 #2a140855}
        .auth h2{margin:0 0 4px;font-size:18px;text-align:center}
        .auth input{font:16px system-ui,sans-serif;padding:10px 12px;border:2px solid #8a6a3e;border-radius:6px;background:#fffaf0}
        .auth input:focus{outline:3px solid #3d7bd9;outline-offset:1px}
        .auth .row{display:flex;gap:8px}
        .auth button{flex:1;font:bold 15px Georgia,serif;padding:11px;border-radius:6px;border:2px solid #2a1408;cursor:pointer}
        .auth .in{background:#3d7bd9;color:#fff}.auth .up{background:#e9d3a2;color:#2a1408}
        .auth button:disabled{opacity:.5;cursor:wait}
        .auth .msg{min-height:1.2em;font:13px system-ui,sans-serif;color:#9b2a1d;text-align:center}
        .auth .hint{font:12px system-ui,sans-serif;color:#6b5434;text-align:center}
      </style>
      <h2>Masuk ke Benonia</h2>
      <input id="auth-name" name="username" autocomplete="username" placeholder="Nama (3–16 huruf kecil/angka/_)" maxlength="16" required>
      <input id="auth-pass" name="password" type="password" autocomplete="current-password" placeholder="Kata sandi (min. 6)" minlength="6" required>
      <div class="row"><button class="in" type="submit">Masuk</button><button class="up" type="button">Daftar</button></div>
      <div class="msg" role="alert"></div>
      <div class="hint">Nama dipakai sebagai nama karaktermu.</div>`;
    document.body.appendChild(f);
    this.form = f;
    const msg = f.querySelector('.msg'), btns = f.querySelectorAll('button');
    const nameEl = f.querySelector('#auth-name'), passEl = f.querySelector('#auth-pass');
    msg.textContent = message;
    const setBusy = b => btns.forEach(x => (x.disabled = b));
    setBusy(busy);
    const run = async fn => {
      setBusy(true); msg.textContent = '…';
      try { this.enter(await fn(nameEl.value, passEl.value)); }
      catch (e) { msg.textContent = e.message; setBusy(false); }
    };
    f.addEventListener('submit', e => { e.preventDefault(); run(signIn); });
    f.querySelector('.up').addEventListener('click', () => { if (f.reportValidity()) run(signUp); });
    this.events.once('shutdown', () => f.remove());
  }

  enter(profile) {
    this.form?.remove();
    this.registry.set('profile', profile);
    this.scene.start('World', { profile });
    this.scene.launch('UI');
  }
}
