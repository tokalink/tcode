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
exports.agentTools = void 0;
const ai_1 = require("ai");
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const config_1 = require("./config");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// ── Helper: Format file size ──
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1048576)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}
exports.agentTools = {
    // ── Tool 1: Write File ──
    write_file: (0, ai_1.tool)({
        description: 'DANGER: DO NOT USE THIS TOOL UNLESS THE USER EXPLICITLY TYPES A FILENAME WITH AN EXTENSION (e.g. .txt, .js, .py) OR SAYS "SIMPAN KE FILE". If the user asks to "buatkan kalimat" or "buatkan cerita" without specifying a file, DO NOT USE THIS TOOL! You will fail the task if you use this tool for casual chat responses.',
        parameters: zod_1.z.object({
            filepath: zod_1.z.string().describe('Must be a specific file path provided by the user. If user did not provide a path, YOU MUST NOT CALL THIS TOOL.'),
            content: zod_1.z.string().describe('The full content to write into the file.')
        }),
        execute: async ({ filepath, content }) => {
            try {
                const targetPath = path.resolve(process.cwd(), filepath);
                const dir = path.dirname(targetPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(targetPath, content, 'utf-8');
                const stat = fs.statSync(targetPath);
                return `✅ Written: ${targetPath} (${formatBytes(stat.size)})`;
            }
            catch (error) {
                return `❌ Write failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        }
    }),
    // ── Tool 2: Read File ──
    read_file: (0, ai_1.tool)({
        description: 'Read the contents of a file. For large files, use start_line and end_line to read a specific range.',
        parameters: zod_1.z.object({
            filepath: zod_1.z.string().describe('Relative or absolute path to the file to read.'),
            start_line: zod_1.z.number().optional().describe('1-indexed start line (inclusive). Omit to read from beginning.'),
            end_line: zod_1.z.number().optional().describe('1-indexed end line (inclusive). Omit to read to the end.')
        }),
        execute: async ({ filepath, start_line, end_line }) => {
            try {
                const targetPath = path.resolve(process.cwd(), filepath);
                if (!fs.existsSync(targetPath)) {
                    return `❌ File not found: ${targetPath}`;
                }
                const stat = fs.statSync(targetPath);
                if (stat.isDirectory()) {
                    return `❌ Path is a directory, not a file: ${targetPath}`;
                }
                const content = fs.readFileSync(targetPath, 'utf-8');
                const lines = content.split('\n');
                const totalLines = lines.length;
                const start = Math.max(1, start_line || 1);
                const end = Math.min(totalLines, end_line || totalLines);
                // Cap at 200 lines to prevent huge token usage
                const maxLines = 200;
                const actualEnd = Math.min(end, start + maxLines - 1);
                const slice = lines.slice(start - 1, actualEnd);
                let result = `📄 ${path.basename(targetPath)} (${totalLines} lines, ${formatBytes(stat.size)})\n`;
                result += `Showing lines ${start}-${actualEnd}:\n`;
                result += slice.map((l, i) => `${start + i}: ${l}`).join('\n');
                if (actualEnd < totalLines) {
                    result += `\n... (${totalLines - actualEnd} more lines)`;
                }
                return result;
            }
            catch (error) {
                return `❌ Read failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        }
    }),
    // ── Tool 3: List Directory ──
    list_dir: (0, ai_1.tool)({
        description: 'List files and directories in a given path. Shows file sizes and types.',
        parameters: zod_1.z.object({
            dirpath: zod_1.z.string().describe('Relative or absolute path to the directory to list. Use "." for current directory.'),
            recursive: zod_1.z.boolean().optional().describe('If true, list recursively (max 3 levels deep). Default: false.')
        }),
        execute: async ({ dirpath, recursive }) => {
            try {
                const targetPath = path.resolve(process.cwd(), dirpath);
                if (!fs.existsSync(targetPath)) {
                    return `❌ Directory not found: ${targetPath}`;
                }
                const entries = [];
                const maxEntries = 80;
                function listLevel(dir, depth, prefix) {
                    if (entries.length >= maxEntries)
                        return;
                    const items = fs.readdirSync(dir).filter(n => !n.startsWith('.') && n !== 'node_modules');
                    items.sort();
                    for (const item of items) {
                        if (entries.length >= maxEntries) {
                            entries.push(`${prefix}... (truncated)`);
                            return;
                        }
                        const fullPath = path.join(dir, item);
                        try {
                            const stat = fs.statSync(fullPath);
                            if (stat.isDirectory()) {
                                entries.push(`${prefix}📁 ${item}/`);
                                if (recursive && depth < 3) {
                                    listLevel(fullPath, depth + 1, prefix + '  ');
                                }
                            }
                            else {
                                entries.push(`${prefix}📄 ${item} (${formatBytes(stat.size)})`);
                            }
                        }
                        catch { /* skip inaccessible */ }
                    }
                }
                listLevel(targetPath, 0, '');
                return `📁 ${targetPath}\n${entries.join('\n')}`;
            }
            catch (error) {
                return `❌ List failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        }
    }),
    // ── Tool 4: Run Command ──
    run_command: (0, ai_1.tool)({
        description: 'Execute a shell command and return its output. Use for: running tests, checking versions, git operations, installing packages, etc. Commands run in the project root directory.',
        parameters: zod_1.z.object({
            command: zod_1.z.string().describe('The shell command to execute.')
        }),
        execute: async ({ command }) => {
            try {
                const { stdout, stderr } = await execAsync(command, {
                    cwd: process.cwd(),
                    encoding: 'utf-8',
                    timeout: 30000,
                    maxBuffer: 1024 * 512,
                });
                const output = stdout || stderr || '';
                const trimmed = output.length > 2000 ? output.slice(0, 2000) + '\n... (output truncated)' : output;
                return `✅ Command: ${command}\n${trimmed}`;
            }
            catch (error) {
                const stderr = error.stderr ? error.stderr.toString().slice(0, 1000) : '';
                const stdout = error.stdout ? error.stdout.toString().slice(0, 1000) : '';
                return `❌ Command failed: ${command}\n${stderr || stdout || error.message}`;
            }
        }
    }),
    // ── Tool 5: Save Knowledge ──
    save_knowledge: (0, ai_1.tool)({
        description: 'Gunakan ini untuk menyimpan ringkasan hasil belajarmu ke dalam Knowledge Base (Otak AI) agar kamu bisa mengingatnya di sesi obrolan berikutnya. Otomatis tersimpan ke .tcode/knowledge/',
        parameters: zod_1.z.object({
            topic: zod_1.z.string().describe('Nama topik singkat tanpa ekstensi file. Contoh: laravel-13, setup-react, error-typescript'),
            content: zod_1.z.string().describe('Isi catatan atau pengetahuan yang berhasil dipelajari, diformat rapi dengan Markdown.')
        }),
        execute: async ({ topic, content }) => {
            try {
                const config = (0, config_1.loadConfig)();
                const baseDir = config.knowledge_path
                    ? path.resolve(process.cwd(), config.knowledge_path)
                    : path.join(process.cwd(), '.tcode', 'knowledge');
                if (!fs.existsSync(baseDir)) {
                    fs.mkdirSync(baseDir, { recursive: true });
                }
                // Bersihkan nama topik dari karakter aneh
                const safeTopic = topic.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
                const filePath = path.join(baseDir, `${safeTopic}.md`);
                fs.writeFileSync(filePath, content, 'utf-8');
                return `✅ Pengetahuan berhasil disimpan ke Otak (Knowledge Base) di ${filePath}. Saya tidak akan melupakannya!`;
            }
            catch (error) {
                return `❌ Gagal menyimpan pengetahuan: ${error.message}`;
            }
        }
    }),
};
