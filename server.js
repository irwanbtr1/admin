const express = require('express');
const XLSX = require('xlsx');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const EXCEL_FILE = path.join(__dirname, 'database.xlsx');
const BACKUP_DIR = path.join(__dirname, 'backup-database');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_DURATION = 1000 * 60 * 60 * 12;
const WARRANTY_DAYS = 14;
const sessions = new Map();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

function cleanupSessions() {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
        if (session.expiresAt <= now) {
            sessions.delete(token);
        }
    }
}

function getBearerToken(req) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return '';
    return authHeader.slice(7).trim();
}

function requireAuth(req, res, next) {
    cleanupSessions();
    const token = getBearerToken(req);
    const session = sessions.get(token);

    if (!session) {
        return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
    }

    session.expiresAt = Date.now() + SESSION_DURATION;
    next();
}

// Inisialisasi file Excel jika belum ada
function initExcel() {
    if (!fs.existsSync(EXCEL_FILE)) {
        const wb = XLSX.utils.book_new();
        const headers = [
            'ID', 'Tanggal Masuk', 'Nama Pelanggan', 'No HP Pelanggan',
            'Merk HP', 'Model HP', 'Kerusakan', 'Kelengkapan',
            'Estimasi Biaya', 'Status', 'Update Status Terakhir', 'Teknisi', 'Tanggal Selesai', 'Biaya Akhir', 'Catatan'
        ];
        const ws = XLSX.utils.aoa_to_sheet([headers]);
        XLSX.utils.book_append_sheet(wb, ws, 'Servis');
        XLSX.writeFile(wb, EXCEL_FILE);
    }
}

// Baca semua data
function readData() {
    const wb = XLSX.readFile(EXCEL_FILE);
    const ws = wb.Sheets['Servis'];
    return XLSX.utils.sheet_to_json(ws);
}

