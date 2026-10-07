// Arah gerak gabungan keyboard + joystick sentuh.
// UIScene menulis joystick, WorldScene membaca hasil akhirnya.
export const joystick = { x: 0, y: 0, active: false };

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
