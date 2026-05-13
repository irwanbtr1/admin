const message = document.getElementById('message');
const content = document.getElementById('bon-content');

function getCodeFromUrl() {
    return window.location.pathname.split('/').filter(Boolean).pop() || '';
}

function setText(id, value) {
    document.getElementById(id).textContent = value || '-';
}

function setMessage(text, type = '') {
    message.textContent = text;
    message.className = `message ${type}`.trim();
}

function renderBon(data) {
    setText('service-id', data.ID);
    setText('service-status', data.Status);
    setText('date-in', `Tanggal masuk: ${data['Tanggal Masuk'] || '-'}`);
    setText('customer-name', data['Nama Pelanggan']);
    setText('customer-phone', data['No HP Pelanggan']);
    setText('phone-model', `${data['Merk HP'] || ''} ${data['Model HP'] || ''}`.trim());
    setText('items', data.Kelengkapan);
    setText('damage', data.Kerusakan);
    setText('estimate-cost', data['Estimasi Biaya']);
    setText('final-cost', data['Biaya Akhir']);
    setText('technician', data.Teknisi);
    setText('date-done', data['Tanggal Selesai']);
    setText('warranty-status', data['Status Garansi']);
    setText('warranty-period', `${data['Tanggal Mulai Garansi'] || '-'} s/d ${data['Tanggal Akhir Garansi'] || '-'}`);
    setText('note', data.Catatan);

    const status = document.getElementById('service-status');
    status.className = `status-pill ${String(data.Status || '').toLowerCase()}`;

    // Redirect agar costumer cukup melihat satu tampilan saja.
    document.getElementById('tracking-link').href = `/customer/${encodeURIComponent(data.ID)}`;
    content.classList.remove('hidden');

    setMessage('Bon online berhasil dimuat.', 'success');
}

async function loadBon() {
    const code = getCodeFromUrl();

    if (!code) {
        setMessage('Kode bon tidak ditemukan.', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/bon/${encodeURIComponent(code)}`);
        const data = await response.json();

        if (!response.ok) {
            setMessage(data.error || 'Bon online tidak ditemukan.', 'error');
            return;
        }

        renderBon(data);
    } catch (error) {
        setMessage('Gagal memuat bon online. Coba lagi sebentar.', 'error');
    }
}

loadBon();
