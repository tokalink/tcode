import * as os from 'os';

let interval: NodeJS.Timeout | null = null;
let isEnabled = false;
let lastTokenStats = ' 📊 Token: 0 in → 0 out │ Σ 0 │ ⏱ 0ms │ 💬 0 msg ';

export function setTokenStats(stats: string) {
  lastTokenStats = ' ' + stats + ' ';
}

function formatMem(bytes: number) {
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function getCpuUsage(): Promise<number> {
  const cpus1 = os.cpus();
  let idle1 = 0, total1 = 0;
  for (const cpu of cpus1) {
    for (const type in cpu.times) total1 += cpu.times[type as keyof typeof cpu.times];
    idle1 += cpu.times.idle;
  }
  
  return new Promise(resolve => {
    setTimeout(() => {
      const cpus2 = os.cpus();
      let idle2 = 0, total2 = 0;
      for (const cpu of cpus2) {
        for (const type in cpu.times) total2 += cpu.times[type as keyof typeof cpu.times];
        idle2 += cpu.times.idle;
      }
      const idleDiff = idle2 - idle1;
      const totalDiff = total2 - total1;
      resolve(totalDiff === 0 ? 0 : 100 * (1 - idleDiff / totalDiff));
    }, 100);
  });
}

export function startStickyBar() {
  if (!process.stdout.isTTY) return;
  if (isEnabled) return;
  isEnabled = true;

  const update = async () => {
    if (!isEnabled || !process.stdout.isTTY) return;
    
    const rows = process.stdout.rows;
    const cols = process.stdout.columns;
    if (!rows || !cols) return;

    // CPU Model
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown CPU';
    
    // RAM
    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    const usedRam = totalRam - freeRam;
    const ramStr = `${formatMem(usedRam)} / ${formatMem(totalRam)}`;

    // CPU Load
    const load = await getCpuUsage();

    const statusText = ` 💻 CPU: ${cpuModel} | ⚙️ Load: ${load.toFixed(1)}% | 🐏 RAM: ${ramStr} `;
    
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

  setupRegion();
  process.stdout.on('resize', setupRegion);

  interval = setInterval(update, 1000);
  update();
}

export function stopStickyBar() {
  isEnabled = false;
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  if (process.stdout.isTTY && process.stdout.rows) {
    process.stdout.write(`\x1b[1;${process.stdout.rows}r`); // Reset scrolling region
  }
}
