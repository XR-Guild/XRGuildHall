import { InputActions, type World } from '@iwsdk/core';

/**
 * On-screen walking stick for touch screens. Its value is added to the locomotion move axis that WASD and gamepads
 * feed, so walking, collision and standing up from a seat work as they do with a keyboard.
 */
export function addJoystick(world: World) {
  const pad = document.createElement('div'); pad.id = 'joystick'; pad.setAttribute('aria-hidden', 'true');
  const knob = document.createElement('div'); pad.append(knob);
  document.body.append(pad);

  const stick = { x: 0, y: 0 };
  let id: number | null = null;
  const move = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect(), reach = r.width / 2;
    let x = (e.clientX - r.left - reach) / reach, y = (e.clientY - r.top - reach) / reach;
    const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
    stick.x = x; stick.y = y;
    knob.style.transform = `translate(${x * 50}%, ${y * 50}%)`;
  };
  const release = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null; stick.x = stick.y = 0; knob.style.transform = '';
  };
  pad.addEventListener('pointerdown', e => { id = e.pointerId; pad.setPointerCapture(id); move(e); e.preventDefault(); });
  pad.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);

  const actions = world.input.actions, getAxis2D = actions.getAxis2D.bind(actions);
  actions.getAxis2D = (action, out) => {
    const v = getAxis2D(action, out);
    if (action === InputActions.LocomotionMove && id !== null && !world.session) {
      v.x = Math.max(-1, Math.min(1, v.x + stick.x)); v.y = Math.max(-1, Math.min(1, v.y + stick.y));
    }
    return v;
  };
}
