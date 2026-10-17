import { DT, DOOR_SPEED } from "../config.js";
import { state } from "../state.js";

// Porta de correr: `slide` vai de 0 (fechada) a 1 (recolhida na parede)
export function initDoor(d) {
  d.slide = 0;
}

// Porta aberta ainda correndo: quem a abriu espera
export const doorBusy = d => d.open && d.slide < 1;

export function updateDoors() {
  for (const d of state.doors) if (doorBusy(d)) {
    d.slide = Math.min(1, d.slide + DOOR_SPEED * DT);
    state.uiDirty = true;
  }
}
