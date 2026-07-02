#!/usr/bin/env node
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
const commander_1 = require("commander");
const ai_1 = require("ai");
const config_1 = require("./config");
const llm_1 = require("./llm");
const tools_1 = require("./tools");
const readline = __importStar(require("readline"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const stickybar_1 = require("./stickybar");
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
    frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    interval = null;
    i = 0;
    start(text) {
        if (this.interval)
            clearInterval(this.interval);
        this.i = 0;
        this.interval = setInterval(() => {
            process.stdout.write(`\r${c.cyan}${this.frames[this.i++ % this.frames.length]}${c.reset} ${c.dim}${text}${c.reset}`);
        }, 80);
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
function formatElapsed(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}
// ── Smart Context Compression ──
// Alih-alih memotong pesan lama, kita meringkas percakapan lama menjadi
// summary pendek yang mempertahankan poin-poin penting.
async function compressContext(messages, model, threshold) {
    if (messages.length <= threshold) {
        return { messages, wasCompressed: false };
    }
    const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
    const rest = systemMsg ? messages.slice(1) : [...messages];
    // Pisahkan: pesan lama (akan di-compress) vs pesan baru (dipertahankan utuh)
    const keepRecent = 6; // Pertahankan 6 pesan terakhir secara utuh
    const oldMessages = rest.slice(0, -keepRecent);
    const recentMessages = rest.slice(-keepRecent);
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
        const { text } = await (0, ai_1.generateText)({
            model,
            system: 'You are a conversation summarizer. Summarize the key points, decisions, file changes, and important context from this conversation into a concise bullet-point list. Max 200 words. Keep file paths and technical details. Write in the same language the user used.',
            prompt: conversationText,
            maxTokens: 300,
        });
        const summaryMsg = {
            role: 'assistant',
            content: `[📝 Ringkasan percakapan sebelumnya]\n${text}`,
        };
        const result = [];
        if (systemMsg)
            result.push(systemMsg);
        result.push(summaryMsg, ...recentMessages);
        return { messages: result, wasCompressed: true };
    }
    catch {
        // Jika gagal compress, fallback: potong pesan lama
        const result = [];
        if (systemMsg)
            result.push(systemMsg);
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
function safeNum(val) {
    if (val === undefined || val === null || isNaN(val))
        return '—';
    return String(val);
}
async function printStats(usage, elapsed, contextMsgs, compressed) {
    const prompt = safeNum(usage?.promptTokens);
    const completion = safeNum(usage?.completionTokens);
    const total = safeNum(usage?.totalTokens);
    const compressTag = compressed ? ` │ 🗜️ compressed` : '';
    const tokenStr = `📊 Token: ${prompt} in → ${completion} out │ Σ ${total} │ ⏱ ${formatElapsed(elapsed)} │ 💬 ${contextMsgs} msg${compressTag}`;
    (0, stickybar_1.setTokenStats)(tokenStr);
}
// Tool execution will be shown in the spinner instead of polluting the chat log
// ── CLI Setup ──
const program = new commander_1.Command();
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
    .action(async (question, options) => {
    try {
        const config = (0, config_1.loadConfig)(options.config);
        const activeModelConfig = config.models[config.active_model];
        if (!activeModelConfig) {
            console.error(`${c.red}Error: Model '${config.active_model}' not found.${c.reset}`);
            process.exit(1);
        }
        const spinner = new Spinner();
        spinner.start(`Memproses (${config.active_model})...`);
        const model = (0, llm_1.getLLMProvider)(activeModelConfig);
        const startTime = Date.now();
        const { text, usage } = await (0, ai_1.generateText)({
            model,
            prompt: question,
            system: config.system_prompt || 'You are a helpful AI assistant.',
            temperature: activeModelConfig.temperature,
            maxTokens: activeModelConfig.max_tokens,
        });
        spinner.stop();
        console.log(text);
        await printStats(usage, Date.now() - startTime, 1);
    }
    catch (error) {
        console.error(`\n${c.red}Error: ${error instanceof Error ? error.message : error}${c.reset}`);
        process.exit(1);
    }
});
// ── Command: Chat (Interactive REPL) ──
program
    .command('chat')
    .description('Sesi obrolan interaktif dengan AI (mendukung tools)')
    .option('-c, --config <path>', 'Path ke tcode.config.json')
    .action(async (options) => {
    try {
        const config = (0, config_1.loadConfig)(options.config);
        let activeModelConfig = config.models[config.active_model];
        if (!activeModelConfig) {
            console.error(`${c.red}Error: Model '${config.active_model}' not found.${c.reset}`);
            process.exit(1);
        }
        printBanner();
        console.log(`${c.dim}  Model  : ${c.cyan}${config.active_model}${c.dim} (${activeModelConfig.provider})${c.reset}`);
        console.log(`${c.dim}  ModelID: ${c.cyan}${activeModelConfig.model_id}${c.reset}`);
        console.log(`${c.dim}  Tools  : ${c.green}write_file${c.dim}, ${c.green}read_file${c.dim}, ${c.green}list_dir${c.dim}, ${c.green}run_command${c.reset}`);
        console.log(`${c.dim}  Konteks: Auto-compress setelah ${c.yellow}${config.max_context_messages || 20}${c.dim} pesan${c.reset}`);
        console.log(`${c.dim}  Ketik ${c.yellow}exit${c.dim} untuk keluar | ${c.yellow}/clear${c.dim} reset memori | ${c.yellow}/compress${c.dim} ringkas | ${c.yellow}/model${c.dim} ganti model | ${c.yellow}/think${c.dim} toggle thinking${c.reset}\n`);
        let model = (0, llm_1.getLLMProvider)(activeModelConfig);
        const maxCtx = config.max_context_messages || 20;
        // Memory / History
        let messages = [];
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
            const loadDir = (dirPath) => {
                if (fs.existsSync(dirPath)) {
                    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
                    for (const file of files) {
                        combinedKnowledge += `\n\n--- Knowledge: ${file} ---\n`;
                        combinedKnowledge += fs.readFileSync(path.join(dirPath, file), 'utf-8');
                    }
                }
            };
            loadDir(globalDir);
            if (localDir !== globalDir)
                loadDir(localDir);
            if (combinedKnowledge.trim()) {
                systemPrompt += `\n\n[KNOWLEDGE BASE / OTAK JANGKA PANJANG]\nBerikut adalah catatan pengetahuan yang telah kamu pelajari sebelumnya. Gunakan informasi ini untuk membantu pengguna:\n${combinedKnowledge}`;
            }
        }
        catch (err) {
            // Abaikan error baca knowledge
        }
        messages.push({ role: 'system', content: systemPrompt });
        let totalTokensUsed = 0;
        (0, stickybar_1.startStickyBar)();
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: `${c.cyan}${c.bold}TCode ❯ ${c.reset}`
        });
        rl.prompt();
        rl.on('line', async (line) => {
            const input = line.trim();
            if (!input) {
                rl.prompt();
                return;
            }
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
                console.log(`${c.green}✓ Memori direset.${c.reset}\n`);
                rl.prompt();
                return;
            }
            if (input.toLowerCase().startsWith('/model')) {
                const parts = input.split(' ');
                const targetModel = parts[1];
                if (!targetModel) {
                    console.log(`${c.dim}Model tersedia:${c.reset}`);
                    for (const key of Object.keys(config.models)) {
                        const mark = key === config.active_model ? '*' : ' ';
                        console.log(` ${c.cyan}${mark} ${key}${c.reset} (${config.models[key].provider} - ${config.models[key].model_id})`);
                    }
                    console.log(`\nKetik ${c.yellow}/model <nama_model>${c.reset} untuk mengganti.\n`);
                    rl.prompt();
                    return;
                }
                if (config.models[targetModel]) {
                    config.active_model = targetModel;
                    activeModelConfig = config.models[targetModel];
                    model = (0, llm_1.getLLMProvider)(activeModelConfig);
                    // Save config implicitly to persist
                    Promise.resolve().then(() => __importStar(require('fs'))).then(fs => {
                        Promise.resolve().then(() => __importStar(require('path'))).then(path => {
                            const configPath = options.config || path.join(process.cwd(), 'tcode.config.json');
                            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
                        });
                    });
                    console.log(`${c.green}✓ Berhasil ganti model ke: ${c.cyan}${targetModel}${c.reset}\n`);
                }
                else {
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
                    console.log(`${c.green}✓ Percakapan diringkas. Sekarang ${messages.length} pesan.${c.reset}\n`);
                }
                else {
                    console.log(`${c.dim}Belum perlu diringkas (${messages.length} pesan).${c.reset}\n`);
                }
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
            if (input.toLowerCase() === '/think') {
                config.show_thinking = config.show_thinking === false ? true : false;
                Promise.resolve().then(() => __importStar(require('fs'))).then(fs => {
                    Promise.resolve().then(() => __importStar(require('path'))).then(path => {
                        const configPath = options.config || path.join(process.cwd(), 'tcode.config.json');
                        if (fs.existsSync(configPath)) {
                            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
                        }
                    });
                });
                console.log(`${c.green}✓ Mode Thinking: ${config.show_thinking ? 'ON (Ditampilkan)' : 'OFF (Disembunyikan)'}${c.reset}\n`);
                rl.prompt();
                return;
            }
            messages.push({ role: 'user', content: input });
            const spinner = new Spinner();
            const startTime = Date.now();
            try {
                if (activeModelConfig.provider === 'ollama') {
                    // ── Ollama: non-streaming (tool support workaround) ──
                    spinner.start('Memproses...');
                    const result = await (0, ai_1.generateText)({
                        model,
                        messages: messages,
                        temperature: activeModelConfig.temperature,
                        maxTokens: activeModelConfig.max_tokens,
                        tools: tools_1.agentTools,
                        maxSteps: 5,
                        onStepFinish: (step) => {
                            if (step.toolCalls && step.toolCalls.length > 0) {
                                for (const call of step.toolCalls) {
                                    let details = call.toolName;
                                    const args = call.args;
                                    if (args.command)
                                        details = args.command.length > 30 ? args.command.slice(0, 30) + '...' : args.command;
                                    else if (args.filepath)
                                        details = args.filepath;
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
                    }
                    else {
                        outText = outText.replace(/<think>([\s\S]*?)<\/think>/g, `${c.dim}<think>$1</think>${c.reset}`);
                    }
                    console.log(`\n${outText}\n`);
                    const responseMessages = await result.response?.messages;
                    if (responseMessages && responseMessages.length > 0) {
                        messages.push(...responseMessages);
                    }
                    else {
                        messages.push({ role: 'assistant', content: result.text });
                    }
                    const usage = result.usage;
                    if (usage?.totalTokens && !isNaN(usage.totalTokens)) {
                        totalTokensUsed += usage.totalTokens;
                    }
                    await printStats(usage, Date.now() - startTime, messages.length, wasCompressed);
                }
                else {
                    // ── Cloud models: streaming ──
                    spinner.start('Menghubungi AI...');
                    const result = await (0, ai_1.streamText)({
                        model,
                        messages: messages,
                        temperature: activeModelConfig.temperature,
                        maxTokens: activeModelConfig.max_tokens,
                        tools: tools_1.agentTools,
                        maxSteps: 5,
                    });
                    let fullResponse = '';
                    let firstChunk = true;
                    let inThink = false;
                    for await (const part of result.fullStream) {
                        if (part.type === 'text-delta') {
                            if (firstChunk) {
                                spinner.stop();
                                console.log();
                                firstChunk = false;
                            }
                            let text = part.textDelta;
                            fullResponse += text;
                            if (config.show_thinking !== false) {
                                let parts = text.split(/(<think>|<\/think>)/);
                                for (const p of parts) {
                                    if (p === '<think>') {
                                        inThink = true;
                                        process.stdout.write(c.dim + '<think>');
                                    }
                                    else if (p === '</think>') {
                                        inThink = false;
                                        process.stdout.write('</think>' + c.reset);
                                    }
                                    else {
                                        process.stdout.write(p);
                                    }
                                }
                            }
                            else {
                                let parts = text.split(/(<think>|<\/think>)/);
                                for (const p of parts) {
                                    if (p === '<think>') {
                                        inThink = true;
                                        spinner.start('AI Sedang Berpikir...');
                                    }
                                    else if (p === '</think>') {
                                        inThink = false;
                                        spinner.stop();
                                    }
                                    else if (!inThink) {
                                        process.stdout.write(p);
                                    }
                                }
                            }
                        }
                        else if (part.type === 'tool-call') {
                            let details = part.toolName;
                            const args = part.args;
                            if (args.command)
                                details = args.command.length > 30 ? args.command.slice(0, 30) + '...' : args.command;
                            else if (args.filepath)
                                details = args.filepath;
                            spinner.start(`⚙️ Menjalankan: ${details}`);
                            firstChunk = true;
                        }
                        else if (part.type === 'tool-result') {
                            spinner.start('Menganalisis hasil...');
                            firstChunk = true;
                        }
                    }
                    spinner.stop();
                    spinner.stop();
                    const responseMessages = await result.responseMessages;
                    const visibleText = fullResponse.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();
                    if (visibleText === '') {
                        const hasTools = responseMessages.some((m) => m.role === 'tool' || (m.role === 'assistant' && m.content && Array.isArray(m.content) && m.content.some((c) => c.type === 'tool-call')));
                        if (hasTools) {
                            console.log(`${c.green}✅ Aksi selesai dieksekusi.${c.reset}\n`);
                        }
                        else {
                            console.log(`${c.dim}(AI selesai berpikir namun tidak mengeluarkan teks jawaban)${c.reset}\n`);
                        }
                    }
                    else {
                        console.log('\n');
                    }
                    if (responseMessages && responseMessages.length > 0) {
                        messages.push(...responseMessages);
                    }
                    else {
                        messages.push({ role: 'assistant', content: fullResponse });
                    }
                    try {
                        const usage = await result.usage;
                        if (usage?.totalTokens && !isNaN(usage.totalTokens)) {
                            totalTokensUsed += usage.totalTokens;
                        }
                        await printStats(usage, Date.now() - startTime, messages.length, wasCompressed);
                    }
                    catch {
                        // Provider doesn't return usage — show stats without token count
                        await printStats(null, Date.now() - startTime, messages.length, wasCompressed);
                    }
                }
            }
            catch (error) {
                spinner.stop();
                console.error(`\n${c.red}Error: ${error instanceof Error ? error.message : error}${c.reset}\n`);
                messages.pop(); // Remove failed user message
            }
            rl.prompt();
        }).on('close', () => {
            (0, stickybar_1.stopStickyBar)();
            console.log(`\n${c.cyan}Sampai jumpa! 👋${c.reset}`);
            process.exit(0);
        });
        (0, stickybar_1.startStickyBar)();
        rl.on('SIGINT', () => {
            (0, stickybar_1.stopStickyBar)();
            process.exit(0);
        });
    }
    catch (error) {
        console.error(`\n${c.red}Error: ${error instanceof Error ? error.message : error}${c.reset}`);
        process.exit(1);
    }
});
program.parse(process.argv);
