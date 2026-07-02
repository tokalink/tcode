# Product Requirements Document (PRD): TCode

## 1. Pendahuluan
**Nama Produk:** TCode (Terminal Code AI)
**Deskripsi Singkat:** CLI-based AI coding assistant yang dirancang untuk memberikan fleksibilitas maksimal dalam pengembangan perangkat lunak. TCode memungkinkan pengembang untuk berinteraksi dengan AI secara langsung dari terminal mereka dengan kontrol penuh atas model AI, prompt, dan batasan akses sistem.
**Latar Belakang:** Tool seperti Claude CLI, Qwen Code, GitHub Copilot CLI, atau Aider sangat powerful, namun terkadang kurang fleksibel dalam hal pemilihan model kustom (terutama model lokal), kustomisasi instruksi sistem, atau batasan akses file. TCode hadir untuk mengisi celah ini dengan memberikan kontrol penuh kepada pengguna untuk memanfaatkan model AI pilihan mereka secara optimal dalam alur kerja harian.

## 2. Objektif & Tujuan
- Membangun AI CLI tool yang **LLM-Agnostic** (mendukung OpenAI, Anthropic, Gemini, Qwen, hingga LLM lokal via Ollama/LM Studio).
- Memberikan agen AI kemampuan untuk membaca, menulis, dan mengeksekusi kode secara otonom di environment lokal dengan sistem *permission* yang transparan dan aman.
- Mengoptimalkan alur kerja developer (pair programming) agar lebih cepat tanpa harus berpindah fokus dari terminal.

## 3. Analisis Kompetitor
- **Claude CLI / Qwen Code:** Pintar dan terintegrasi baik, namun sangat terikat pada ekosistem API/Model mereka sendiri (vendor lock-in).
- **Aider:** Fokus pada git-commit dan pengeditan file, sangat bagus tetapi arsitektur internalnya terkadang kaku jika pengguna ingin mengubah cara agen berpikir.
- **Nilai Jual TCode (USP):** Modularitas dan Fleksibilitas. Pengguna bebas mengganti "otak" (model LLM), mengkustomisasi "tangan" (tools eksekusi), dan mengatur "mata" (pencarian konteks) sesuai kebutuhan spesifik sebuah proyek.

## 4. Fitur Utama (Core Features)

### 4.1. Multi-Model & Bring Your Own Key (BYOK)
- Mendukung API standar (OpenAI-compatible) sehingga otomatis mendukung ratusan model cloud maupun lokal (Ollama, vLLM, LM Studio).
- Konfigurasi terpusat menggunakan format JSON (`tcode.config.json`). Format JSON dipilih agar lebih terstruktur dan mudah dikelola ketika menggunakan banyak model sekaligus. Pengguna dapat dengan rapi menetapkan parameter spesifik (seperti `temperature`, `max_tokens`, `base_url`, `api_key`) untuk masing-masing model dalam satu file.

### 4.2. Context & Workspace Awareness
- **File System Tools:** AI dapat membaca isi file (`read_file`), melihat sebagian file (`view_chunk`), atau melihat struktur folder (`list_dir`).
- **Semantic/Grep Search:** AI dapat mencari keyword, fungsi, atau class tertentu dalam basis kode sebelum melakukan perubahan.

### 4.3. Code Editing & Modification
- **Smart Diffing:** AI tidak menulis ulang seluruh file (menghemat token dan waktu). AI akan menggunakan format *search/replace* atau *unified diff* untuk menyisipkan/mengubah blok kode tertentu.
- **Auto-Linter/Formatter Hook:** Menjalankan linter/formatter (misal: Prettier, Black, ESLint) secara otomatis setelah file dimodifikasi oleh AI.

### 4.4. Terminal & Command Execution
- AI dapat merencanakan dan mengusulkan perintah shell (misal: menjalankan unit test, build project, instalasi dependensi).
- **Human-in-the-loop (HitL):** Keamanan berlapis. Setiap perintah eksekusi terminal atau modifikasi file kritis harus disetujui pengguna (Ketik `Y` untuk jalan, `n` untuk tolak).

### 4.5. Kustomisasi Agen (Custom Roles)
- Dukungan file konfigurasi persona. Contoh: Menjalankan `tcode --role devops` akan memuat *system prompt* khusus infrastruktur, sedangkan `tcode --role frontend` akan memuat aturan React/Tailwind.

