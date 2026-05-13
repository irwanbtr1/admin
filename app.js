const API_URL = '/api';
const AUTH_TOKEN_KEY = 'adminAuthToken';
const AUTH_USER_KEY = 'adminUsername';
let servisData = [];

function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

function setAuth(token, username) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, username);
}

function clearAuth() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
}

function showLoginScreen() {
    document.getElementById('modal')?.classList.remove('show');
    document.getElementById('confirm-modal')?.classList.remove('show');
    document.getElementById('login-screen').classList.remove('hidden');
    document.querySelector('.container').classList.add('locked');
    document.querySelector('[name="username"]').focus();
}

function showAdminScreen() {
    const username = localStorage.getItem(AUTH_USER_KEY) || 'admin';
    document.getElementById('login-screen').classList.add('hidden');
    document.querySelector('.container').classList.remove('locked');
    document.getElementById('login-user').textContent = `Iwan Ponsel — Smart Service Solution`;
}

async function apiFetch(url, options = {}) {
    const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${getAuthToken()}`
    };
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
        clearAuth();
        showLoginScreen();
        const error = new Error('Sesi login berakhir. Silakan login ulang.');
        error.code = 'AUTH_REQUIRED';
        throw error;
    }

    return res;
}

async function readJsonResponse(res, fallbackMessage) {
    const text = await res.text();

    try {
        return text ? JSON.parse(text) : {};
    } catch (error) {
        throw new Error(fallbackMessage || 'Server mengirim respons yang tidak valid. Pastikan aplikasi dibuka lewat server Node terbaru.');
    }
}

async function parseApiResult(res, fallbackMessage) {
    const result = await readJsonResponse(res, fallbackMessage);

    if (!res.ok || result.success === false) {
        throw new Error(result.error || fallbackMessage || 'Request gagal diproses server.');
    }

    return result;
}

function valueOrDash(value) {
    return value && value !== '-' ? value : '-';
}

function normalizeCustomerPhone(phone) {
    return String(phone || '').replace(/\D/g, '');
}

function getStatusClass(status) {
    return String(status || '').toLowerCase().replace(/\s+/g, '-');
}

function isSuccessfulStatus(status) {
    return ['Selesai', 'Diambil'].includes(status);
}

function isFailedStatus(status) {
    return ['Gagal', 'Tidak Bisa Diperbaiki'].includes(status);
}

function parseIdDate(value) {
    if (!value || value === '-') return null;

    const parts = String(value).split(/[/-]/).map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

    const [day, month, year] = parts;
    return new Date(year, month - 1, day);
}

function getDaysSinceDate(value) {
    const date = parseIdDate(value);
    if (!date) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    return Math.max(0, Math.floor((today - date) / (1000 * 60 * 60 * 24)));
}

function getLastStatusUpdate(item) {
    return item['Update Status Terakhir'] || item['Tanggal Masuk'];
}

function getPickupWaitingStart(item) {
    return item['Tanggal Selesai'] && item['Tanggal Selesai'] !== '-'
        ? item['Tanggal Selesai']
        : getLastStatusUpdate(item);
}

function getStaleServiceInfo(item) {
    if (!['Antrian', 'Proses'].includes(item.Status)) {
        return { stale: false, days: 0, lastUpdate: getLastStatusUpdate(item) };
    }

    const lastUpdate = getLastStatusUpdate(item);
    const days = getDaysSinceDate(lastUpdate);

    return {
        stale: days >= 2,
        days,
        lastUpdate
    };
}

function getPickupDelayInfo(item) {
    if (item.Status !== 'Selesai') {
        return { delayed: false, days: 0, startDate: getPickupWaitingStart(item) };
    }

    const startDate = getPickupWaitingStart(item);
    const days = getDaysSinceDate(startDate);

    return {
        delayed: days >= 3,
        days,
        startDate
    };
}

function isWarrantyActive(item) {
    return item['Garansi Berlaku'] === 'Ya';
}

function renderWarrantyBadge(item) {
    if (item.Status !== 'Diambil') return '';

    const active = isWarrantyActive(item);
    const label = active
        ? `Garansi aktif ${item['Sisa Hari Garansi'] || 0} hari`
        : 'Garansi berakhir';

    return `<span class="warranty-badge ${active ? 'active' : 'expired'}">${escapeHtml(label)}</span>`;
}

function getCustomerHistory(item) {
    const targetPhone = normalizeCustomerPhone(item['No HP Pelanggan']);
    const targetName = String(item['Nama Pelanggan'] || '').trim().toLowerCase();

    const history = servisData.filter(entry => {
        const entryPhone = normalizeCustomerPhone(entry['No HP Pelanggan']);
        if (targetPhone && entryPhone) return entryPhone === targetPhone;
        return targetName && String(entry['Nama Pelanggan'] || '').trim().toLowerCase() === targetName;
    });

    return {
        total: history.length,
        berhasil: history.filter(entry => isSuccessfulStatus(entry.Status)).length,
        gagal: history.filter(entry => isFailedStatus(entry.Status)).length,
        proses: history.filter(entry => ['Antrian', 'Proses'].includes(entry.Status)).length,
        items: history
    };
}

function renderCustomerHistory(item) {
    const history = getCustomerHistory(item);

    const rows = history.items.map(entry => `
        <tr>
            <td><strong>${escapeHtml(entry.ID)}</strong></td>
            <td>${escapeHtml(entry['Tanggal Masuk'])}</td>
            <td>${escapeHtml(`${entry['Merk HP'] || ''} ${entry['Model HP'] || ''}`.trim())}</td>
            <td>${escapeHtml(entry.Kerusakan)}</td>
            <td>
                <span class="status-badge ${getStatusClass(entry.Status)}">${escapeHtml(entry.Status)}</span>
                ${renderWarrantyBadge(entry)}
            </td>
        </tr>
    `).join('');

    return `
        <section class="history-panel">
            <div class="history-header">
                <div>
                    <h3>Riwayat Servis Customer</h3>
                    <p>Berdasarkan nomor HP ${escapeHtml(item['No HP Pelanggan'])}</p>
                </div>
            </div>
            <div class="history-stats">
                <div><span>${history.total}</span><small>Total Servis</small></div>
                <div class="success"><span>${history.berhasil}</span><small>Berhasil</small></div>
                <div class="failed"><span>${history.gagal}</span><small>Gagal</small></div>
                <div><span>${history.proses}</span><small>Berjalan</small></div>
            </div>
            <div class="history-table-wrapper">
                <table class="history-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Tanggal</th>
                            <th>HP</th>
                            <th>Kerusakan</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </section>
    `;
}

function escapeHtml(value) {
    return String(valueOrDash(value))
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showPopup({
    title = 'Konfirmasi',
    message = 'Apakah tindakan ini ingin dilanjutkan?',
    okText = 'Lanjutkan',
    cancelText = 'Batal',
    type = 'info',
    icon = '!',
    extra = '',
    showCancel = true,
    focusSelector = '',
    getResult = null,
    clearExtraOnClose = false
} = {}) {
    return new Promise(resolve => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const iconEl = document.getElementById('confirm-icon');
        const extraEl = document.getElementById('confirm-extra');
        const okButton = document.getElementById('confirm-ok');
        const cancelButton = document.getElementById('confirm-cancel');

        titleEl.textContent = title;
        messageEl.textContent = message;
        iconEl.textContent = icon;
        iconEl.className = `confirm-icon ${type}`;
        okButton.textContent = okText;
        cancelButton.textContent = cancelText;
        cancelButton.style.display = showCancel ? '' : 'none';

        if (extra) {
            extraEl.innerHTML = extra;
            extraEl.classList.add('show');
        } else {
            extraEl.innerHTML = '';
            extraEl.classList.remove('show');
        }

        function close(result) {
            const payload = result && typeof getResult === 'function' ? getResult() : result;
            modal.classList.remove('show');
            okButton.removeEventListener('click', onOk);
            cancelButton.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKeydown);

            if (clearExtraOnClose) {
                extraEl.querySelectorAll('input, textarea').forEach(input => {
                    input.value = '';
                });
                extraEl.innerHTML = '';
                extraEl.classList.remove('show');
            }

            resolve(payload);
        }

        function onOk() {
            close(true);
        }

        function onCancel() {
            close(false);
        }

        function onBackdrop(event) {
            if (event.target === modal) close(false);
        }

        function onKeydown(event) {
            if (event.key === 'Escape') close(false);
            if (event.key === 'Enter') close(true);
        }

        okButton.addEventListener('click', onOk);
        cancelButton.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKeydown);
        modal.classList.add('show');
        const focusTarget = focusSelector ? modal.querySelector(focusSelector) : okButton;
        (focusTarget || okButton).focus();
    });
}

function showNotice(options) {
    return showPopup({ ...options, showCancel: false, okText: options?.okText || 'Mengerti' });
}

// Load dashboard stats
async function loadDashboard() {
    try {
        const res = await apiFetch(`${API_URL}/dashboard`);
        const stats = await readJsonResponse(res, 'Gagal membaca statistik. Pastikan server sudah direstart.');
        
        document.getElementById('stat-antrian').textContent = stats.antrian;
        document.getElementById('stat-proses').textContent = stats.proses;
        document.getElementById('stat-selesai').textContent = stats.selesai;
        document.getElementById('stat-diambil').textContent = stats.diambil;
        document.getElementById('stat-gagal').textContent = stats.gagal || 0;
        document.getElementById('stat-follow-up').textContent = stats.perluFollowUp || 0;
        document.getElementById('stat-pickup').textContent = stats.belumDiambil || 0;
        document.getElementById('stat-warranty').textContent = stats.garansiAktif || 0;
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// Load servis data
async function loadServis() {
    try {
        const res = await apiFetch(`${API_URL}/servis`);
        if (!res.ok) {
            throw new Error('Gagal membaca data servis');
        }
        servisData = await readJsonResponse(res, 'Gagal membaca data servis. Pastikan server sudah direstart.');
        if (!Array.isArray(servisData)) {
            throw new Error('Format data servis tidak valid');
        }
        renderTable(servisData);
    } catch (error) {
        console.error('Error loading servis:', error);
        servisData = [];
        renderTable(servisData);
    }
}

// Render table
function renderTable(data) {
    const tbody = document.querySelector('#servis-table tbody');
    const search = document.getElementById('search').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    
    const filtered = data.filter(item => {
        const matchSearch = 
            item.ID?.toLowerCase().includes(search) ||
            item['Nama Pelanggan']?.toLowerCase().includes(search) ||
            item['Merk HP']?.toLowerCase().includes(search) ||
            item['Model HP']?.toLowerCase().includes(search);
        const matchStatus = !statusFilter || item.Status === statusFilter;
        return matchSearch && matchStatus;
    });
    
    tbody.innerHTML = filtered.map(item => {
        const staleInfo = getStaleServiceInfo(item);
        const pickupDelayInfo = getPickupDelayInfo(item);
        return `
        <tr class="${staleInfo.stale ? 'needs-follow-up' : ''} ${pickupDelayInfo.delayed ? 'needs-pickup' : ''}">
            <td><strong>${item.ID}</strong></td>
            <td>${item['Tanggal Masuk']}</td>
            <td>
                ${item['Nama Pelanggan']}<br>
                <small style="color:#888">${item['No HP Pelanggan']}</small>
            </td>
            <td>${item['Merk HP']} ${item['Model HP']}</td>
            <td>${item.Kerusakan?.substring(0, 30)}...</td>
            <td>
                <span class="status-badge ${getStatusClass(item.Status)}">${item.Status}</span>
                ${staleInfo.stale ? `<span class="follow-up-badge">Belum berubah ${staleInfo.days} hari</span>` : ''}
                ${pickupDelayInfo.delayed ? `<span class="pickup-badge">Belum diambil ${pickupDelayInfo.days} hari</span>` : ''}
                ${renderWarrantyBadge(item)}
            </td>
            <td>
                <div class="table-actions">
                    <button class="btn-action btn-detail" onclick="showDetailById('${item.ID}')">Detail</button>
                    <button class="btn-action btn-wa" onclick="chatWhatsappById('${item.ID}')">WA</button>
                    <button class="btn-action btn-online" onclick="sendOnlineBonById('${item.ID}')">Kirim Bon</button>
                    <button class="btn-action btn-print" onclick="printBonById('${item.ID}')">Cetak</button>
                    <button class="btn-action btn-delete" onclick="deleteServis('${item.ID}')">Hapus</button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

function findServisById(id) {
    return servisData.find(item => item.ID === id);
}

function showDetailById(id) {
    const item = findServisById(id);
    if (!item) {
        showNotice({
            title: 'Data Tidak Ditemukan',
            message: 'Data servis ini tidak ada atau sudah dihapus.',
            type: 'warning',
            icon: '!'
        });
        return;
    }
    showDetail(item);
}

async function printBonById(id) {
    const item = findServisById(id);
    if (!item) {
        showNotice({
            title: 'Data Tidak Ditemukan',
            message: 'Data servis ini tidak ada atau sudah dihapus.',
            type: 'warning',
            icon: '!'
        });
        return;
    }
    await printBon(item);
}

function normalizeWhatsappNumber(phone) {
    const digits = String(phone || '').replace(/\D/g, '');

    if (!digits) return '';
    if (digits.startsWith('0')) return `62${digits.slice(1)}`;
    if (digits.startsWith('62')) return digits;
    return digits;
}

function getWhatsappMessage(item) {
    const statusMessages = {
        Antrian: `Halo ${item['Nama Pelanggan']}, servis HP ${item['Merk HP']} ${item['Model HP']} dengan kode ${item.ID} sudah masuk antrian di IWAN PONSEL. Kami akan kabari jika sudah diproses.`,
        Proses: `Halo ${item['Nama Pelanggan']}, servis HP ${item['Merk HP']} ${item['Model HP']} dengan kode ${item.ID} sedang dalam proses pengerjaan di IWAN PONSEL.`,
        Selesai: `Halo ${item['Nama Pelanggan']}, servis HP ${item['Merk HP']} ${item['Model HP']} dengan kode ${item.ID} sudah selesai. Silakan datang ke IWAN PONSEL untuk pengambilan. Terima kasih.`,
        Diambil: `Halo ${item['Nama Pelanggan']}, HP dengan kode servis ${item.ID} sudah tercatat diambil. Terima kasih sudah servis di IWAN PONSEL.`,
        Gagal: `Halo ${item['Nama Pelanggan']}, servis HP ${item['Merk HP']} ${item['Model HP']} dengan kode ${item.ID} sudah kami cek, namun belum bisa diperbaiki. Silakan hubungi IWAN PONSEL untuk info lebih lanjut.`
    };

    return statusMessages[item.Status] || `Halo ${item['Nama Pelanggan']}, kami dari IWAN PONSEL ingin mengabari status servis HP ${item['Merk HP']} ${item['Model HP']} dengan kode ${item.ID}.`;
}

function openWhatsapp(item, message) {
    const waNumber = normalizeWhatsappNumber(item['No HP Pelanggan']);

    if (!waNumber) {
        showNotice({
            title: 'Nomor WhatsApp Kosong',
            message: 'Nomor HP customer belum tersedia di data servis ini.',
            type: 'warning',
            icon: '!'
        });
        return;
    }

    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, '_blank');
}