// Simpan data ke Excel
function saveData(data) {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    if (fs.existsSync(EXCEL_FILE)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(EXCEL_FILE, path.join(BACKUP_DIR, `database-${timestamp}.xlsx`));
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Servis');
    const tempFile = path.join(__dirname, 'database.tmp.xlsx');

    XLSX.writeFile(wb, tempFile);
    fs.copyFileSync(tempFile, EXCEL_FILE);
    fs.unlinkSync(tempFile);
}

// Generate ID unik
function generateId() {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `SRV${year}${month}${random}`;
}

function getTodayId() {
    return new Date().toLocaleDateString('id-ID');
}

function formatIdDate(date) {
    return date.toLocaleDateString('id-ID');
}

function parseIdDate(value) {
    if (value === undefined || value === null || value === '-') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    if (typeof value === 'number' && Number.isFinite(value)) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (!parsed || parsed.y === undefined || parsed.m === undefined || parsed.d === undefined) return null;
        return new Date(parsed.y, parsed.m - 1, parsed.d);
    }

    const text = String(value).trim().split(/\s+/)[0];
    if (!text) return null;

    const parts = text.split(/[\/\-.]/).map(Number);
    if (parts.length === 3 && parts.every(part => !Number.isNaN(part))) {
        let [day, month, year] = parts;
        if (year < 100) {
            year += year < 50 ? 2000 : 1900;
        }

        if (text.includes('-') && day > 31) {
            [year, month, day] = [day, month, year];
        }

        return new Date(year, month - 1, day);
    }

    const parsedDate = new Date(text);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function isActiveStatus(status) {
    return ['Antrian', 'Proses'].includes(status);
}

function getLastStatusDate(item) {
    return parseIdDate(item['Update Status Terakhir']) || parseIdDate(item['Tanggal Masuk']);
}

function isStaleService(item) {
    if (!isActiveStatus(item.Status)) return false;

    const lastStatusDate = getLastStatusDate(item);
    if (!lastStatusDate) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    lastStatusDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((today - lastStatusDate) / (1000 * 60 * 60 * 24));
    return diffDays >= 2;
}

function getDaysSinceStatusUpdate(item) {
    const lastStatusDate = getLastStatusDate(item);
    if (!lastStatusDate) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    lastStatusDate.setHours(0, 0, 0, 0);

    return Math.max(0, Math.floor((today - lastStatusDate) / (1000 * 60 * 60 * 24)));
}

function getPickupWaitingDate(item) {
    return parseIdDate(item['Tanggal Selesai']) || parseIdDate(item['Update Status Terakhir']);
}

function getDaysSincePickupWaiting(item) {
    const waitingDate = getPickupWaitingDate(item);
    if (!waitingDate) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    waitingDate.setHours(0, 0, 0, 0);

    return Math.max(0, Math.floor((today - waitingDate) / (1000 * 60 * 60 * 24)));
}

function isWaitingPickupTooLong(item) {
    return item.Status === 'Selesai' && getDaysSincePickupWaiting(item) >= 3;
}

function isWarrantyStatus(status) {
    return status === 'Diambil';
}

function normalizeDateField(item, key) {
    // Excel kadang menyimpan tanggal sebagai number/Date/teks.
    // Kembalikan apa adanya; parsing dilakukan oleh parseIdDate().
    return item[key];
}

function addDays(date, days) {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
}

function getWarrantyInfo(item) {
    // Pastikan status dibandingkan secara normal (hindari spasi/typo).
    const status = String(item.Status || '').trim();
    const isDiambil = status === 'Diambil';

    if (!isDiambil) { 
        return {
            'Garansi Berlaku': 'Tidak',
            'Tanggal Mulai Garansi': '-',
            'Tanggal Akhir Garansi': '-',
            'Sisa Hari Garansi': 0,
            'Status Garansi': 'Tidak Berlaku'
        };
    }

    // Garansi mulai berjalan setelah status berubah menjadi "Diambil".
    // Karena Tanggal perubahan status disimpan di kolom "Update Status Terakhir",
    // maka startDate diambil dari "Update Status Terakhir" (saat status = Diambil).

    // Beberapa data Excel bisa tersimpan sebagai number/Date/teks.
    // Saat ini kita parse dengan parseIdDate().
    const startDateRaw = item['Update Status Terakhir'];
    const startDate = parseIdDate(startDateRaw) || parseIdDate(item['Update Status Terakhir']);

    if (!startDate) {
        return {
            'Garansi Berlaku': 'Tidak',
            'Tanggal Mulai Garansi': '-',
            'Tanggal Akhir Garansi': '-',
            'Sisa Hari Garansi': 0,
            'Status Garansi': 'Tanggal Tidak Valid'
        };
    }

    startDate.setHours(0, 0, 0, 0);
    const endDate = addDays(startDate, WARRANTY_DAYS);
    const today = new Date();

    today.setHours(0, 0, 0, 0);
    const remainingDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
    const isActive = remainingDays >= 0;

    return {
        'Garansi Berlaku': isActive ? 'Ya' : 'Tidak',
        'Tanggal Mulai Garansi': formatIdDate(startDate),
        'Tanggal Akhir Garansi': formatIdDate(endDate),
        'Sisa Hari Garansi': Math.max(0, remainingDays),
        'Status Garansi': isActive ? `Aktif ${Math.max(0, remainingDays)} hari lagi` : 'Berakhir'
    };
}

function withWarrantyInfo(item) {
    return {
        ...item,
        ...getWarrantyInfo(item)
    };
}

function maskPhone(phone) {
    const text = String(phone || '');
    if (text.length <= 4) return text || '-';
    return `${text.slice(0, 4)}${'*'.repeat(Math.max(text.length - 7, 3))}${text.slice(-3)}`;
}

function sanitizePdfText(value) {
    return String(value || '-')
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/[\\()]/g, '\\$&');
}

function splitPdfLine(text, maxLength = 78) {
    const words = String(text || '-').split(/\s+/);
    const lines = [];
    let line = '';

    words.forEach(word => {
        if ((line + ' ' + word).trim().length > maxLength) {
            if (line) lines.push(line);
            line = word;
        } else {
            line = `${line} ${word}`.trim();
        }
    });

    if (line) lines.push(line);
    return lines;
}

