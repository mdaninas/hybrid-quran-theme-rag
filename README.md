# Thematic Qur'an Hybrid RAG

Sistem tanya jawab tematik Al-Qur'an yang menggabungkan pencarian embedding Pinecone,
penelusuran Neo4j, dan jawaban bersitasi. Frontend menampilkan percakapan, peta hubungan,
serta teks Arab dan terjemahan ayat sumber. Proyek skripsi Universitas Islam Riau.

## Alur aplikasi

1. LLM meringkas pertanyaan menjadi kata kunci, termasuk negasi yang relevan.
2. Pinecone mengembalikan hingga lima jalur tematik; metadata rusak dan duplikat disaring.
3. Sistem menyiapkan penelusuran jalur tema.
4. Neo4j dibaca memakai parameter, kedalaman jalur yang tepat, dan daftar ID ayat dari
   dataset lokal. Ayat dideduplikasi dan dipilih bergiliran antartema, dengan batas konteks.
5. LLM menyusun jawaban; ID sitasi diperiksa terhadap sumber. Jika tidak ada sumber,
   LLM penjawab tidak dipanggil. Jika sitasi tidak valid, jawaban diganti pesan cadangan.

Backend mengirim langkah, ayat, dan data simpul/relasi melalui WebSocket. Browser
menggambar data itu dengan vis-network. **Kredensial Neo4j tidak pernah dikirim ke browser.**
Peta dan jawaban memakai kumpulan ayat yang sama. Setiap jawaban menyimpan sumbernya sendiri.

Validasi sitasi memeriksa ID dan label tautan; ini belum membuktikan ketepatan tafsir atau
bahwa setiap klaim benar-benar didukung ayat. Tetap periksa sumber sebelum mengutip.

## Persyaratan

- Python **3.12** untuk lockfile yang disediakan; Node **24 LTS** untuk frontend dan tes.
- Neo4j, indeks Pinecone yang telah diisi, dan API key OpenAI untuk pencarian nyata.
- Berkas `quranrag/process/tematik_.json` dan `process/READY/NODE_AYAT.json` harus ikut
  tersedia saat runtime; katalog tersebut memisahkan cabang dengan nama tema yang sama.

## Instalasi

Jalankan dari root repositori. Contoh PowerShell dengan uv:

```powershell
uv venv .venv --python 3.12
uv pip sync --python .venv/Scripts/python.exe quranrag/requirements-dev.lock
Copy-Item quranrag/env.example quranrag/.env
npm --prefix quranragfrontend ci
```

Alternatif tanpa uv: buat virtual environment memakai Python 3.12, lalu jalankan
`python -m pip install -r quranrag/requirements-dev.lock`. Untuk runtime tanpa alat tes,
gunakan `quranrag/requirements.lock`. Pada Linux/macOS, interpreter venv ada di `.venv/bin/python`.
Jangan menimpa `.env` yang sudah terisi saat mengulang instalasi.

Isi enam variabel wajib pada `.env`: `NEO4J_LOKAL_URI`, `NEO4J_LOKAL_USER`,
`NEO4J_LOKAL_PASSWORD`, `OPENAI_API_KEY`, `PINECONE_API_KEY`, dan `INDEX_NAME1`.
`EMBEDDING_MODEL` harus sama dengan model saat membuat indeks; kesamaan dimensi saja
tidak menjamin ruang embedding yang sama. Default tetap `text-embedding-ada-002`.

Frontend tidak membutuhkan `.env` untuk pengembangan lokal. `VITE_WS_URL` hanya diperlukan
jika endpoint WebSocket berbeda. Semua nilai `VITE_*` bersifat publik.

## Menjalankan

Terminal pertama, dari root repositori:

```powershell
./.venv/Scripts/python.exe -m uvicorn websocketapi:api --app-dir quranrag --host 127.0.0.1 --port 8000 --ws-max-size 16384
```

Terminal kedua:

```powershell
npm --prefix quranragfrontend run dev
```

