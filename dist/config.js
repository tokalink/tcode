"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DEFAULT_CONFIG_NAME = 'tcode.config.json';
const os_1 = __importDefault(require("os"));
function loadConfig(configPath) {
    const localPath1 = configPath || path_1.default.join(process.cwd(), DEFAULT_CONFIG_NAME);
    const localPath2 = path_1.default.join(process.cwd(), '.tcode', DEFAULT_CONFIG_NAME);
    const globalDir = path_1.default.join(os_1.default.homedir(), '.tcode');
    const globalPath = path_1.default.join(globalDir, DEFAULT_CONFIG_NAME);
    let targetPath = localPath1;
    // 1. Cek di direktori saat ini (local workspace)
    if (fs_1.default.existsSync(localPath1)) {
        targetPath = localPath1;
    }
    // 2. Cek di subfolder .tcode project saat ini
    else if (!configPath && fs_1.default.existsSync(localPath2)) {
        targetPath = localPath2;
    }
    // 3. Cek di direktori global (~/.tcode)
    else if (fs_1.default.existsSync(globalPath)) {
        targetPath = globalPath;
    }
    else {
        // Jika global juga tidak ada, coba buatkan otomatis jika kita sedang di dalam source code d:\tcode
        const sourceConfig = path_1.default.join(__dirname, '..', DEFAULT_CONFIG_NAME);
        if (fs_1.default.existsSync(sourceConfig)) {
            if (!fs_1.default.existsSync(globalDir))
                fs_1.default.mkdirSync(globalDir, { recursive: true });
            fs_1.default.copyFileSync(sourceConfig, globalPath);
            targetPath = globalPath;
            console.log(`\x1b[32m✓ Global config dibuat di: ${globalPath}\x1b[0m\n`);
        }
        else {
            throw new Error(`Config tidak ditemukan!\nSilakan buat file ${DEFAULT_CONFIG_NAME} di direktori ini, subdirektori .tcode, atau di ${globalPath}`);
        }
    }
    try {
        const fileContent = fs_1.default.readFileSync(targetPath, 'utf-8');
        const config = JSON.parse(fileContent);
        if (!config.active_model || !config.models) {
            throw new Error('Invalid config format. "active_model" and "models" are required.');
        }
        config._sourcePath = targetPath;
        return config;
    }
    catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to parse configuration: ${error.message}`);
        }
        throw error;
    }
}