function createBonPdf(item) {
    const warranty = getWarrantyInfo(item);
    const rows = [
        ['Tanggal Masuk', item['Tanggal Masuk']],
        ['Nama Customer', item['Nama Pelanggan']],
        ['No HP', maskPhone(item['No HP Pelanggan'])],
        ['Merk / Model', `${item['Merk HP'] || '-'} ${item['Model HP'] || ''}`.trim()],
        ['Kerusakan', item.Kerusakan],
        ['Kelengkapan', item.Kelengkapan],
        ['Estimasi Biaya', item['Estimasi Biaya']],
        ['Status', item.Status],
        ['Garansi', warranty['Status Garansi']],
        ['Masa Garansi', `${warranty['Tanggal Mulai Garansi']} s/d ${warranty['Tanggal Akhir Garansi']}`],
        ['Teknisi', item.Teknisi],
        ['Catatan', item.Catatan]
    ];

    const lines = [
        'IWAN PONSEL',
        'BON CUSTOMER',
        `KODE: ${item.ID}`,
        '',
        'Data Customer',
        ...[
            ['Tanggal Masuk', item['Tanggal Masuk']],
            ['Nama Customer', item['Nama Pelanggan']],
            ['No HP', maskPhone(item['No HP Pelanggan'])]
        ].flatMap(([label, value]) => splitPdfLine(`${label}: ${value || '-'}`)),
        '',
        'Data Handphone',
        ...[
            ['Merk / Model', `${item['Merk HP'] || '-'} ${item['Model HP'] || ''}`.trim()],
            ['Kerusakan', item.Kerusakan],
            ['Kelengkapan', item.Kelengkapan],
            ['Estimasi Biaya', item['Estimasi Biaya']],
            ['Status', item.Status],
            ['Garansi', warranty['Status Garansi']],
            ['Masa Garansi', `${warranty['Tanggal Mulai Garansi']} s/d ${warranty['Tanggal Akhir Garansi']}`],
            ['Teknisi', item.Teknisi],
            ['Catatan', item.Catatan]
        ].flatMap(([label, value]) => splitPdfLine(`${label}: ${value || '-'}`)),
        '',
        'Bon ini wajib dibawa saat pengambilan HP.',
        'Garansi servis berlaku 14 hari sejak HP diambil dan hanya untuk kerusakan yang sama.',
        '',
        `Customer: ${item['Nama Pelanggan'] || '-'}`,
        'Penerima: IWAN PONSEL'
    ];




    const contentLines = [
        'BT',
        '/F1 22 Tf',
        '50 790 Td',
        `(${sanitizePdfText(lines[0])}) Tj`,
        '/F1 20 Tf',
        '0 -28 Td',
        `(${sanitizePdfText(lines[1])}) Tj`,
        '/F1 11 Tf',
        '0 -22 Td',
        `(${sanitizePdfText(lines[2])}) Tj`,
        '0 -22 Td'
    ];

    lines.slice(3).forEach(line => {
        if (!line) {
            contentLines.push('0 -12 Td');
            return;
        }
        contentLines.push(`(${sanitizePdfText(line)}) Tj`);
        contentLines.push('0 -14 Td');
    });

    contentLines.push('ET');
    const stream = contentLines.join('\n');
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream`
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf, 'binary'));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, 'binary');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    offsets.slice(1).forEach(offset => {
        pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'binary');
}

// API: Login admin
app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Username atau password salah' });
    }

    cleanupSessions();
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
        username,
        expiresAt: Date.now() + SESSION_DURATION
    });

    res.json({
        success: true,
        token,
        user: { username },
        expiresIn: SESSION_DURATION
    });
});

// API: Cek sesi login admin
app.get('/api/session', requireAuth, (req, res) => {
    res.json({ success: true });
});

// API: Logout admin
app.post('/api/logout', requireAuth, (req, res) => {
    sessions.delete(getBearerToken(req));
    res.json({ success: true });
});

// API: Ambil semua data servis
app.get('/api/servis', requireAuth, (req, res) => {
    try {
        const data = readData();
        res.json(data.map(withWarrantyInfo));
    } catch (error) {
        res.status(500).json({ error: 'Gagal membaca data' });
    }
});

// API: Tambah servis baru
app.post('/api/servis', requireAuth, (req, res) => {
    try {
        const data = readData();
        const today = getTodayId();
        const newEntry = {
            ID: generateId(),
            'Tanggal Masuk': today,
            'Nama Pelanggan': req.body.namaPelanggan,
            'No HP Pelanggan': req.body.noHpPelanggan,
            'Merk HP': req.body.merkHp,
            'Model HP': req.body.modelHp,
            'Kerusakan': req.body.kerusakan,
            'Kelengkapan': req.body.kelengkapan,
            'Estimasi Biaya': req.body.estimasiBiaya,
            'Status': 'Antrian',
            'Update Status Terakhir': today,
            'Teknisi': req.body.teknisi || '-',
            'Tanggal Selesai': '-',
            'Biaya Akhir': '-',
            'Catatan': req.body.catatan || '-'
        };
        data.push(newEntry);
        saveData(data);
        res.json({ success: true, data: withWarrantyInfo(newEntry) });
    } catch (error) {
        console.error('Gagal menyimpan data:', error);
        res.status(500).json({ error: `Gagal menyimpan data: ${error.message}` });
    }
});

// API: Update status servis
app.put('/api/servis/:id', requireAuth, (req, res) => {
    try {
        let data = readData();
        const index = data.findIndex(item => item.ID === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Data tidak ditemukan' });
        }
        
        const oldStatus = data[index].Status;
        data[index] = { ...data[index], ...req.body };
        
        if (req.body.Status && req.body.Status !== oldStatus) {
            data[index]['Update Status Terakhir'] = getTodayId();
        }

        if (req.body.Status && req.body.Status !== oldStatus && ['Selesai', 'Gagal'].includes(req.body.Status)) {
            data[index]['Tanggal Selesai'] = getTodayId();
        }

        // Aktifkan garansi saat status berubah menjadi "Diambil"
        // startDate garansi dihitung dari "Update Status Terakhir" ketika Status = Diambil.
        // Jadi kita pastikan kolom tersebut sudah ter-update (di blok if status berubah di atas).
        // Tambahan ini hanya untuk memastikan kolom "Update Status Terakhir" tidak terlewat jika update dilakukan.
        if (req.body.Status === 'Diambil' && req.body.Status !== oldStatus) {
            data[index]['Update Status Terakhir'] = getTodayId();
        }

        saveData(data);

        res.json({ success: true, data: withWarrantyInfo(data[index]) });
    } catch (error) {
        res.status(500).json({ error: 'Gagal update data' });
    }
});

// API: Hapus servis
app.delete('/api/servis/:id', requireAuth, (req, res) => {
    try {
        if (req.body?.approvalPassword !== ADMIN_PASSWORD) {
            return res.status(403).json({ error: 'Password persetujuan salah' });
        }

        let data = readData();
        const initialLength = data.length;
        data = data.filter(item => item.ID !== req.params.id);

        if (data.length === initialLength) {
            return res.status(404).json({ error: 'Data tidak ditemukan' });
        }

        saveData(data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Gagal hapus data' });
    }
});

// API: Tracking status servis untuk pelanggan
app.get('/api/tracking/:id', (req, res) => {
    try {
        const data = readData();
        const item = data.find(servis => servis.ID === req.params.id);

        if (!item) {
            return res.status(404).json({ error: 'Kode servis tidak ditemukan' });
        }

        res.json(withWarrantyInfo({
            ID: item.ID,
            'Tanggal Masuk': item['Tanggal Masuk'],
            'Nama Pelanggan': item['Nama Pelanggan'],
            'No HP Pelanggan': maskPhone(item['No HP Pelanggan']),
            'Merk HP': item['Merk HP'],
            'Model HP': item['Model HP'],
            'Kerusakan': item.Kerusakan,
            'Status': item.Status,
            'Update Status Terakhir': item['Update Status Terakhir'],
            'Tanggal Selesai': item['Tanggal Selesai'],
            'Estimasi Biaya': item['Estimasi Biaya'],
            'Biaya Akhir': item['Biaya Akhir'],
            'Catatan': item.Catatan
        }));
    } catch (error) {
        res.status(500).json({ error: 'Gagal membaca status tracking' });
    }
});

// API: Bon online untuk customer
app.get('/api/bon/:id', (req, res) => {
    try {
        const data = readData();
        const item = data.find(servis => servis.ID === req.params.id);

        if (!item) {
            return res.status(404).json({ error: 'Bon servis tidak ditemukan' });
        }

        res.json(withWarrantyInfo({
            ID: item.ID,
            'Tanggal Masuk': item['Tanggal Masuk'],
            'Nama Pelanggan': item['Nama Pelanggan'],
            'No HP Pelanggan': maskPhone(item['No HP Pelanggan']),
            'Merk HP': item['Merk HP'],
            'Model HP': item['Model HP'],
            'Kerusakan': item.Kerusakan,
            'Kelengkapan': item.Kelengkapan,
            'Estimasi Biaya': item['Estimasi Biaya'],
            'Status': item.Status,
            'Update Status Terakhir': item['Update Status Terakhir'],
            'Teknisi': item.Teknisi,
            'Tanggal Selesai': item['Tanggal Selesai'],
            'Biaya Akhir': item['Biaya Akhir'],
            'Catatan': item.Catatan
        }));
    } catch (error) {
        res.status(500).json({ error: 'Gagal membaca bon online' });
    }
});

app.get('/tracking/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tracking.html'));
});

app.get('/customer', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tracking.html'));
});

app.get('/customer/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tracking.html'));
});

// Alias: /bon/:id juga tampilkan halaman gabungan (bon + tracking) supaya costumer tidak bingung.
app.get('/bon/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tracking.html'));
});



app.get('/bon/:id.pdf', (req, res) => {
    try {
        const data = readData();
        const item = data.find(servis => servis.ID === req.params.id);

        if (!item) {
            return res.status(404).send('Bon servis tidak ditemukan');
        }

        const pdf = createBonPdf(item);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="bon-${item.ID}.pdf"`);
        res.send(pdf);
    } catch (error) {
        res.status(500).send('Gagal membuat PDF bon');
    }
});

