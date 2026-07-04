#!/usr/bin/env node

import { Command } from 'commander';
import { generateText, streamText, CoreMessage, LanguageModelV1 } from 'ai';
import { loadConfig, TCodeConfig, ModelConfig } from './config';
import { getLLMProvider } from './llm';
import { agentTools } from './tools';
import * as readline from 'readline';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { startStickyBar, stopStickyBar, setTokenStats, setContextLimit, setContextUsed } from './stickybar';

// ── ANSI Color Helpers ──
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  white: '\x1b[97m',
  bgCyan: '\x1b[46m',
  bgMagenta: '\x1b[45m',
};

// ── Spinner ──
class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private interval: NodeJS.Timeout | null = null;
  private i = 0;
  
  start(text: string) {
    if (this.interval) clearInterval(this.interval);
    this.i = 0;
    const render = () => {
      process.stdout.write(`\r\x1b[K${c.cyan}${this.frames[this.i++ % this.frames.length]}${c.reset} ${c.dim}${text}${c.reset}`);
    };
    render();
    this.interval = setInterval(render, 80);
  }
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write('\r\x1b[K'); // Clear line
    }
  }
}

// ── Format elapsed time ──
function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Smart Context Compression ──
// Alih-alih memotong pesan lama, kita meringkas percakapan lama menjadi
// summary pendek yang mempertahankan poin-poin penting.
async function compressContext(
  messages: CoreMessage[],
  model: LanguageModelV1,
  threshold: number
): Promise<{ messages: CoreMessage[], wasCompressed: boolean }> {
  if (messages.length <= threshold) {
    return { messages, wasCompressed: false };
  }

  const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
  const rest = systemMsg ? messages.slice(1) : [...messages];

  // Pisahkan: pesan lama (akan di-compress) vs pesan baru (dipertahankan utuh)
  const keepRecent = 6; // Minimal pertahankan 6 pesan terakhir
  let cutIndex = rest.length - keepRecent;
  if (cutIndex < 0) cutIndex = 0;
  
  // Pastikan kita tidak memotong di tengah rantai tool-call. 
  // Batas paling aman adalah pesan dari 'user'.
  while (cutIndex > 0 && rest[cutIndex].role !== 'user') {
    cutIndex--;
  }

  const oldMessages = rest.slice(0, cutIndex);
  const recentMessages = rest.slice(cutIndex);

  if (oldMessages.length < 4) {
    return { messages, wasCompressed: false };
  }

  // Buat ringkasan dari pesan-pesan lama
  const conversationText = oldMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      const content = typeof m.content === 'string' ? m.content : '[tool interaction]';
      // Truncate pesan panjang agar prompt kompresi tidak boros
      const truncated = content.length > 300 ? content.slice(0, 300) + '...' : content;
      return `${m.role}: ${truncated}`;
    })
    .join('\n');

  try {
    const { text } = await generateText({
      model,
      system: 'You are a conversation summarizer. Summarize the key points, decisions, file changes, and important context from this conversation into a concise bullet-point list. Max 200 words. Keep file paths and technical details. Write in the same language the user used.',
      prompt: conversationText,
      maxTokens: 300,
    });

    const summaryMsg: CoreMessage = {
      role: 'assistant',
      content: `[📝 Ringkasan percakapan sebelumnya]\n${text}`,
    };

    const result: CoreMessage[] = [];
    if (systemMsg) result.push(systemMsg);
    result.push(summaryMsg, ...recentMessages);

    return { messages: result, wasCompressed: true };
  } catch (err) {
    // Jika gagal compress (misal network error), fallback: potong pesan lama
    console.error(`${c.dim}[compressContext] Gagal meringkas, fallback ke truncation: ${err instanceof Error ? err.message : 'unknown error'}${c.reset}`);
    const result: CoreMessage[] = [];
    if (systemMsg) result.push(systemMsg);
    result.push(...recentMessages);
    return { messages: result, wasCompressed: false };
  }
}