function chatWhatsappById(id) {
    const item = findServisById(id);
    if (!item) {
        showNotice({
            title: 'Data Tidak Ditemukan',
            message: 'Data servis ini tidak ada atau sudah dihapus.',
            type: 'warning',
            icon: '!'
        });
        return;
    }

    openWhatsapp(item, getWhatsappMessage(item));
}

function getOnlineBonUrl(item, baseUrl) {
    return `${baseUrl}/bon/${encodeURIComponent(item.ID)}`;
}

function getBonPdfUrl(item, baseUrl) {
    return `${baseUrl}/bon/${encodeURIComponent(item.ID)}.pdf`;
}

async function sendOnlineBonById(id) {
    const item = findServisById(id);
    if (!item) {
        showNotice({
            title: 'Data Tidak Ditemukan',
            message: 'Data servis ini tidak ada atau sudah dihapus.',
            type: 'warning',
            icon: '!'
        });
        return;
    }

    const baseUrl = await getTrackingBaseUrl();
    if (!baseUrl) return;

    const pdfUrl = getBonPdfUrl(item, baseUrl);
    const bonUrl = getOnlineBonUrl(item, baseUrl);
    const message = `Halo ${item['Nama Pelanggan']}, berikut bon servis HP ${item['Merk HP']} ${item['Model HP']} dengan kode ${item.ID} dari IWAN PONSEL dalam bentuk PDF:\n\n${pdfUrl}\n\nJika PDF tidak terbuka, gunakan link bon online ini:\n${bonUrl}`;

    openWhatsapp(item, message);
}

function normalizeBaseUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
}

async function getTrackingBaseUrl() {
    const savedUrl = normalizeBaseUrl(localStorage.getItem('trackingBaseUrl'));
    const currentUrl = normalizeBaseUrl(window.location.origin);
    const isLocalUrl = ['localhost', '127.0.0.1'].includes(window.location.hostname);

    if (!isLocalUrl) {
        return currentUrl;
    }

    const suggestedUrl = savedUrl || currentUrl;
    const confirmed = await showPopup({
        title: 'Alamat Bon Online',
        message: 'Masukkan alamat server yang bisa dibuka dari HP pelanggan.',
        okText: 'Gunakan Alamat',
        cancelText: 'Batal',
        type: 'info',
        icon: 'i',
        extra: `
            <label class="popup-field">
                <span>Alamat server</span>
                <input id="tracking-base-url-input" type="url" value="${escapeHtml(suggestedUrl)}" placeholder="https://contoh-domain.com">
            </label>
        `
    });

    if (!confirmed) return '';

    const inputUrl = document.getElementById('tracking-base-url-input')?.value;
    const baseUrl = normalizeBaseUrl(inputUrl) || currentUrl;

    localStorage.setItem('trackingBaseUrl', baseUrl);
    return baseUrl;
}

// Show detail modal
function showDetail(item) {
    const modal = document.getElementById('modal');
    const body = document.getElementById('modal-body');
    const staleInfo = getStaleServiceInfo(item);
    const pickupDelayInfo = getPickupDelayInfo(item);
    
    body.innerHTML = `
        ${staleInfo.stale ? `
            <div class="follow-up-alert">
                <strong>Perlu follow up</strong>
                <span>Status belum berubah selama ${staleInfo.days} hari. Update terakhir: ${escapeHtml(staleInfo.lastUpdate)}.</span>
            </div>
        ` : ''}
        ${pickupDelayInfo.delayed ? `
            <div class="pickup-alert">
                <strong>Servis selesai belum diambil</strong>
                <span>Status sudah selesai selama ${pickupDelayInfo.days} hari, tetapi belum berubah menjadi Diambil. Tanggal mulai selesai: ${escapeHtml(pickupDelayInfo.startDate)}.</span>
            </div>
        ` : ''}
        <div class="detail-grid">
            <span class="label">ID:</span><span>${item.ID}</span>
            <span class="label">Tanggal Masuk:</span><span>${item['Tanggal Masuk']}</span>
            <span class="label">Pelanggan:</span><span>${item['Nama Pelanggan']}</span>
            <span class="label">No HP:</span><span>${item['No HP Pelanggan']}</span>
            <span class="label">Merk:</span><span>${item['Merk HP']}</span>
            <span class="label">Model:</span><span>${item['Model HP']}</span>
            <span class="label">Kerusakan:</span><span>${item.Kerusakan}</span>
            <span class="label">Kelengkapan:</span><span>${item.Kelengkapan}</span>
            <span class="label">Estimasi:</span><span>${item['Estimasi Biaya']}</span>
            <span class="label">Teknisi:</span><span>${item.Teknisi}</span>
            <span class="label">Status:</span><span class="status-badge ${getStatusClass(item.Status)}">${item.Status}</span>
            <span class="label">Update Status Terakhir:</span><span>${escapeHtml(getLastStatusUpdate(item))}</span>
            <span class="label">Garansi:</span><span>${renderWarrantyBadge(item) || '-'}</span>
            <span class="label">Masa Garansi:</span><span>${escapeHtml(item['Tanggal Mulai Garansi'])} s/d ${escapeHtml(item['Tanggal Akhir Garansi'])}</span>
            <span class="label">Tanggal Selesai:</span><span>${item['Tanggal Selesai']}</span>
            <span class="label">Biaya Akhir:</span><span>${item['Biaya Akhir']}</span>
            <span class="label">Catatan:</span><span>${item.Catatan}</span>
        </div>
        <div class="modal-actions">
            <div class="modal-action-row update-row">
                <select id="update-status">
                    <option value="Antrian" ${item.Status === 'Antrian' ? 'selected' : ''}>Antrian</option>
                    <option value="Proses" ${item.Status === 'Proses' ? 'selected' : ''}>Proses</option>
                    <option value="Selesai" ${item.Status === 'Selesai' ? 'selected' : ''}>Selesai</option>
                    <option value="Diambil" ${item.Status === 'Diambil' ? 'selected' : ''}>Diambil</option>
                    <option value="Gagal" ${item.Status === 'Gagal' ? 'selected' : ''}>Gagal / Tidak Bisa Diperbaiki</option>
                </select>
                <input type="text" id="update-biaya" placeholder="Biaya Akhir" value="${item['Biaya Akhir'] !== '-' ? item['Biaya Akhir'] : ''}">
                <button class="btn-primary" onclick="updateStatus('${item.ID}')">Update Status</button>
            </div>
            <div class="modal-action-row quick-actions">
                <button class="btn-whatsapp" onclick="chatWhatsappById('${item.ID}')">Chat WhatsApp</button>
                <button class="btn-online-bon" onclick="sendOnlineBonById('${item.ID}')">Kirim Bon Online</button>
                <button class="btn-secondary" onclick="printBonById('${item.ID}')">Cetak Bon</button>
            </div>
        </div>
        ${renderCustomerHistory(item)}
    `;
    
    modal.classList.add('show');
}

