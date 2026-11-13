# Sistem Dapur Madani & Food Bank Pelajar UiTM

Prototip aplikasi web untuk membantu pelajar UiTM menempah stesen memasak di kolej kediaman dan merekod pengambilan makanan Food Bank. Antara muka menggunakan identiti warna UiTM, menyokong desktop dan telefon, serta boleh diterbitkan melalui GitHub Pages. Aplikasi kini berjalan tanpa sambungan Google Sheets; fail integrasi `Code.gs` dikekalkan sebagai rujukan.

> **Nota prototaip:** Sistem ini tidak menggunakan pengesahan UiTM sebenar. Akaun, tempahan, transaksi dan inventori disimpan dalam `localStorage` pada pelayar/peranti ini sahaja. Kata laluan akaun pelajar disimpan sebagai hash PBKDF2, tetapi ini bukan sistem identiti produksi. Data contoh bukan rekod rasmi UiTM. Jangan masukkan maklumat peribadi sebenar.

## Halaman dan ciri

- **`index.html` — Log masuk pelajar:** Logo UiTM, format nombor matrik 10 digit, pratonton e-mel `@student.uitm.edu.my`, pengesahan borang, mesej ralat, pautan daftar, dan akaun demo.
- **`dashboard.html` — Dashboard:** Jumlah tempahan dapur, baki kuota Food Bank, status pelajar, carta tempahan dapur mingguan menggunakan Chart.js, dan pautan akses pantas.
- **`bookings.html` — Tempahan Dapur Madani (Data View 1):** Tempahan slot satu jam, Stesen A (dapur gas) atau Stesen B (microwave / air fryer), pengesanan slot berganda dan jadual rekod. Tempoh tamat satu jam selepas waktu mula walaupun pelajar tidak hadir.
- **`foodbank.html` — Food Bank (Data View 2):** Simulasi imbasan pengambilan, had tiga unit bagi setiap bulan kalendar, mesej apabila kuota habis, dan jadual sejarah item, kuantiti serta baki.
- **`signup.html` — Pendaftaran pelajar:** Pengesahan nama, IC dan matrik 10 digit; akaun pelajar disimpan pada peranti ini dan boleh terus digunakan untuk log masuk. IC hanya disemak dan tidak disimpan.
- **`admin.html` — Pentadbir:** Log masuk admin demo, pemantauan tempahan dapur mengikut nama pelajar/matrik dan status masa, serta fungsi tambah, edit, dan padam inventori. Data disimpan setempat dan tidak disegerakkan ke Google Sheets.
- **`Code.gs` — Integrasi Google Sheets tersimpan:** Fail dikekalkan dalam folder tetapi tidak dipanggil oleh aplikasi kerana `APPS_SCRIPT_URL` kosong dalam `js/app.js`.
- **Navigasi dan footer seragam:** Menu responsif Bootstrap, logo UiTM, pautan Portal UiTM/iStudent, serta info Kolej Kediaman.
- **`login.html`:** Pautan keserasian yang membawa pengguna ke pintu masuk utama `index.html`.

Tempahan dan rekod Food Bank disimpan berasingan mengikut nombor matrik dalam storan pelayar. Akaun pelajar baharu bermula dengan **3 / 3** kuota dan tiada tempahan sehingga membuat sendiri. Hanya akaun demo `2023123456` mempunyai data contoh (dua tempahan dan satu transaksi Food Bank, maka baki **2 / 3**). Rekod contoh lama (`BK-001`, `BK-002`, `FB-001`) dibersihkan secara automatik untuk akaun bukan demo. Google Apps Script tidak aktif dan tiada data dihantar ke Google Sheets. Kuota dikira mengikut bulan kalendar dan diperbaharui pada bulan baharu.