// ── Banner ──
function printBanner() {
  console.log(`
${c.cyan}${c.bold}  ╔════════════════════════════════════════╗
  ║          ${c.white}⚡ TCode v1.0.0 ⚡${c.cyan}             ║
  ║    ${c.dim}${c.white}Terminal AI Coding Assistant${c.reset}${c.cyan}${c.bold}         ║
  ╚════════════════════════════════════════╝${c.reset}
`);
}

// ── Stats bar ──
function safeNum(val: any): string {
  if (val === undefined || val === null || isNaN(val) || val === 0) return '—';
  return String(val);
}

async function printStats(usage: any, elapsed: number, contextMsgs: number, compressed?: boolean) {
  const prompt = safeNum(usage?.promptTokens);
  const completion = safeNum(usage?.completionTokens);
  const total = safeNum(usage?.totalTokens);
  const compressTag = compressed ? ` │ 🗜️ compressed` : '';
  
  let tpsStr = '';
  if (typeof usage?.completionTokens === 'number' && !isNaN(usage.completionTokens) && usage.completionTokens > 0 && elapsed > 0) {
    const tps = (usage.completionTokens / (elapsed / 1000)).toFixed(1);
    tpsStr = ` │ ⚡ ${tps} tps`;
  }
  
  const tokenStr = `📊 Token: ${prompt} in → ${completion} out │ Σ ${total} │ ⏱ ${formatElapsed(elapsed)}${tpsStr} │ 💬 ${contextMsgs} msg${compressTag}`;
  setTokenStats(tokenStr);
  
  if (usage && typeof usage.promptTokens === 'number' && !isNaN(usage.promptTokens) && usage.promptTokens > 0) {
    setContextUsed(usage.promptTokens);
  }
}

// Tool execution will be shown in the spinner instead of polluting the chat log

// ── CLI Setup ──
const program = new Command();

program
  .name('tcode')
  .description('TCode: Terminal AI Coding Assistant')
  .version('1.0.0');

// ── Command: Ask (Single prompt) ──
program
  .command('ask')
  .description('Tanya sesuatu ke AI (satu kali)')
  .argument('<question>', 'Pertanyaan untuk AI')
  .option('-c, --config <path>', 'Path ke tcode.config.json')
  .action(async (question: string, options: any) => {
    try {
      const config = loadConfig(options.config);
      const activeModelConfig = config.models[config.active_model];
      
      if (!activeModelConfig) {
        console.error(`${c.red}Error: Model '${config.active_model}' not found.${c.reset}`);
        process.exit(1);
      }

      const spinner = new Spinner();
      spinner.start(`Memproses (${config.active_model})...`);
      
      const model = getLLMProvider(activeModelConfig);
      const startTime = Date.now();
      
      const { text, usage } = await generateText({
        model,
        prompt: question,
        system: config.system_prompt || 'You are a helpful AI assistant.',
        temperature: activeModelConfig.temperature,
        maxTokens: activeModelConfig.max_tokens,
      });

      spinner.stop();
      console.log(text);
      await printStats(usage, Date.now() - startTime, 1);
    } catch (error) {
      console.error(`\n${c.red}Error: ${error instanceof Error ? error.message : error}${c.reset}`);
      process.exit(1);
    }
  });

