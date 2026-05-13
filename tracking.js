const message = document.getElementById('tracking-message');


const result = document.getElementById('tracking-result');
const refreshButton = document.getElementById('refresh-status');
const lastSync = document.getElementById('last-sync');
const statusOrder = ['Antrian', 'Proses', 'Selesai', 'Diambil'];
let activeCode = '';
let syncTimer = null;

const statusMessages = {
    Antrian: 'Servis sudah masuk antrian. Mohon tunggu teknisi memeriksa unit.',
    Proses: 'Unit sedang dikerjakan teknisi. Status akan berubah saat perbaikan selesai.',
    Selesai: 'Servis sudah selesai. Silakan datang ke toko untuk mengambil unit.',
    Diambil: 'Unit sudah diambil customer. Terima kasih sudah servis di IWAN PONSEL.'
};

function getCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const queryCode = params.get('id');

    // Expect formats:
    // - /customer/<ID>
    // - /bon/<ID>
    // - /tracking/<ID> (legacy)
    const parts = window.location.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    const prefix = parts[0] || '';

    const isCodePath = ['customer', 'bon', 'tracking'].includes(prefix) || window.location.pathname.includes('/customer/') || window.location.pathname.includes('/bon/');

    return queryCode || (isCodePath ? last : '');
}


function setText(id, value) {
    document.getElementById(id).textContent = value || '-';
}

function setMessage(text, type = '') {
    message.textContent = text;
    message.className = `message ${type}`.trim();
}

function formatSyncTime() {
    return new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function renderProgress(status) {
    const activeIndex = Math.max(statusOrder.indexOf(status), 0);

    document.querySelectorAll('.step').forEach((step, index) => {
        step.classList.toggle('active', index <= activeIndex);
        step.classList.toggle('current', statusOrder[index] === status);
    });
}

function renderTracking(data) {
    setText('service-id', data.ID);
    setText('service-status', data.Status);
    setText('current-status-title', data.Status);
    setText('current-status-description', statusMessages[data.Status] || 'Status servis terbaru sudah tersinkron dari toko.');
    setText('customer-name', data['Nama Pelanggan']);
    setText('customer-phone', data['No HP Pelanggan']);
    setText('phone-model', `${data['Merk HP'] || ''} ${data['Model HP'] || ''}`.trim());
    setText('damage', data.Kerusakan);
    setText('date-in', data['Tanggal Masuk']);
    setText('date-done', data['Tanggal Selesai']);
    setText('warranty-status', data['Status Garansi']);
    setText('warranty-period', `${data['Tanggal Mulai Garansi'] || '-'} s/d ${data['Tanggal Akhir Garansi'] || '-'}`);
    setText('estimate-cost', data['Estimasi Biaya']);
    setText('final-cost', data['Biaya Akhir']);
    setText('note', data.Catatan);

    const statusPill = document.getElementById('service-status');
    statusPill.className = `status-pill ${String(data.Status || '').toLowerCase()}`;

    renderProgress(data.Status);
    lastSync.textContent = `Terakhir sinkron: ${formatSyncTime()}`;
    result.classList.remove('hidden');
}

function startAutoSync() {
    clearInterval(syncTimer);
    syncTimer = setInterval(() => {
        if (activeCode) {
            loadTracking(activeCode, true);
        }
    }, 15000);
}

async function loadTracking(code, silent = false) {
    const cleanCode = String(code || '').trim().toUpperCase();

    if (!cleanCode) {
        result.classList.add('hidden');
        setMessage('Masukkan kode servis atau scan QR pada bon customer.');
        return;
    }

    activeCode = cleanCode;
    if (!silent) {
        setMessage('Mengecek status servis...', 'loading');
    }


    try {
        const response = await fetch(`/api/tracking/${encodeURIComponent(cleanCode)}`);
        const data = await response.json();

        if (!response.ok) {
            result.classList.add('hidden');
            setMessage(data.error || 'Kode servis tidak ditemukan.', 'error');
            clearInterval(syncTimer);
            return;
        }

        renderTracking(data);
        setMessage('Status servis ditemukan dan otomatis sinkron.', 'success');
        startAutoSync();
    } catch (error) {
        if (!silent) {
            result.classList.add('hidden');
        }
        setMessage('Gagal memuat status. Coba lagi sebentar.', 'error');
    }
}

// form tracking dimatikan karena halaman ini langsung memuat bon dari URL.


refreshButton.addEventListener('click', () => {
    loadTracking(activeCode || getCodeFromUrl());
});

loadTracking(getCodeFromUrl());

