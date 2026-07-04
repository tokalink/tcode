import * as os from 'os';

let interval: NodeJS.Timeout | null = null;
let isEnabled = false;
let lastTokenStats = ' 📊 Token: 0 in → 0 out │ Σ 0 │ ⏱ 0ms │ 💬 0 msg ';
let contextLimit = '?K';
let currentContextUsed = '?';
let resizeHandler: (() => void) | null = null;

export function setTokenStats(stats: string) {
  lastTokenStats = ' ' + stats + ' ';
}

export function setContextLimit(limit: string) {
  contextLimit = limit;
}

export function setContextUsed(used: number) {
  if (used > 1000) {
    currentContextUsed = (used / 1000).toFixed(1) + 'K';
  } else {
    currentContextUsed = used.toString();
  }
}

function formatMem(bytes: number) {
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

export function startStickyBar() {
  if (!process.stdout.isTTY) return;
  if (isEnabled) return;
  isEnabled = true;

  const update = () => {
    if (!isEnabled || !process.stdout.isTTY) return;
    
    const rows = process.stdout.rows;
    const cols = process.stdout.columns;
    if (!rows || !cols) return;
    
    // RAM
    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    const usedRam = totalRam - freeRam;
    const ramStr = `${formatMem(usedRam)} / ${formatMem(totalRam)}`;

    const statusText = ` 🗜️ Context Used: ${currentContextUsed} / ${contextLimit} | 🐏 RAM: ${ramStr} `;
    
    // Gabungkan menjadi 1 baris dan truncate sesuai lebar kolom
    const combined = `${statusText.trim()} │ ${lastTokenStats.trim()}`;
    const padded = (' ' + combined).padEnd(cols).substring(0, cols);
    const renderStr = `\x1b[7m${padded}\x1b[0m`;

    // Save cursor -> move to bottom -> write -> restore cursor
    process.stdout.write(`\x1b[s\x1b[${rows};1H${renderStr}\x1b[u`);
  };

  // Setup scrolling region (leave bottom 1 line for status bar)
  const setupRegion = () => {
    if (process.stdout.rows) {
      process.stdout.write(`\x1b[1;${process.stdout.rows - 1}r`); // Set scrolling region
      process.stdout.write(`\x1b[${process.stdout.rows - 1};1H`); // Move cursor out of bottom line
    }
  };

  resizeHandler = setupRegion;
  setupRegion();
  process.stdout.on('resize', resizeHandler);

  interval = setInterval(update, 3000); // 3 detik cukup untuk update RAM
  update();
}

export function stopStickyBar() {
  isEnabled = false;
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  if (resizeHandler) {
    process.stdout.removeListener('resize', resizeHandler);
    resizeHandler = null;
  }
  if (process.stdout.isTTY && process.stdout.rows) {
    process.stdout.write(`\x1b[1;${process.stdout.rows}r`); // Reset scrolling region
  }
}