Buka [aplikasi lokal](http://127.0.0.1:5173). Vite menggunakan port tetap 5173 dan proxy
`/ws` ke backend. Mode tamu atau nama panggilan adalah **profil lokal, bukan autentikasi**.
Riwayat dibatasi 40 pesan pada sesi tab; opsi ingat nama hanya menyimpan profil.
Pertanyaan dan konteks dikirim ke layanan eksternal untuk embedding dan pembuatan jawaban.

Mode terminal:

```powershell
./.venv/Scripts/python.exe quranrag/multi_agent.py
```

`GET /health` mengembalikan `configured` atau HTTP 503 `not_configured`, beserta nama
variabel yang belum diisi. Endpoint ini **tidak menguji konektivitas layanan eksternal**.
Backend dapat dijalankan tanpa API key untuk memeriksa antarmuka dan penanganan kegagalan.

## Batas dan penanganan kegagalan

| Batas default | Nilai |
| --- | --- |
| Panjang pertanyaan | 2.000 karakter |
| Frame aplikasi | 16 KiB; gunakan juga `--ws-max-size 16384` |
| Durasi permintaan | 120 detik, dapat diturunkan lewat `.env` |
| Permintaan aktif | 4 per proses |
| Pertanyaan per IP | 12 per menit per proses |
| Jalur tematik | 5 |
| Ayat per jalur | 25, urut nomor surah lalu ayat |
| Konteks akhir | 60 ayat unik / 30.000 karakter JSON |

Hentikan membatalkan tugas server; koneksi putus juga membatalkan tugas aktif.
Frontend mencoba menyambungkan ulang dengan jeda meningkat hingga 15 detik. Pengiriman
ulang dilakukan lewat tombol **Coba lagi** agar pertanyaan berbiaya tidak diulang diam-diam.
Timeout frontend 150 detik menjadi batas cadangan bila server tidak merespons.

## Dataset dan ingestion

Korpus berisi 114 surah, 6.236 ayat, dan 2.809 jalur tematik. Audit menemukan 8 referensi
tematik yang tidak tersedia serta 44 nama tema akhir ambigu dengan daftar ayat berbeda.
Rincian lokasi tersedia dalam [laporan kualitas data](docs/data-quality.json).
Runtime menyaring referensi tidak valid dan membatasi ayat sesuai jalur lengkap pada katalog.
Nomor pengganti tidak ditebak; koreksi sumber membutuhkan pemeriksaan manusia.

Validasi offline, tanpa `.env` atau Neo4j:

```powershell
python quranrag/process/validate_data.py --output output/data-quality.json
powershell.exe -NoProfile -ExecutionPolicy Bypass -File quranrag/process/ingest_neo4j_safe.ps1 -ValidateOnly
```

Tambahkan `--strict` ke validator Python agar anomali menghasilkan exit code 1. Dengan
dataset saat ini, mode strict memang gagal karena 8 referensi tersebut.

Ingestion nyata membutuhkan akun dengan izin tulis dan Neo4j HTTP API pada port 7474:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File quranrag/process/ingest_neo4j_safe.ps1
```

Skrip memakai `MERGE` dan dapat dijalankan ulang. Notebook lama adalah arsip persiapan data;
beberapa sel menghapus data, sehingga jangan menjalankannya sekaligus. Dependensi notebook
tidak menjadi bagian dari lockfile runtime yang telah dirampingkan.

## Pengujian dan audit dependensi

```powershell
python -m pytest -q
npm --prefix quranragfrontend run lint
npm --prefix quranragfrontend test
npm --prefix quranragfrontend run build
npm --prefix quranragfrontend audit --audit-level=moderate
python -m pip_audit --progress-spinner off
```

Tes memakai pengganti layanan eksternal; tidak membutuhkan key atau memanggil LLM berbayar.
CI menjalankan tes, lint, build, audit dependensi, dan laporan dataset pada push/pull request.
Validator data di CI berjalan dalam mode laporan karena anomali sumber sudah diketahui.

Lockfile Python dikompilasi untuk Python 3.12. Perbarui secara sengaja dan ulangi tes:

```powershell
uv pip compile quranrag/requirement.txt --python-version 3.12 -o quranrag/requirements.lock --no-annotate
uv pip compile quranrag/requirements-dev.txt --python-version 3.12 -o quranrag/requirements-dev.lock --no-annotate
```

## Mengukur kualitas retrieval

`quranrag/evaluate.py` membandingkan prediksi tersimpan dengan JSONL acuan yang telah
ditinjau manusia. Format satu baris kasus:

```json
{"id":"kasus-001","question":"Pertanyaan yang ditinjau","expected_verse_ids":["2:153"]}
```

Format satu baris prediksi, mempertahankan urutan retrieval:

```json
{"id":"kasus-001","retrieved_verse_ids":["2:153","2:155"]}
```

Contoh ini hanya format, bukan benchmark tervalidasi. Gunakan daftar acuan kosong untuk
kasus yang tidak dapat dijawab dari korpus. ID kasus harus sama persis pada kedua berkas.

```powershell
python quranrag/evaluate.py --cases output/cases.jsonl --predictions output/predictions.jsonl --k 5 --output output/evaluation.json
```

Hasil: recall@k, precision@k (jumlah benar dibagi k), MRR@k (kebalikan peringkat hasil benar
pertama), serta akurasi tidak mengambil ayat pada kasus tanpa jawaban. Duplikat dihapus
tanpa mengubah urutan. Evaluator ini mengukur retrieval, bukan kebenaran jawaban LLM.

## Deployment

Demo ini belum mempunyai login server atau kuota per pengguna. Origin check membatasi
browser, tetapi klien HTTP dapat mengirim Origin sendiri. Sebelum publikasi, tambahkan
autentikasi, HTTPS/WSS, reverse proxy, batas koneksi/frame dan kuota terpusat. Rate limiter
sekarang berbasis memori per proses dan alamat klien dari ASGI; konfigurasi trusted proxy
dibutuhkan bila aplikasi berada di belakang proxy. Gunakan akun Neo4j baca saja untuk runtime.
Query berparameter dan routing baca tidak menggantikan izin database.

Build frontend diasumsikan disajikan bersama proxy `/ws/ask`. Origin publik harus masuk
`ALLOWED_ORIGINS`; jika backend terpisah, isi `VITE_WS_URL` sebelum build.

### Migrasi versi lama

- `/graph-config`, `GRAPH_CONFIG_TOKEN`, `VITE_API_BASE`, serta koneksi Bolt browser dihapus.
- `GRAPH_CONFIG_ORIGINS` sementara diterima sebagai fallback untuk `ALLOWED_ORIGINS`.
- Frontend/backend harus diperbarui bersama karena payload sekarang memakai `graphs` dan
  `sources`, bukan Cypher. Riwayat versi lama dan cache kredensial sesi lama dibersihkan.
- Perubahan ini tidak mengubah atau meng-ingest database. Jika kredensial pernah terekspos
  lewat versi lama yang dapat diakses publik, ganti kredensial tersebut.

## Struktur

```text
quranrag/
  config.py                  konfigurasi dan batas
  websocketapi.py            transport, validasi, pembatalan, rate limit
  multi_agent.py             pipeline LangGraph lima langkah
  module/catalog.py          katalog jalur → ID ayat yang valid
  module/retrieval.py         deduplikasi, konteks, graf, validasi sitasi
  module/skill/              embedding, Neo4j, rewriting, reasoning
  process/                   sumber data, ingestion, validasi offline
  tests/                     tes regresi tanpa layanan eksternal
  evaluate.py                evaluasi retrieval offline
quranragfrontend/src/
  components/                profil demo, chat, peta, sumber ayat
  session.js                 validasi dan penyimpanan sesi
docs/                        audit implementasi dan kualitas data
```

## Penulis

Muhammad Dani Nasution · Teknik Informatika, Universitas Islam Riau ·
[@mdaninas](https://github.com/mdaninas)