## 5. Kebutuhan Sistem (System Requirements)

### Functional Requirements
1. Interface interaktif berbasis terminal (TUI - Terminal User Interface).
2. Mendukung *Streaming Response* agar output dari AI muncul secara *real-time* seperti sedang mengetik.
3. Mendukung fitur *Function Calling* / *Tool Use* yang di-mapping ke fungsi OS lokal.
4. Fitur *History Management*: Menyimpan riwayat percakapan per proyek/sesi agar bisa dilanjutkan kapan saja.

### Non-Functional Requirements
1. **Performa:** Waktu *startup* aplikasi CLI harus instan (di bawah 500ms).
2. **Efisiensi Token:** Algoritma pemotongan konteks (context trimming) untuk mencegah melebihi limit token AI saat bekerja dengan repositori besar.
3. **Cross-Platform:** Berjalan dengan mulus di Windows, macOS, dan Linux.

## 6. Arsitektur & Pilihan Teknologi (Rekomendasi)
Untuk membangun ekosistem *agentic coding* yang kuat, fleksibel, dan mudah berinteraksi dengan basis kode, **Node.js (TypeScript)** adalah pilihan yang paling direkomendasikan dan *powerful*.

- **Alasan Memilih Node.js (TypeScript):**
  - **JSON & Function Calling:** JavaScript secara *native* sangat kuat dalam memproses JSON. Ini sangat krusial karena komunikasi dengan LLM, terutama fitur *Tool Use / Function Calling*, sangat bergantung pada *JSON Schema* dan manipulasi objek.
  - **Ekosistem Code Parsing:** Node.js memiliki dukungan NPM yang masif untuk mem-parsing AST (Abstract Syntax Tree) berbagai bahasa (seperti `typescript compiler API`, `babel`, `prettier` bindings). Ini memungkinkan TCode untuk membaca dan memodifikasi struktur kode (bukan sekadar baris teks) dengan sangat akurat.
  - **Asynchronous Workflow:** Sangat tangguh dalam menangani proses asinkron yang masif seperti membaca banyak file, melakukan stream API, dan menjalankan *subprocess* terminal secara paralel tanpa blocking.
- **Library yang Disarankan:**
  - **CLI Framework:** `Commander.js` atau `Oclif`.
  - **Terminal UI (TUI):** `Ink` (Membangun tampilan CLI interaktif menggunakan komponen React, sangat cocok untuk rendering diff kode dan loading stat yang indah).
  - **AI SDK:** `Vercel AI SDK` atau `LangChain.js` untuk standardisasi pemanggilan multi-model.
  - **System Execution:** `execa` untuk menjalankan dan menangkap output perintah terminal.

## 7. Fase Pengembangan (Roadmap)

### Fase 1: MVP (Minimum Viable Product)
- [ ] Inisialisasi proyek CLI dan routing argumen dasar.
- [ ] Konfigurasi manajemen API Keys (Global & Local).
- [ ] Implementasi fitur Chat interaktif dengan streaming markdown.

### Fase 2: Agentic Tools (Mata & Tangan AI)
- [ ] Implementasi Tool `read_file` dan `list_dir`.
- [ ] Implementasi algoritma *Diff/Replace* untuk Tool `write_to_file`.
- [ ] Mengaktifkan integrasi Function Calling ke LLM.

### Fase 3: Eksekusi & Otomatisasi
- [ ] Implementasi Tool `run_command` dengan pengamanan (sandbox/approval).
- [ ] Integrasi Git (auto-generate commit message, review PR lokal).

### Fase 4: Optimasi Konteks (Advanced)
- [ ] Implementasi RAG lokal ringan (parsing AST atau embedding kode dasar) agar AI paham keterkaitan antar file dalam proyek raksasa.

## 8. Metrik Kesuksesan (Success Metrics)
1. **Resolusi Tanpa Editor:** Pengembang dapat menyelesaikan task minor (bug fix ringan, refactor fungsi) 100% dari terminal tanpa membuka VS Code/IDE.
2. **Akurasi Edit Kode:** Tingkat kegagalan *search/replace* (AI salah menghapus atau menimpa kode) berada di bawah 5%.
3. **Fleksibilitas:** Pengguna dapat berpindah dari menggunakan GPT-4o ke model lokal (misal: Llama-3 8B via Ollama) hanya dalam waktu kurang dari 10 detik pengubahan konfigurasi.