Tempahan dapur dibahagikan kepada slot satu jam. Halaman admin menyenaraikan tempahan daripada akaun dalam storan pelayar yang sama; status tempoh dikira automatik daripada masa mula dan tidak berhenti apabila pelajar tidak hadir. Oleh sebab aplikasi ini tidak menggunakan server, admin pada peranti/pelayar lain tidak akan melihat rekod tersebut dan status slot bukan bukti kehadiran fizikal.

### Kelayakan demo dan pengujian modul

- Pelajar demo: `2023123456` / `123`
- Admin demo: `admin` / `admin123`
- Pendaftaran pelajar: cipta akaun dengan matrik 10 digit, IC format `020101-10-1234` dan kata laluan sekurang-kurangnya 8 aksara. Kemudian log masuk di `index.html` dengan matrik dan kata laluan baharu. Akaun hanya tersedia pada pelayar/peranti yang sama.
- Admin: log masuk di `admin.html` menggunakan akaun demo, kemudian tambah/kemas kini/padam item. Inventori disimpan dalam pelayar ini dan tidak disegerakkan ke pelajar/peranti lain.
- Kata laluan admin demo adalah awam dalam fail JavaScript dan bukan kawalan akses selamat. Lindungi deployment dan spreadsheet; jangan gunakan modul ini untuk data operasi sebenar.

## Arahan menguji log masuk

1. Buka `index.html` atau terbitkan laman dan buka URL GitHub Pages.
2. Gunakan akaun demo berikut:

   | Medan | Nilai |
   |---|---|
   | No. matrik | `2023123456` |
   | E-mel pelajar (format dipaparkan) | `2023123456@student.uitm.edu.my` |
   | Kata laluan | `123` |

3. Pilih **Log masuk**. Maklumat demo yang sah membuka `dashboard.html`.
4. Cuba nombor matrik yang kurang/lebih daripada 10 digit, medan kosong, kata laluan salah atau nombor matrik lain untuk melihat maklum balas ralat.
5. Di **Tempahan Dapur**, pilih tarikh hari ini atau akan datang, slot dan stesen. Hantaran yang sama untuk tarikh/masa/stesen sama akan ditolak.
6. Di **Food Bank**, baki awal ialah 2/3 kerana data demo mengandungi satu transaksi contoh. Rekod pengambilan dua unit lagi untuk menghabiskan kuota; percubaan seterusnya memaparkan **“Kuota Bulanan Anda Telah Habis!”**.
7. Data demo boleh dipadam untuk menguji semula: buka alat pembangun Chrome → **Application → Local Storage** dan buang kunci `uitmPortal:2023123456:bookings` atau `uitmPortal:2023123456:foodbank`. Log masuk demo menggunakan storan sesi pelayar.

## Rujukan integrasi Google Sheets dan notifikasi e-mel (tidak aktif)

`Code.gs` dan arahan di bawah dikekalkan untuk rujukan sahaja. Aplikasi tidak membuat sambungan kerana `APPS_SCRIPT_URL` dalam `js/app.js` ditetapkan kepada rentetan kosong. Untuk menggunakan integrasi semula, pengguna perlu mengaktifkan Apps Script dan mengisi URL deployment dengan sengaja.

### Sediakan Google Sheet dan Apps Script

