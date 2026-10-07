// Arah gerak gabungan keyboard + joystick sentuh, plus tombol serang.
// UIScene menulis joystick/tombol, WorldScene membaca hasil akhirnya.
export const joystick = { x: 0, y: 0, active: false };
export const touchButtons = { attack: false };

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

// true sekali per tekan (keyboard Space/J atau tombol layar)
export function attackPressed(keys) {
  const kb = keys && (Phaser_JustDown(keys.space) || Phaser_JustDown(keys.j));
  const tb = touchButtons.attack;
  touchButtons.attack = false;
  return kb || tb;
}

function Phaser_JustDown(key) {
  if (!key) return false;
  if (key.isDown && !key._benoniaHeld) { key._benoniaHeld = true; return true; }
  if (!key.isDown) key._benoniaHeld = false;
  return false;
}
