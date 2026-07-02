"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setTokenStats = setTokenStats;
exports.startStickyBar = startStickyBar;
exports.stopStickyBar = stopStickyBar;
const os = __importStar(require("os"));
let interval = null;
let isEnabled = false;
let lastTokenStats = ' 📊 Token: 0 in → 0 out │ Σ 0 │ ⏱ 0ms │ 💬 0 msg ';
function setTokenStats(stats) {
    lastTokenStats = ' ' + stats + ' ';
}
function formatMem(bytes) {
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}
function getCpuUsage() {
    const cpus1 = os.cpus();
    let idle1 = 0, total1 = 0;
    for (const cpu of cpus1) {
        for (const type in cpu.times)
            total1 += cpu.times[type];
        idle1 += cpu.times.idle;
    }
    return new Promise(resolve => {
        setTimeout(() => {
            const cpus2 = os.cpus();
            let idle2 = 0, total2 = 0;
            for (const cpu of cpus2) {
                for (const type in cpu.times)
                    total2 += cpu.times[type];
                idle2 += cpu.times.idle;
            }
            const idleDiff = idle2 - idle1;
            const totalDiff = total2 - total1;
            resolve(totalDiff === 0 ? 0 : 100 * (1 - idleDiff / totalDiff));
        }, 100);
    });
}
function startStickyBar() {
    if (!process.stdout.isTTY)
        return;
    if (isEnabled)
        return;
    isEnabled = true;
    const update = async () => {
        if (!isEnabled || !process.stdout.isTTY)
            return;
        const rows = process.stdout.rows;
        const cols = process.stdout.columns;
        if (!rows || !cols)
            return;
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
function stopStickyBar() {
    isEnabled = false;
    if (interval) {
        clearInterval(interval);
        interval = null;
    }
    if (process.stdout.isTTY && process.stdout.rows) {
        process.stdout.write(`\x1b[1;${process.stdout.rows}r`); // Reset scrolling region
    }
}