1. Cipta atau pilih Google Sheet yang anda kawal. Jangan simpan ID Sheet dalam kod yang diterbitkan secara awam; masukkan ID itu sebagai Script Property `SPREADSHEET_ID`.
2. Buka **Extensions → Apps Script** daripada Sheet (atau cipta projek Apps Script yang berasingan).
3. Salin kod daripada `Code.gs` ke editor Apps Script dan simpan. Helaian **Tempahan Dapur**, **Pengambilan Food Bank**, **Pendaftaran Pelajar**, dan **Inventori Food Bank** serta baris tajuknya akan dibuat secara automatik.
4. Dalam projek Apps Script, buka **Project Settings → Script properties** dan tambah:
   - `ADMIN_EMAIL` — alamat emel pentadbir untuk notifikasi.
   - `SPREADSHEET_ID` — ID Google Sheet yang anda kawal.
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — pilihan; nilai demo lalai masing-masing `admin` dan `admin123`. Jika ditukar, kemas kini juga nilai dalam `js/app.js`. Oleh sebab front-end GitHub Pages awam, kelayakan itu boleh diperiksa pengguna dan bukan kawalan akses produksi.
5. Tetapkan zon waktu projek Apps Script sama dengan zon waktu operasi kampus.
6. Pilih **Deploy → New deployment → Web app**. Pilih **Execute as: Me**. Untuk prototaip tanpa log masuk Google, akses Web App perlu dibuka kepada pengguna yang boleh mengakses halaman; jika akaun Workspace UiTM tersedia, utamakan had akses organisasi UiTM.
7. Sahkan deployment dan salin URL berakhir `/exec` (bukan URL `/dev`).
8. Dalam `js/app.js`, tetapkan `APPS_SCRIPT_URL` kepada URL `/exec` tadi. Commit/publish kemas kini ke GitHub Pages. Setiap perubahan `Code.gs` memerlukan **Deploy → Manage deployments → Edit → New version → Deploy**.
9. Uji pendaftaran, log masuk akaun baharu, inventori admin, tempahan, dan pengambilan; periksa helaian berkaitan serta emel pentadbir. Emel pengesahan tempahan dihantar kepada pelajar dan admin. Pendaftaran memaklumkan admin sahaja; transaksi Food Bank tidak menghantar emel.

Contoh penghantaran JSON ke Web App (implementasi penuh dan pengendalian ralat berada dalam `js/app.js`):

```js
const response = await fetch(APPS_SCRIPT_URL, {
  method: 'POST',
  mode: 'cors',
  redirect: 'follow',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({
    action: 'booking',
    requestId: crypto.randomUUID(),
    matric: '2023123456',
    date: '2026-11-20',
    time: '08:00 – 09:00 pagi',
    station: 'Stesen A — Dapur Gas'
  })
});
const result = await response.json();
if (!result.ok) throw new Error(result.error);
```

### Data dan kawalan server

- Web App menerima `register`, `studentLogin`, `adminLogin`, `inventoryList`, `inventorySave`, `inventoryDelete`, `booking` dan `foodbank` POST dalam format JSON bertajuk `text/plain`. GET `?action=inventory` turut disediakan; kedua-dua kaedah senarai hanya memulangkan katalog tanpa data peribadi.
- Apps Script menyemak medan terhadap senarai slot/stesen dan inventori semasa. E-mel pelajar dijana daripada nombor matrik (`<matrik>@student.uitm.edu.my`); browser tidak boleh memilih penerima admin.
- Kuota Food Bank disahkan semula dalam Apps Script menggunakan `LockService` dan data Sheet untuk mengelakkan dua penghantaran serentak melepasi had bulanan.
- Pengambilan mengurangkan stok inventori server-side di bawah lock yang sama. Item dengan stok kosong tidak boleh direkodkan.
- Kata laluan pelajar disimpan sebagai hash SHA-256 bersalt berulang, bukan teks biasa. IC disimpan dalam helaian pendaftaran dan perlu dilindungi sebagai data peribadi.
- Pengurusan inventori memerlukan kelayakan admin pada setiap mutasi server-side. Oleh sebab UI dan kata laluan demo berada pada hosting awam, perlindungan ini hanya untuk demonstrasi, bukan pengesahan produksi.
- E-mel tempahan dihantar melalui `GmailApp.sendEmail`. Status emel dicatatkan pada helaian; kegagalan emel tidak membuang tempahan yang sudah disimpan.
- ID permintaan idempoten dikekalkan jika percubaan rangkaian gagal. Jika browser melaporkan sambungan tidak dapat disahkan, semak Sheet sebelum cuba semula.
- `CacheService` menyediakan had kadar asas. Had ini bukan sistem keselamatan atau identiti yang kukuh.

