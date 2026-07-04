import fs from 'fs';
import path from 'path';

export interface ModelConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'ollama';
  model_id: string;
  api_key?: string;
  base_url?: string;
  temperature?: number;
  max_tokens?: number;
  context_window?: number;
}

export interface TCodeConfig {
  active_model: string;
  models: Record<string, ModelConfig>;
  system_prompt?: string;
  knowledge_path?: string; // Path ke direktori knowledge lokal/kustom
  max_context_messages?: number; // Limit context window to save tokens
  show_thinking?: boolean;
  _sourcePath?: string;
}

const DEFAULT_CONFIG_NAME = 'tcode.config.json';

import os from 'os';

export function loadConfig(configPath?: string): TCodeConfig {
  const localPath1 = configPath || path.join(process.cwd(), DEFAULT_CONFIG_NAME);
  const localPath2 = path.join(process.cwd(), '.tcode', DEFAULT_CONFIG_NAME);
  const globalDir = path.join(os.homedir(), '.tcode');
  const globalPath = path.join(globalDir, DEFAULT_CONFIG_NAME);
  
  let targetPath = localPath1;

  // 1. Cek di direktori saat ini (local workspace)
  if (fs.existsSync(localPath1)) {
    targetPath = localPath1;
  } 
  // 2. Cek di subfolder .tcode project saat ini
  else if (!configPath && fs.existsSync(localPath2)) {
    targetPath = localPath2;
  }
  // 3. Cek di direktori global (~/.tcode)
  else if (fs.existsSync(globalPath)) {
    targetPath = globalPath;
  } else {
    // Jika global juga tidak ada, coba buatkan otomatis jika kita sedang di dalam source code d:\tcode
    const sourceConfig = path.join(__dirname, '..', DEFAULT_CONFIG_NAME);
    if (fs.existsSync(sourceConfig)) {
      if (!fs.existsSync(globalDir)) fs.mkdirSync(globalDir, { recursive: true });
      fs.copyFileSync(sourceConfig, globalPath);
      targetPath = globalPath;
      console.log(`\x1b[32m✓ Global config dibuat di: ${globalPath}\x1b[0m\n`);
    } else {
      throw new Error(`Config tidak ditemukan!\nSilakan buat file ${DEFAULT_CONFIG_NAME} di direktori ini, subdirektori .tcode, atau di ${globalPath}`);
    }
  }

  try {
    const fileContent = fs.readFileSync(targetPath, 'utf-8');
    const config = JSON.parse(fileContent) as TCodeConfig;
    
    if (!config.active_model || !config.models) {
      throw new Error('Invalid config format. "active_model" and "models" are required.');
    }
    
    config._sourcePath = targetPath;
    return config;
  } catch (error) {
    if (error instanceof Error) {
        throw new Error(`Failed to parse configuration: ${error.message}`);
    }
    throw error;
  }
}