// API: Dashboard statistik
app.get('/api/dashboard', requireAuth, (req, res) => {
    try {
        const data = readData();
        const stats = {
            total: data.length,
            antrian: data.filter(d => d.Status === 'Antrian').length,
            proses: data.filter(d => d.Status === 'Proses').length,
            selesai: data.filter(d => d.Status === 'Selesai').length,
            diambil: data.filter(d => d.Status === 'Diambil').length,
            gagal: data.filter(d => ['Gagal', 'Tidak Bisa Diperbaiki'].includes(d.Status)).length,
            perluFollowUp: data.filter(isStaleService).length,
            belumDiambil: data.filter(isWaitingPickupTooLong).length,
            garansiAktif: data.filter(item => getWarrantyInfo(item)['Garansi Berlaku'] === 'Ya').length
        };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Gagal membaca statistik' });
    }
});

initExcel();

function getLanIp() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // IPv4 non-internal
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '';
}

app.listen(PORT, '0.0.0.0', () => {
    const lanIp = getLanIp();
    console.log(`Server berjalan di http://0.0.0.0:${PORT}`);
    if (lanIp) {
        console.log(`Gunakan IP LAN untuk akses dari device lain: http://${lanIp}:${PORT}`);
    } else {
        console.log('IP LAN tidak ditemukan otomatis. Coba gunakan IP host server (mis. 10.x.x.x) pada jaringan Anda.');
    }
});

