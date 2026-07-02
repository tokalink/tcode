import { tool } from 'ai';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ── Helper: Format file size ──
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export const agentTools = {

  // ── Tool 1: Write File ──
  write_file: tool({
    description: 'DANGER: DO NOT USE THIS TOOL UNLESS THE USER EXPLICITLY TYPES A FILENAME WITH AN EXTENSION (e.g. .txt, .js, .py) OR SAYS "SIMPAN KE FILE". If the user asks to "buatkan kalimat" or "buatkan cerita" without specifying a file, DO NOT USE THIS TOOL! You will fail the task if you use this tool for casual chat responses.',
    parameters: z.object({
      filepath: z.string().describe('Must be a specific file path provided by the user. If user did not provide a path, YOU MUST NOT CALL THIS TOOL.'),
      content: z.string().describe('The full content to write into the file.')
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
      } catch (error) {
        return `❌ Write failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }
  }),

  // ── Tool 2: Read File ──
  read_file: tool({
    description: 'Read the contents of a file. For large files, use start_line and end_line to read a specific range.',
    parameters: z.object({
      filepath: z.string().describe('Relative or absolute path to the file to read.'),
      start_line: z.number().optional().describe('1-indexed start line (inclusive). Omit to read from beginning.'),
      end_line: z.number().optional().describe('1-indexed end line (inclusive). Omit to read to the end.')
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
      } catch (error) {
        return `❌ Read failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }
  }),

  // ── Tool 3: List Directory ──
  list_dir: tool({
    description: 'List files and directories in a given path. Shows file sizes and types.',
    parameters: z.object({
      dirpath: z.string().describe('Relative or absolute path to the directory to list. Use "." for current directory.'),
      recursive: z.boolean().optional().describe('If true, list recursively (max 3 levels deep). Default: false.')
    }),
    execute: async ({ dirpath, recursive }) => {
      try {
        const targetPath = path.resolve(process.cwd(), dirpath);
        if (!fs.existsSync(targetPath)) {
          return `❌ Directory not found: ${targetPath}`;
        }

        const entries: string[] = [];
        const maxEntries = 80;

        function listLevel(dir: string, depth: number, prefix: string) {
          if (entries.length >= maxEntries) return;
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
              } else {
                entries.push(`${prefix}📄 ${item} (${formatBytes(stat.size)})`);
              }
            } catch { /* skip inaccessible */ }
          }
        }

        listLevel(targetPath, 0, '');
        return `📁 ${targetPath}\n${entries.join('\n')}`;
      } catch (error) {
        return `❌ List failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }
  }),

  // ── Tool 4: Run Command ──
  run_command: tool({
    description: 'Execute a shell command and return its output. Use for: running tests, checking versions, git operations, installing packages, etc. Commands run in the project root directory.',
    parameters: z.object({
      command: z.string().describe('The shell command to execute.')
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
      } catch (error: any) {
        const stderr = error.stderr ? error.stderr.toString().slice(0, 1000) : '';
        const stdout = error.stdout ? error.stdout.toString().slice(0, 1000) : '';
        return `❌ Command failed: ${command}\n${stderr || stdout || error.message}`;
      }
    }
  }),
};
