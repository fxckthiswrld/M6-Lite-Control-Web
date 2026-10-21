'use strict';
// QC64.KeyList.KEY_CHAR_LIST (6 x 21). Empty cells are unavailable.
window.M6_FULL_SIZE_KEYBOARD = [
  ['~', '', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'Prt', 'SlkLock', 'Pause', '', '', '', ''],
  ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Back', 'Insert', 'Home', 'PageUp', 'Num', 'Pad./', 'Pad.*', 'Pad.-'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\', 'Del', 'End', 'PageDown', 'Pad.7', 'Pad.8', 'Pad.9', 'Pad.+'],
  ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", '', 'Enter', '←', '↓', '→', 'Pad.4', 'Pad.5', 'Pad.6', ''],
  ['Shift.L', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift.R', '↑', 'Del', '', '', '', 'Pad.1', 'Pad.2', 'Pad.3', 'Ent'],
  ['Ctrl.L', 'Win.L', 'Alt.L', '', '', '', 'Space', '', '', 'Alt.R', 'FN', '←', '↓', '→', '', '', '', 'Pad.0', '', 'Pad..', '']
];

window.M6_MEDIA_ICONS = {
  VOL_MUTE: '🔇', VOL_UP: '🔊', VOL_DOWN: '🔉',
  PLAY: '⏯', PLAY_PREVIOUS: '⏮', PLAY_NEXT: '⏭',
  COMPUTER: '🖥', CALC: '🧮', MAIN_PAGE: '🏠',
  WWW_BACK: '⬅', WWW_FORWARD: '➡', SAVE: '💾',
  COPY: '⧉', PASTE: '📋', CUT: '✂', REDO: '↷',
  CANCEL: '✕', NULL: '∅'
};

window.M6_MOUSE_ACTIONS = {
  'left-button': { label: 'Left click', button: 1, x: 0, y: 0, wheel: 0, icon: '🖱' },
  'right-button': { label: 'Right click', button: 2, x: 0, y: 0, wheel: 0, icon: '🖱' },
  'middle-button': { label: 'Middle click', button: 4, x: 0, y: 0, wheel: 0, icon: '🖱' },
  'wheel-up': { label: 'Wheel up', button: 0, x: 0, y: 0, wheel: 1, icon: '🖱' },
  'wheel-down': { label: 'Wheel down', button: 0, x: 0, y: 0, wheel: -1, icon: '🖱' },
  up: { label: 'Move up', button: 0, x: 0, y: -8, wheel: 0, icon: '🖱' },
  down: { label: 'Move down', button: 0, x: 0, y: 8, wheel: 0, icon: '🖱' },
  left: { label: 'Move left', button: 0, x: -8, y: 0, wheel: 0, icon: '🖱' },
  right: { label: 'Move right', button: 0, x: 8, y: 0, wheel: 0, icon: '🖱' }
};

window.M6_MOUSE_SVG = {
  'left-button': '<svg viewBox="0 0 32 44" aria-hidden="true"><rect x="5" y="3" width="22" height="38" rx="11" fill="#303035" stroke="#71717a"/><path d="M7 14V14c0-6 4-9 9-9v9Z" fill="#f5b83d"/><path d="M16 14v-9" stroke="#71717a"/></svg>',
  'right-button': '<svg viewBox="0 0 32 44" aria-hidden="true"><rect x="5" y="3" width="22" height="38" rx="11" fill="#303035" stroke="#71717a"/><path d="M25 14V14c0-6-4-9-9-9v9Z" fill="#f5b83d"/><path d="M16 14v-9" stroke="#71717a"/></svg>',
  'middle-button': '<svg viewBox="0 0 32 44" aria-hidden="true"><rect x="5" y="3" width="22" height="38" rx="11" fill="#303035" stroke="#71717a"/><rect x="14" y="3" width="4" height="11" rx="2" fill="#f5b83d"/></svg>',
  'wheel-up': '<svg viewBox="0 0 32 44" aria-hidden="true"><rect x="5" y="3" width="22" height="38" rx="11" fill="#303035" stroke="#71717a"/><rect x="14" y="7" width="4" height="9" rx="2" fill="#f5b83d"/><path d="M16 19l-4 5h8Z" fill="#f5b83d"/></svg>',
  'wheel-down': '<svg viewBox="0 0 32 44" aria-hidden="true"><rect x="5" y="3" width="22" height="38" rx="11" fill="#303035" stroke="#71717a"/><rect x="14" y="7" width="4" height="9" rx="2" fill="#f5b83d"/><path d="M16 32l-4-5h8Z" fill="#f5b83d"/></svg>'
};