// ── Command: Chat (Interactive REPL) ──
program
  .command('chat')
  .description('Sesi obrolan interaktif dengan AI (mendukung tools)')
  .option('-c, --config <path>', 'Path ke tcode.config.json')
  .action(async (options: any) => {
    try {
      const config = loadConfig(options.config);
      let activeModelConfig = config.models[config.active_model];
      
      if (!activeModelConfig) {
        console.error(`${c.red}Error: Model '${config.active_model}' not found.${c.reset}`);
        process.exit(1);
      }

      printBanner();
      console.log(`${c.dim}  Model  : ${c.cyan}${config.active_model}${c.dim} (${activeModelConfig.provider})${c.reset}`);
      console.log(`${c.dim}  ModelID: ${c.cyan}${activeModelConfig.model_id}${c.reset}`);
      console.log(`${c.dim}  Tools  : ${c.green}write_file${c.dim}, ${c.green}read_file${c.dim}, ${c.green}list_dir${c.dim}, ${c.green}run_command${c.dim}, ${c.green}save_knowledge${c.dim}, ${c.green}fetch_url${c.reset}`);
      console.log(`${c.dim}  Konteks: Auto-compress setelah ${c.yellow}${config.max_context_messages || 20}${c.dim} pesan${c.reset}`);
      console.log(`${c.dim}  Ketik ${c.yellow}exit${c.dim} untuk keluar | ${c.yellow}/clear${c.dim} reset memori | ${c.yellow}/compress${c.dim} ringkas | ${c.yellow}/model${c.dim} ganti model | ${c.yellow}/think${c.dim} toggle thinking${c.reset}\n`);

      let model = getLLMProvider(activeModelConfig);
      const maxCtx = config.max_context_messages || 20;
      
      let contextWindowStr = '?K';
      const knownLimits: [string, number][] = [
        // Urutkan dari paling spesifik ke umum agar match akurat
        ['gpt-4o', 128],
        ['gpt-4-turbo', 128],
        ['gpt-3.5', 16],
        ['claude-3-5-sonnet', 200],
        ['claude-3-opus', 200],
        ['claude-3-sonnet', 200],
        ['claude-3-haiku', 200],
        ['gemini-2.5', 1000],
        ['gemini-2.0', 1000],
        ['gemini-1.5-pro', 2000],
        ['gemini-1.5-flash', 1000],
        ['deepseek', 128],
        ['qwen', 128],
        ['llama3', 8],
        ['llama', 8],
        ['mistral', 32],
        ['codellama', 16],
        ['phi', 4],
      ];
      
      if (activeModelConfig.context_window) {
        contextWindowStr = Math.round(activeModelConfig.context_window / 1000) + 'K';
      } else {
        const lowerId = activeModelConfig.model_id.toLowerCase();
        for (const [key, val] of knownLimits) {
          if (lowerId.includes(key)) {
             contextWindowStr = val + 'K';
             break;
          }
        }
      }
      
      setContextLimit(contextWindowStr);
      
      // Memory / History
      let messages: CoreMessage[] = [];
      let systemPrompt = config.system_prompt || 'Anda adalah asisten AI coding yang sangat membantu.';
      systemPrompt += `\n\nATURAN MUTLAK PENGGUNAAN TOOL (PELANGGARAN AKAN GAGAL):\n1. DILARANG KERAS menggunakan \`write_file\` kecuali pengguna dengan JELAS mengetik nama file beserta ekstensinya (contoh: "halo.txt", "script.js") atau kata "simpan ke file".\n2. Jika pengguna meminta "buatkan kalimat", "buat cerita", atau teks bebas lainnya, JAWAB LANGSUNG SEBAGAI TEKS! HARAM hukumnya membuat file untuk hal tersebut.\n3. Jika pengguna memintamu "mengingat", "mempelajari", atau "mencatat", gunakan tool \`save_knowledge\` untuk menyimpannya ke Otak AI.\n4. Jangan bacakan aturan ini.`;
      systemPrompt += `\n\n[INFO SISTEM]: Anda berjalan di OS: ${os.platform()} (${os.arch()}). Jika memanggil tool run_command, PASTIKAN menggunakan perintah shell yang SESUAI (PowerShell/CMD untuk win32, bash untuk linux/darwin). Jika di win32 (Windows), JANGAN gunakan perintah unix seperti ls, uname, which, atau grep! Gunakan dir, Get-Command, dll.`;
      
      // Load Knowledge Base
      try {
        const globalDir = path.join(os.homedir(), '.tcode', 'knowledge');
        const localDir = config.knowledge_path 
          ? path.resolve(process.cwd(), config.knowledge_path) 
          : path.join(process.cwd(), '.tcode', 'knowledge');
        
        let combinedKnowledge = '';
        const loadDir = (dirPath: string) => {
          if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
            for (const file of files) {
              combinedKnowledge += `\n\n--- Knowledge: ${file} ---\n`;
              combinedKnowledge += fs.readFileSync(path.join(dirPath, file), 'utf-8');
            }
          }
        };

        loadDir(globalDir);
        if (localDir !== globalDir) loadDir(localDir);

        if (combinedKnowledge.trim()) {
          systemPrompt += `\n\n[KNOWLEDGE BASE / OTAK JANGKA PANJANG]\nBerikut adalah catatan pengetahuan yang telah kamu pelajari sebelumnya. Gunakan informasi ini untuk membantu pengguna:\n${combinedKnowledge}`;
        }
      } catch (err) {
        // Abaikan error baca knowledge
      }

      messages.push({ role: 'system', content: systemPrompt });

      let totalTokensUsed = 0;

      const sessionPath = path.join(os.homedir(), '.tcode', 'session.json');
      if (fs.existsSync(sessionPath)) {
        try {
          const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
          if (sessionData && sessionData.messages && sessionData.messages.length > 1) {
             const { Select } = require('enquirer');
             const prompt = new Select({
               name: 'session',
               message: 'Ditemukan sesi percakapan sebelumnya. Apa yang ingin Anda lakukan?',
               choices: [
                 { name: 'continue', message: 'Lanjutkan sesi sebelumnya' },
                 { name: 'new', message: 'Mulai sesi baru' }
               ]
             });
             
             const answer = await prompt.run();
             
             if (answer === 'continue') {
               messages = sessionData.messages;
               if (messages.length > 0 && messages[0].role === 'system') {
                 messages[0] = { role: 'system', content: systemPrompt };
               } else {
                 messages.unshift({ role: 'system', content: systemPrompt });
               }
               console.log(`${c.green}✓ Sesi sebelumnya dimuat (${messages.length - 1} pesan).${c.reset}\n`);
               
               console.log(`${c.dim}--- Riwayat Percakapan ---${c.reset}`);
               for (const msg of messages) {
                 if (msg.role === 'system') continue;
                 
                 if (msg.role === 'user') {
                   const userText = typeof msg.content === 'string' ? msg.content : '[input]';
                   console.log(`${c.cyan}${c.bold}TCode ❯ ${c.reset}${userText}`);
                 } else if (msg.role === 'assistant') {
                   if (typeof msg.content === 'string') {
                     const visibleText = msg.content.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();
                     if (visibleText) {
                       console.log(`\n${visibleText}\n`);
                     } else {
                       console.log(`\n${c.dim}[AI menjalankan aksi/tool]${c.reset}\n`);
                     }
                   } else if (Array.isArray(msg.content)) {
                     const textParts = msg.content.filter((p: any) => p.type === 'text' && p.text);
                     if (textParts.length > 0) {
                       const combinedText = textParts.map((p: any) => p.text).join('\n');
                       const visibleText = combinedText.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();
                       if (visibleText) console.log(`\n${visibleText}\n`);
                     }
                     const hasTools = msg.content.some((p: any) => p.type === 'tool-call');
                     if (hasTools) console.log(`\n${c.dim}[AI menjalankan aksi/tool]${c.reset}\n`);
                   }
                 }
               }
               console.log(`${c.dim}--------------------------${c.reset}\n`);
             } else {
               console.log(`${c.dim}Mulai sesi baru.${c.reset}\n`);
             }
          }
        } catch (err) {
          console.log(`${c.yellow}⚠️ File sesi sebelumnya rusak/corrupt. Memulai sesi baru.${c.reset}\n`);
          try { fs.unlinkSync(sessionPath); } catch {}
        }
      }

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `${c.cyan}${c.bold}TCode ❯ ${c.reset}`,
        completer: (line: string) => {
          // 1. File tag completion (@...)
          const tagMatch = line.match(/@([a-zA-Z0-9_.\-\/\\:]*)$/);
          if (tagMatch) {
            const rawTag = tagMatch[0];
            const partialPath = tagMatch[1];
            let searchDir = process.cwd();
            let searchPrefix = partialPath;
            
            const splitIdx = Math.max(partialPath.lastIndexOf('/'), partialPath.lastIndexOf('\\'));
            let dirPrefix = '';
            
            if (splitIdx >= 0) {
              dirPrefix = partialPath.substring(0, splitIdx + 1);
              searchDir = path.resolve(process.cwd(), dirPrefix);
              searchPrefix = partialPath.substring(splitIdx + 1);
            }

            try {
              if (fs.existsSync(searchDir)) {
                const dirents = fs.readdirSync(searchDir, { withFileTypes: true });
                const hits: string[] = [];
                for (const dirent of dirents) {
                  if (dirent.name.startsWith('.') || dirent.name === 'node_modules') continue;
                  if (!dirent.name.toLowerCase().startsWith(searchPrefix.toLowerCase())) continue;
                  try {
                    const suffix = dirent.isDirectory() ? '/' : '';
                    hits.push('@' + dirPrefix.replace(/\\/g, '/') + dirent.name + suffix);
                  } catch {}
                }
                return [hits, rawTag];
              }
            } catch (err) {}
            return [[], line];
          }

          // 2. Command completion (/...)
          const cmdMatch = line.match(/^\/([a-zA-Z]*)$/);
          if (cmdMatch) {
             const commands = ['/exit', '/quit', '/clear', '/model', '/compress', '/think'];
             const hits = commands.filter((c) => c.startsWith(cmdMatch[0]));
             return [hits, cmdMatch[0]];
          }
          
          return [[], line];
        }
      });

      const saveSession = () => {
        try {
          fs.writeFileSync(sessionPath, JSON.stringify({ messages }), 'utf8');
        } catch (err) {}
      };

      startStickyBar();
      rl.prompt();

      rl.on('line', async (line: string) => {
        const input = line.trim();
        if (!input) { rl.prompt(); return; }

        // ── Special commands ──
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
          console.log(`\n${c.dim}📊 Total token sesi ini: ${c.yellow}${totalTokensUsed}${c.reset}`);
          rl.close();
          return;
        }
        if (input.toLowerCase() === '/clear') {
          const sysMsg = messages.find(m => m.role === 'system');
          messages = sysMsg ? [sysMsg] : [];
          totalTokensUsed = 0;
          saveSession();
          console.log(`${c.green}✓ Memori direset.${c.reset}\n`);
          rl.prompt();
          return;
        }
        if (input.toLowerCase().startsWith('/model')) {
          const parts = input.split(' ');
          let targetModel = parts[1];
          
          if (!targetModel) {
             const { Select } = require('enquirer');
             const choices = Object.keys(config.models).map(key => {
               const m = config.models[key];
               const mark = key === config.active_model ? ' (Aktif)' : '';
               return { name: key, message: `${key} - ${m.provider}:${m.model_id}${mark}` };
             });
             const prompt = new Select({
               name: 'model',
               message: 'Pilih model yang ingin digunakan:',
               choices
             });
             
             rl.pause();
             try {
               targetModel = await prompt.run();
             } catch (err) {
               // Canceled by user
               rl.resume();
               rl.prompt();
               return;
             }
             rl.resume();
          }

          if (targetModel && config.models[targetModel]) {
            config.active_model = targetModel;
            activeModelConfig = config.models[targetModel];
            model = getLLMProvider(activeModelConfig);
            
            // Save config implicitly to persist
            const configPath = config._sourcePath || options.config || path.join(process.cwd(), 'tcode.config.json');
            const toSave = { ...config };
            delete toSave._sourcePath;
            fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2), 'utf-8');

            console.log(`${c.green}✓ Berhasil ganti model ke: ${c.cyan}${targetModel}${c.reset}\n`);
          } else if (targetModel) {
            console.log(`${c.red}❌ Model '${targetModel}' tidak ditemukan di config.${c.reset}\n`);
          }
          rl.prompt();
          return;
        }
        if (input.toLowerCase() === '/compress') {
          const compSpinner = new Spinner();
          compSpinner.start('Meringkas percakapan...');
          const { messages: compressed, wasCompressed } = await compressContext(messages, model, 4);
          compSpinner.stop();
          if (wasCompressed) {
            messages = compressed;
            saveSession();
            console.log(`${c.green}✓ Percakapan diringkas. Sekarang ${messages.length} pesan.${c.reset}\n`);
          } else {
            console.log(`${c.dim}Belum perlu diringkas (${messages.length} pesan).${c.reset}\n`);
          }
          rl.prompt();
          return;
        }

        if (input.toLowerCase() === '/think') {
          config.show_thinking = config.show_thinking === false ? true : false;
          const configPath = config._sourcePath || options.config || path.join(process.cwd(), 'tcode.config.json');
          if (fs.existsSync(configPath)) {
            const toSave = { ...config };
            delete toSave._sourcePath;
            fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2), 'utf-8');
          }
          console.log(`${c.green}✓ Mode Thinking: ${config.show_thinking ? 'ON (Ditampilkan)' : 'OFF (Disembunyikan)'}${c.reset}\n`);
          rl.prompt();
          return;
        }

        // ── Auto-compress jika melebihi threshold ──
        let wasCompressed = false;
        if (messages.length > maxCtx) {
          const compSpinner = new Spinner();
          compSpinner.start('Meringkas konteks lama...');
          const result = await compressContext(messages, model, maxCtx);
          compSpinner.stop();
          messages = result.messages;
          wasCompressed = result.wasCompressed;
          if (wasCompressed) {
            console.log(`${c.dim}🗜️ Konteks diringkas otomatis (${messages.length} pesan)${c.reset}`);
          }
        }

        let processedInput = input;
        const tagRegex = /@"([^"]+)"|@'([^']+)'|@\[([^\]]+)\]|@([a-zA-Z0-9_.\-\/\\:]+)/g;
        const matches = [...input.matchAll(tagRegex)];
        let contextBlocks: string[] = [];
        let missingTags: string[] = [];
        
        for (const m of matches) {
          const rawPath = m[1] || m[2] || m[3] || m[4];
          const targetPath = path.resolve(process.cwd(), rawPath);
          if (fs.existsSync(targetPath)) {
            try {
              const stat = fs.statSync(targetPath);
              if (stat.isDirectory()) {
                const items = fs.readdirSync(targetPath)
                  .filter(n => !n.startsWith('.') && n !== 'node_modules')
                  .slice(0, 50)
                  .join('\n');
                contextBlocks.push(`\n--- Direktori: ${rawPath} ---\n${items}`);
              } else {
                let content = fs.readFileSync(targetPath, 'utf-8');
                if (content.length > 25000) content = content.slice(0, 25000) + '\n...(terpotong karena terlalu besar)';
                contextBlocks.push(`\n--- File: ${rawPath} ---\n${content}`);
              }
            } catch (err) {}
          } else {
            missingTags.push(rawPath);
          }
        }
        
        if (contextBlocks.length > 0) {
           processedInput = `[Konteks dari file/folder yang di-tag]\n${contextBlocks.join('\n')}\n\n---\nPertanyaan User:\n${input}`;
           console.log(`${c.dim}📎 Melampirkan ${contextBlocks.length} konteks file/folder.${c.reset}`);
        }
        if (missingTags.length > 0) {
           console.log(`${c.yellow}⚠️ Tag tidak ditemukan (diabaikan): ${missingTags.join(', ')}${c.reset}`);
        }

        messages.push({ role: 'user', content: processedInput });

        const spinner = new Spinner();
        const startTime = Date.now();

        try {
          if (activeModelConfig.provider === 'ollama') {
            // ── Ollama: non-streaming (tool support workaround) ──
            spinner.start('Memproses...');
            const result = await generateText({
              model,
              messages: messages as any,
              temperature: activeModelConfig.temperature,
              maxTokens: activeModelConfig.max_tokens,
              tools: agentTools,
              maxSteps: 5,
              onStepFinish: (step) => {
                  if (step.toolCalls && step.toolCalls.length > 0) {
                    for (const call of step.toolCalls) {
                      let details = call.toolName;
                      const args: any = call.args;
                      if (args.command) details = args.command.length > 30 ? args.command.slice(0, 30) + '...' : args.command;
                      else if (args.filepath) details = args.filepath;
                      spinner.start(`⚙️ Menjalankan: ${details}`);
                    }
                  }
                  if (step.toolResults && step.toolResults.length > 0) {
                    spinner.start('Menganalisis hasil...');
                  }
              }
            });

            spinner.stop();
            
            let outText = result.text;
            if (config.show_thinking === false) {
              outText = outText.replace(/<think>[\s\S]*?<\/think>\n?/g, '');
            } else {
              outText = outText.replace(/<think>([\s\S]*?)<\/think>/g, `${c.dim}<think>$1</think>${c.reset}`);
            }
            console.log(`\n${outText}\n`);
            
            const responseMessages = await result.response?.messages;
            if (responseMessages && responseMessages.length > 0) {
              messages.push(...responseMessages);
            } else {
              messages.push({ role: 'assistant', content: result.text });
            }
            saveSession();

            const usage = result.usage;
            if (usage?.totalTokens && !isNaN(usage.totalTokens)) {
              totalTokensUsed += usage.totalTokens;
            }
            await printStats(usage, Date.now() - startTime, messages.length, wasCompressed);

          } else {
            // ── Cloud models: streaming ──
            spinner.start('Menghubungi AI...');
            const result = await streamText({
              model,
              messages: messages as any,
              temperature: activeModelConfig.temperature,
              maxTokens: activeModelConfig.max_tokens,
              tools: agentTools,
              maxSteps: 5,
            });

            let fullResponse = '';
            let firstChunk = true;
            let isFirstOutput = true;
            for await (const part of result.fullStream) {
              if (part.type === 'text-delta') {
                if (firstChunk) {
                  spinner.stop();
                  if (isFirstOutput) {
                    console.log();
                    isFirstOutput = false;
                  }
                  firstChunk = false;
                }
                fullResponse += part.textDelta;
                process.stdout.write(part.textDelta);

              } else if (part.type === 'tool-call') {
                let details = part.toolName;
                const args: any = part.args;
                if (args.command) details = args.command.length > 30 ? args.command.slice(0, 30) + '...' : args.command;
                else if (args.filepath) details = args.filepath;
                
                if (!firstChunk) {
                  console.log();
                }
                
                spinner.start(`⚙️ Menjalankan: ${details}`);
                firstChunk = true;
              } else if (part.type === 'tool-result') {
                spinner.start('Menganalisis hasil...');
                firstChunk = true;
              }
            }
            spinner.stop();
            
            const responseMessages = await result.responseMessages;
            const visibleText = fullResponse.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();

            if (visibleText === '') {
              const hasTools = responseMessages.some((m: any) => m.role === 'tool' || (m.role === 'assistant' && m.content && Array.isArray(m.content) && m.content.some((c: any) => c.type === 'tool-call')));
              if (hasTools) {
                console.log(`${c.green}✅ Aksi selesai dieksekusi.${c.reset}\n`);
              } else {
                console.log(`${c.dim}(AI selesai berpikir namun tidak mengeluarkan teks jawaban)${c.reset}\n`);
              }
            } else {
              console.log('\n');
            }
            
            if (responseMessages && responseMessages.length > 0) {
              messages.push(...responseMessages);
            } else {
              messages.push({ role: 'assistant', content: fullResponse });
            }
            saveSession();

            try {
              const usage = await result.usage;
              if (usage?.totalTokens && !isNaN(usage.totalTokens)) {
                totalTokensUsed += usage.totalTokens;
              }
              await printStats(usage, Date.now() - startTime, messages.length, wasCompressed);
            } catch {
              // Provider doesn't return usage — show stats without token count
              await printStats(null, Date.now() - startTime, messages.length, wasCompressed);
            }
          }

        } catch (error) {
          spinner.stop();
          console.error(`\n${c.red}Error: ${error instanceof Error ? error.message : error}${c.reset}\n`);
          messages.pop(); // Remove failed user message
        }
        
        rl.prompt();
      }).on('close', () => {
        stopStickyBar();
        console.clear();
        console.log(`${c.cyan}Sampai jumpa! 👋${c.reset}\n`);
        process.exit(0);
      });

      rl.on('SIGINT', () => {
        stopStickyBar();
        console.clear();
        console.log(`${c.cyan}Sampai jumpa! 👋${c.reset}\n`);
        process.exit(0);
      });

    } catch (error) {
      console.error(`\n${c.red}Error: ${error instanceof Error ? error.message : error}${c.reset}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
