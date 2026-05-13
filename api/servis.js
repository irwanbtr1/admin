import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'data', 'servis.json');

function readData() {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data || '[]');
}

function saveData(data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export default function handler(req, res) {

    if (req.method === 'GET') {
        return res.status(200).json(readData());
    }

    if (req.method === 'POST') {
        const data = readData();

        const newItem = {
            ID: `SRV-${Date.now()}`,
            ...req.body
        };

        data.push(newItem);
        saveData(data);

        return res.status(200).json({
            success: true,
            data: newItem
        });
    }

    res.status(405).json({
        success: false
    });
}