# TCode - Terminal AI Coding Assistant ⚡

TCode adalah asisten coding berbasis Terminal/CLI yang ditenagai AI. Dengan antarmuka yang bersih dan interaktif layaknya REPL, TCode dirancang khusus untuk mempermudah Anda dalam menulis kode, mengeksekusi *shell commands*, dan mengotomatiskan pengelolaan file secara efisien.

## 🚀 Fitur Utama

- **Integrasi Model Universal**: Mendukung berbagai provider AI ternama seperti Ollama (Local), OpenAI, Anthropic (Claude), dan Google (Gemini) berkat Vercel AI SDK.
- **Smart Tools**: AI dibekali alat (*tools*) untuk membaca/menulis file, melihat direktori, dan menjalankan perintah *shell* secara langsung.
- **Real-Time Sticky Bar Status**: Panel status permanen ala Tmux di bawah layar yang menampilkan beban CPU, kapasitas RAM, dan token secara real-time tanpa mengotori riwayat *chat*.
- **Auto-Compression Memory**: Menekan lonjakan biaya token dengan cara meringkas obrolan lama menjadi ringkasan yang padat, sambil mempertahankan konteks obrolan terbaru.
- **Clean Tool Execution**: Log eksekusi dan proses AI "berpikir" dikemas rapi dalam bentuk animasi *spinner* yang otomatis hilang tanpa membuat terminal penuh dengan tulisan acak.

---

## 🛠️ Instalasi & Penggunaan Klien

Anda bisa memasang TCode di komputer mana pun (Windows, Linux, macOS) **hanya dengan satu baris perintah**. 
Syaratnya, pastikan mesin Anda telah terpasang **Node.js, NPM**, dan **Git**.

### Instalasi Global (Langsung dari GitHub)
Salin dan jalankan perintah di bawah pada terminal/CMD Anda:

```bash
npm install -g git+https://github.com/tokalink/tcode.git
```

*Perintah di atas akan secara otomatis mengunduh _source code_, memasang pustaka pendukung, melakukan kompilasi (`tsc`), dan mendaftarkan perintah `tcode` ke seluruh penjuru sistem OS Anda.*

### Mulai Chat dengan AI
Setelah instalasi selesai, cukup ketik perintah ini di folder proyek mana pun:

```bash
tcode chat
```
Sistem akan memandu Anda untuk membuat file konfigurasi jika baru pertama kali menjalankannya.

---

## ⚙️ Konfigurasi (`tcode.config.json`)

TCode membutuhkan sedikit pengaturan model. Saat Anda menjalankan `tcode chat` untuk pertama kalinya, konfigurasi global akan otomatis dibuat di:
* Windows: `C:\Users\<user>\.tcode\tcode.config.json`
* Linux/Mac: `~/.tcode/tcode.config.json`

Anda bebas menambahkan kredensial OpenAI atau Gemini di sana, atau cukup jalankan model Open Source lewat **Ollama** di komputer lokal Anda!

### Daftar Perintah Interaktif (Saat Chat Berjalan)
* `/model <nama>`: Mengganti model AI secara instan.
* `/clear`: Mereset seluruh percakapan dan memori sesi.
* `/compress`: Memaksa AI untuk merangkum obrolan agar hemat token saat itu juga.
* `/think`: Menampilkan (toggle) logika proses berpikir AI mentah di layar.
* `exit` / `quit`: Menutup sesi terminal.
