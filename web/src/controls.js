// Arah gerak gabungan keyboard + joystick sentuh, plus tombol serang.
// UIScene menulis joystick/tombol, WorldScene membaca hasil akhirnya.
export const joystick = { x: 0, y: 0, active: false };
export const touchButtons = { attack: false, skill: null };

export function readMove(keys) {
  let x = 0, y = 0;
  if (keys) {
    if (keys.left.isDown || keys.a.isDown) x -= 1;
    if (keys.right.isDown || keys.d.isDown) x += 1;
    if (keys.up.isDown || keys.w.isDown) y -= 1;
    if (keys.down.isDown || keys.s.isDown) y += 1;
  }
  if (joystick.active) { x += joystick.x; y += joystick.y; }
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y };
}

// true sekali per tekan. Keyboard memakai event keydown (lihat WorldScene) supaya
// tap super cepat (tekan+lepas di antara dua frame) tetap terbaca.
export function attackPressed() {
  const v = touchButtons.attack;
  touchButtons.attack = false;
  return v;
}

// id skill yang diminta (keyboard 1/2/3 atau tombol layar), sekali per tekan
export function skillPressed() {
  const v = touchButtons.skill;
  touchButtons.skill = null;
  return v;
}
