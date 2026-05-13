import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'data', 'servis.json');

export default function handler(req, res) {

    const data = JSON.parse(
        fs.readFileSync(filePath, 'utf8') || '[]'
    );

    const stats = {
        antrian: data.filter(i => i.Status === 'Antrian').length,
        proses: data.filter(i => i.Status === 'Proses').length,
        selesai: data.filter(i => i.Status === 'Selesai').length,
        diambil: data.filter(i => i.Status === 'Diambil').length,
        gagal: data.filter(i => i.Status === 'Gagal').length,
        perluFollowUp: 0,
        belumDiambil: 0,
        garansiAktif: 0
    };

    res.status(200).json(stats);
}