// Print bon customer
async function printBon(item) {
    const baseUrl = await getTrackingBaseUrl();
    if (!baseUrl) return;

    const bonWindow = window.open('', '_blank', 'width=820,height=900');

    if (!bonWindow) {
        showNotice({
            title: 'Popup Diblokir',
            message: 'Izinkan popup di browser agar bon customer bisa dibuka dan dicetak.',
            type: 'warning',
            icon: '!'
        });
        return;
    }

    const trackingUrl = `${baseUrl}/customer/${encodeURIComponent(item.ID)}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(trackingUrl)}`;

    const html = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Bon Customer - ${escapeHtml(item.ID)}</title>
            <style>
                * { box-sizing: border-box; }
                body {
                    margin: 0;
                    padding: 24px;
                    font-family: Arial, sans-serif;
                    color: #222;
                    background: #f4f5f7;
                }
                .bon {
                    max-width: 720px;
                    margin: 0 auto;
                    background: #fff;
                    border: 1px solid #d9d9d9;
                    padding: 28px;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    gap: 18px;
                    border-bottom: 2px solid #222;
                    padding-bottom: 16px;
                    margin-bottom: 18px;
                }
                h1 {
                    margin: 0 0 6px;
                    font-size: 28px;
                    letter-spacing: 0;
                }
                .subtitle {
                    margin: 0;
                    color: #555;
                    font-size: 14px;
                }
                .bon-title {
                    text-align: right;
                    min-width: 190px;
                }
                .bon-title h2 {
                    margin: 0 0 8px;
                    font-size: 20px;
                }
                .bon-title strong {
                    display: inline-block;
                    padding: 6px 10px;
                    border: 1px solid #222;
                    font-size: 16px;
                }
                .section {
                    margin-top: 18px;
                }
                .section-title {
                    font-weight: 700;
                    margin-bottom: 8px;
                    padding-bottom: 6px;
                    border-bottom: 1px solid #e6e6e6;
                }
                .grid {
                    display: grid;
                    grid-template-columns: 170px 1fr;
                    gap: 8px 14px;
                    font-size: 14px;
                }
                .label {
                    color: #666;
                }
                .value {
                    font-weight: 600;
                }
                .note {
                    margin-top: 20px;
                    padding: 12px;
                    border: 1px dashed #bbb;
                    font-size: 13px;
                    color: #444;
                }
                .tracking-box {
                    display: grid;
                    grid-template-columns: 150px 1fr;
                    gap: 16px;
                    align-items: center;
                    margin-top: 20px;
                    padding: 14px;
                    border: 1px solid #d9d9d9;
                    background: #fafafa;
                }
                .tracking-box img {
                    width: 150px;
                    height: 150px;
                    border: 1px solid #e0e0e0;
                    background: white;
                }
                .tracking-box h3 {
                    margin: 0 0 8px;
                    font-size: 16px;
                }
                .tracking-box p {
                    margin: 0 0 8px;
                    color: #444;
                    font-size: 13px;
                }
                .tracking-code {
                    display: inline-block;
                    margin-bottom: 8px;
                    padding: 6px 10px;
                    border: 1px solid #222;
                    background: white;
                    font-weight: 700;
                    letter-spacing: 0;
                }
                .tracking-url {
                    display: block;
                    color: #555;
                    font-size: 12px;
                    overflow-wrap: anywhere;
                }
                .signatures {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 48px;
                    margin-top: 46px;
                    text-align: center;
                    font-size: 14px;
                }
                .line {
                    margin-top: 62px;
                    border-top: 1px solid #222;
                    padding-top: 8px;
                }
                .actions {
                    max-width: 720px;
                    margin: 16px auto 0;
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                }
                button {
                    border: 0;
                    border-radius: 8px;
                    padding: 11px 16px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .print {
                    color: white;
                    background: #b23a48;
                }
                .close {
                    color: #333;
                    background: #e9ecef;
                }
                @media print {
                    body {
                        padding: 0;
                        background: white;
                    }
                    .bon {
                        max-width: none;
                        border: none;
                    }
                    .actions {
                        display: none;
                    }
                }
                @media (max-width: 640px) {
                    body { padding: 12px; }
                    .header, .signatures {
                        grid-template-columns: 1fr;
                        display: grid;
                    }
                    .bon-title {
                        text-align: left;
                    }
                    .grid {
                        grid-template-columns: 1fr;
                    }
                    .tracking-box {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        </head>
        <body>
            <main class="bon">
                <div class="header">
                    <div>
                        <h1>IWAN PONSEL</h1>
                        <p class="subtitle">Bon tanda terima servis handphone</p>
                    </div>
                    <div class="bon-title">
                        <h2>BON CUSTOMER</h2>
                        <strong>${escapeHtml(item.ID)}</strong>
                    </div>
                </div>

                <section class="section">
                    <div class="section-title">Data Customer</div>
                    <div class="grid">
                        <div class="label">Tanggal Masuk</div><div class="value">${escapeHtml(item['Tanggal Masuk'])}</div>
                        <div class="label">Nama Customer</div><div class="value">${escapeHtml(item['Nama Pelanggan'])}</div>
                        <div class="label">No HP</div><div class="value">${escapeHtml(item['No HP Pelanggan'])}</div>
                    </div>
                </section>

                <section class="section">
                    <div class="section-title">Data Handphone</div>
                    <div class="grid">
                        <div class="label">Merk / Model</div><div class="value">${escapeHtml(item['Merk HP'])} ${escapeHtml(item['Model HP'])}</div>
                        <div class="label">Kerusakan</div><div class="value">${escapeHtml(item.Kerusakan)}</div>
                        <div class="label">Kelengkapan</div><div class="value">${escapeHtml(item.Kelengkapan)}</div>
                        <div class="label">Estimasi Biaya</div><div class="value">${escapeHtml(item['Estimasi Biaya'])}</div>
                        <div class="label">Status</div><div class="value">${escapeHtml(item.Status)}</div>
                        <div class="label">Garansi</div><div class="value">${escapeHtml(item['Status Garansi'])}</div>
                        <div class="label">Masa Garansi</div><div class="value">${escapeHtml(item['Tanggal Mulai Garansi'])} s/d ${escapeHtml(item['Tanggal Akhir Garansi'])}</div>
                        <div class="label">Teknisi</div><div class="value">${escapeHtml(item.Teknisi)}</div>
                        <div class="label">Catatan</div><div class="value">${escapeHtml(item.Catatan)}</div>
                    </div>
                </section>

                <div class="note">
                    Bon ini wajib dibawa saat pengambilan HP. Garansi servis berlaku 14 hari sejak HP diambil dan hanya untuk kerusakan yang sama.
                </div>

                <section class="tracking-box">
                    <img src="${escapeHtml(qrImageUrl)}" alt="QR tracking servis">
                    <div>
                        <h3>Tracking Status Servis</h3>
                        <p>Scan QR ini untuk melihat status servis secara mandiri.</p>
                        <strong class="tracking-code">${escapeHtml(item.ID)}</strong>
                        <span class="tracking-url">${escapeHtml(trackingUrl)}</span>
                    </div>
                </section>

                <div class="signatures">
                    <div>
                        <div>Customer</div>
                        <div class="line">${escapeHtml(item['Nama Pelanggan'])}</div>
                    </div>
                    <div>
                        <div>Penerima</div>
                        <div class="line">IWAN PONSEL</div>
                    </div>
                </div>
            </main>
            <div class="actions">
                <button class="close" onclick="window.close()">Tutup</button>
                <button class="print" onclick="window.print()">Cetak Bon</button>
            </div>
        </body>
        </html>
    `;

    bonWindow.document.open();
    bonWindow.document.write(html);
    bonWindow.document.close();
    bonWindow.focus();
}

// Update status
async function updateStatus(id) {
    const status = document.getElementById('update-status').value;
    const biayaAkhir = document.getElementById('update-biaya').value;
    
    try {
        const res = await apiFetch(`${API_URL}/servis/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                Status: status,
                'Biaya Akhir': biayaAkhir || '-'
            })
        });
        await parseApiResult(res, 'Gagal menyimpan perubahan status.');
        
        document.getElementById('modal').classList.remove('show');
        loadServis();
        loadDashboard();
        showNotice({
            title: 'Status Berhasil Diupdate',
            message: `Status servis berhasil diubah menjadi ${status}.`,
            type: 'success',
            icon: '✓'
        });
    } catch (error) {
        if (error.code === 'AUTH_REQUIRED') {
            return;
        }

        showNotice({
            title: 'Gagal Update Status',
            message: error.message || 'Terjadi kendala saat menyimpan perubahan status.',
            type: 'danger',
            icon: '!'
        });
    }
}

