/**
 * HUD manager. Knows about DOM, updates sanity bar, hits, inventory,
 * floor indicator, toasts, whispers, and damage flash.
 */

import { ITEM_TYPES } from './items.js';

const WHISPERS = [
  "you should not be here",
  "they hear you breathing",
  "go back upstairs",
  "the house remembers",
  "she's behind the door",
  "don't look",
  "the car won't start",
  "leave us",
  "join us",
  "we are so cold",
  "one more step",
  "we missed you",
  "did you forget the key?",
];

export class UI {
  constructor() {
    this.elSanityFill = document.getElementById('sanity-fill');
    this.elHearts = document.querySelectorAll('#hits .heart');
    this.elFloor = document.getElementById('floor-num');
    this.elInventory = document.getElementById('inventory');
    this.elObjective = document.getElementById('objective');
    this.elToast = document.getElementById('toast');
    this.elWhisper = document.getElementById('whisper');
    this.elDamage = document.getElementById('damage-flash');
    this.elGhostFlash = document.getElementById('ghost-flash');
    this.elStatic = document.getElementById('static-overlay');

    this.toastTimer = 0;
    this.whisperTimer = 0;
  }

  show() {
    document.getElementById('hud').classList.remove('hidden');
  }

  hide() {
    document.getElementById('hud').classList.add('hidden');
  }

  update(player, mansion, dt) {
    // sanity bar
    const pct = Math.max(0, player.sanity);
    this.elSanityFill.style.width = pct + '%';
    if (pct < 30) this.elSanityFill.classList.add('low');
    else this.elSanityFill.classList.remove('low');

    // hearts
    this.elHearts.forEach((h, i) => {
      if (i < player.hits) h.classList.remove('lost');
      else h.classList.add('lost');
    });

    // floor
    this.elFloor.textContent = `${mansion.currentFloor + 1}/10`;

    // inventory
    this._renderInventory(player.inventory);

    // objective
    this.elObjective.textContent = this._objectiveText(player);

    // toast timer
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.elToast.classList.remove('show');
    }
    if (this.whisperTimer > 0) {
      this.whisperTimer -= dt;
      if (this.whisperTimer <= 0) this.elWhisper.classList.remove('show');
    }

    // sanity-driven static
    if (pct < 25) this.elStatic.classList.add('show');
    else this.elStatic.classList.remove('show');
  }

  _renderInventory(inv) {
    const items = [];
    if (inv.tire) items.push({ key: 'tire', kind: 'essential' });
    if (inv.petrol) items.push({ key: 'petrol', kind: 'essential' });
    if (inv.sparkPlug) items.push({ key: 'sparkPlug', kind: 'essential' });
    if (inv.engine) items.push({ key: 'engine', kind: 'essential' });
    if (inv.key) items.push({ key: 'key', kind: 'essential' });
    if (inv.gun.has) items.push({ key: 'gun', kind: 'weapon', count: inv.gun.ammo });
    if (inv.bombs > 0) items.push({ key: 'bomb', kind: 'weapon', count: inv.bombs });
    if (inv.cat) items.push({ key: 'cat', kind: 'pet' });
    if (inv.dog) items.push({ key: 'dog', kind: 'pet' });

    this.elInventory.innerHTML = items.map(it => {
      const def = ITEM_TYPES[it.key];
      const count = it.count !== undefined ? ` &times;${it.count}` : '';
      const color = '#' + def.color.toString(16).padStart(6, '0');
      return `<span class="inv-item ${it.kind}">
        <span class="inv-icon" style="background:${color}"></span>
        ${def.label}${count}
      </span>`;
    }).join('');
  }

  _objectiveText(player) {
    const inv = player.inventory;
    const parts = [];
    if (!inv.tire) parts.push('tire');
    if (!inv.petrol) parts.push('petrol');
    if (!inv.sparkPlug) parts.push('spark plug');
    if (!inv.engine) parts.push('engine');
    if (!inv.key) parts.push('car key');
    if (!parts.length) return 'Get to the car. Drive away.';
    return 'Still missing: ' + parts.join(', ');
  }

  toast(text, dark = false, duration = 2.4) {
    this.elToast.textContent = text;
    this.elToast.classList.toggle('dark', dark);
    this.elToast.classList.add('show');
    this.toastTimer = duration;
  }

  whisper(text, duration = 3.5) {
    this.elWhisper.textContent = text || WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
    this.elWhisper.classList.add('show');
    this.whisperTimer = duration;
  }

  flashDamage() {
    this.elDamage.classList.add('show');
    setTimeout(() => this.elDamage.classList.remove('show'), 180);
  }

  flashGhost() {
    this.elGhostFlash.classList.add('show');
    setTimeout(() => this.elGhostFlash.classList.remove('show'), 220);
  }

  showEnd(won, message) {
    document.getElementById('hud').classList.add('hidden');
    const end = document.getElementById('end-screen');
    const title = document.getElementById('end-title');
    const msg = document.getElementById('end-message');
    title.textContent = won ? 'YOU ESCAPED' : 'THE HOUSE KEEPS YOU';
    title.classList.toggle('win', won);
    msg.textContent = message;
    end.classList.remove('hidden');
  }
}