> **Penting — penggunaan demo sahaja:** GitHub Pages ialah front-end awam. Log masuk demo dan nombor matrik daripada browser **bukan pengesahan identiti**, dan Web App awam boleh dipanggil di luar laman. Jangan gunakan data sebenar pelajar, alamat peribadi atau emel sebenar; jangan aktifkan `GmailApp` untuk operasi produksi tanpa backend terlindung, pengesahan UiTM/Workspace, kawalan penyalahgunaan dan semakan privasi. Jika browser menyekat bacaan respons Apps Script kerana polisi CORS, gunakan backend/proksi HTTPS di bawah domain yang dikawal institusi; jangan tandakan penghantaran sebagai berjaya secara senyap.

## Teknologi dan pustaka

- HTML5 semantik dengan metadata halaman
- CSS3 responsif dengan pemboleh ubah warna tema UiTM
- JavaScript ES6 tanpa rangka kerja untuk validasi, logik tempahan dan kuota
- Bootstrap 5.3 melalui CDN untuk grid, borang, navigasi responsif dan komponen
- Chart.js 4 melalui CDN untuk carta penggunaan dapur
- Bootstrap Icons melalui CDN
- Google Apps Script (`SpreadsheetApp`, `LockService`, `CacheService`, `GmailApp`) untuk integrasi pilihan
- Logo SVG placeholder UiTM setempat (mudah dimuatkan di GitHub Pages; ganti dengan fail/logo rasmi UiTM jika penggunaan dibenarkan)

Sambungan internet diperlukan untuk memuatkan Bootstrap, Chart.js dan Bootstrap Icons daripada CDN serta berkomunikasi dengan Apps Script apabila integrasi diaktifkan. Pastikan pelayar membenarkan JavaScript dan `localStorage`.

## Jalankan secara setempat

Tiada proses binaan atau pemasangan pakej diperlukan. Buka `index.html` dalam Google Chrome atau jalankan pelayan fail statik daripada folder projek:

```bash
python -m http.server 8000
```

Kemudian buka `http://localhost:8000/`.

## Penerbitan GitHub Pages

1. Cipta repositori baharu di GitHub dan salin fail projek ini ke repositori.
2. Dari folder projek, jalankan arahan berikut (gantikan nilai placeholder):

   ```bash
   git init
   git add .
   git commit -m "Create UiTM Dapur Madani and Food Bank prototype"
   git branch -M main
   git remote add origin https://github.com/NAMA-PENGGUNA/NAMA-REPOSITORI.git
   git push -u origin main
   ```

3. Di repositori GitHub, buka **Settings → Pages**.
4. Dalam **Build and deployment**, pilih **Deploy from a branch**.
5. Pilih branch `main`, folder `/ (root)`, kemudian tekan **Save**.
6. Selepas deployment selesai, buka `https://NAMA-PENGGUNA.github.io/NAMA-REPOSITORI/`. Fail `index.html` ialah pintu masuk lalai.
7. Gantikan pautan contoh di bawah dengan URL repositori dan laman sebenar anda.

## Pautan projek

- Repositori GitHub: [https://github.com/NAMA-PENGGUNA/NAMA-REPOSITORI](https://github.com/NAMA-PENGGUNA/NAMA-REPOSITORI)
- GitHub Pages: [https://NAMA-PENGGUNA.github.io/NAMA-REPOSITORI/](https://NAMA-PENGGUNA.github.io/NAMA-REPOSITORI/)

## Struktur direktori

```text
.
├── index.html
├── login.html
├── dashboard.html
├── bookings.html
├── foodbank.html
├── signup.html
├── admin.html
├── Code.gs
├── assets/
│   └── uitm-logo.svg
├── css/
│   └── style.css
├── js/
│   └── app.js
└── README.md
```