// Delete servis
async function deleteServis(id) {
    const approvalPassword = await showPopup({
        title: 'Hapus Data Servis?',
        message: 'Masukkan password admin untuk menyetujui penghapusan data servis. (Paste tidak diperbolehkan)',
        okText: 'Hapus Data',
        cancelText: 'Batal',
        type: 'danger',
        icon: '!',
        extra: `
            <div class="delete-approval">
                <div><strong>ID Servis:</strong> ${escapeHtml(id)}</div>
                <label class="popup-field">
                    <span>Password persetujuan</span>
                    <input
                        id="delete-approval-password"
                        type="password"
                        name="delete_approval_${Date.now()}"
                        autocomplete="new-password"
                        autocapitalize="off"
                        spellcheck="false"
                        inputmode="text"
                        placeholder="Masukkan password admin"
                    >
                </label>
                <small class="popup-hint">Agar aman, password tidak bisa ditempel/di-paste.</small>
            </div>
        `,
        focusSelector: '#delete-approval-password',
        getResult: () => document.getElementById('delete-approval-password')?.value || '',
        clearExtraOnClose: true
    });

    if (approvalPassword === false) return;

    if (!approvalPassword) {
        showNotice({
            title: 'Password Wajib Diisi',
            message: 'Data servis belum dihapus karena password persetujuan kosong.',
            type: 'warning',
            icon: '!'
        });
        return;
    }
    
    try {
        const res = await apiFetch(`${API_URL}/servis/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approvalPassword })
        });
        await parseApiResult(res, 'Gagal menghapus data servis.');
        loadServis();
        loadDashboard();
        showNotice({
            title: 'Data Berhasil Dihapus',
            message: `Data servis ${id} sudah dihapus.`,
            type: 'success',
            icon: '✓'
        });
    } catch (error) {
        if (error.code === 'AUTH_REQUIRED') {
            return;
        }

        showNotice({
            title: 'Gagal Menghapus Data',
            message: error.message || 'Terjadi kendala saat menghapus data servis.',
            type: 'danger',
            icon: '!'
        });
    }
}

// Form submit
document.getElementById('form-servis').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    try {
        const res = await apiFetch(`${API_URL}/servis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await readJsonResponse(res, 'Gagal menyimpan data. Pastikan server sudah direstart.');
        if (!res.ok || !result.success || !result.data) {
            throw new Error(result.error || 'Server tidak mengembalikan data servis baru');
        }

        const printNow = await showPopup({
            title: 'Data Servis Tersimpan',
            message: 'Data customer berhasil disimpan. Ingin langsung membuat bon customer?',
            okText: 'Cetak Bon',
            cancelText: 'Nanti Saja',
            type: 'success',
            icon: '✓',
            extra: `<strong>ID Servis:</strong> ${escapeHtml(result.data.ID)}`
        });

        if (printNow) {
            await printBon(result.data);
        }
        e.target.reset();
        
        // Switch to list tab
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.querySelector('[data-tab="list"]').classList.add('active');
        document.getElementById('list').classList.add('active');
        
        loadServis();
        loadDashboard();
    } catch (error) {
        console.error('Error saving servis:', error);
        showNotice({
            title: 'Gagal Menyimpan Data',
            message: error.message || 'Terjadi kendala saat menyimpan data customer baru.',
            type: 'danger',
            icon: '!'
        });
    }
});

const form = document.getElementById("login-form");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = form.username.value;
    const password = form.password.value;

    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username,
                password,
            }),
        });

        const data = await response.json();

        if (data.success) {
            alert("Login berhasil");
            window.location.href = "index.html";
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert("Server error");
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        if (getAuthToken()) {
            await apiFetch(`${API_URL}/logout`, { method: 'POST' });
        }
    } catch (error) {
        console.warn('Logout session already cleared:', error);
    } finally {
        clearAuth();
        servisData = [];
        renderTable(servisData);
        showLoginScreen();
    }
});

// Tab navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// Filter handlers
document.getElementById('search').addEventListener('input', loadServis);
document.getElementById('filter-status').addEventListener('change', loadServis);

// Dashboard stat cards (prevent unintended filtering when clicked)
// (previous implementation was adding click handlers somewhere else; currently we keep cards non-interactive)
// intentionally do nothing here


// Modal close
document.querySelector('.close').addEventListener('click', () => {
    document.getElementById('modal').classList.remove('show');
});

async function initApp() {
    if (!getAuthToken()) {
        showLoginScreen();
        return;
    }

    try {
        await apiFetch(`${API_URL}/session`);
        showAdminScreen();
        await Promise.all([loadDashboard(), loadServis()]);
    } catch (error) {
        clearAuth();
        showLoginScreen();
    }
}

// Initial load
initApp();
