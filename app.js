let deferredPrompt;
const pwaBanner = document.getElementById('pwa-banner');
const btnInstall = document.getElementById('btn-install');
const btnCloseBanner = document.getElementById('btn-close-banner');
const pwaBadge = document.getElementById('pwa-badge');

// Evento de captura para instalación PWA
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    pwaBanner.classList.remove('hidden');
});

btnInstall.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            pwaBanner.classList.add('hidden');
            pwaBadge.textContent = "PWA Instalada";
            pwaBadge.style.color = "#10b981";
        }
        deferredPrompt = null;
    }
});

btnCloseBanner.addEventListener('click', () => {
    pwaBanner.classList.add('hidden');
});

// ==========================================
// CONTROL DE VISTAS: ORDEN ACTIVA
// ==========================================
const offersContainer = document.getElementById('offers-container');
const tradeTabsSection = document.querySelector('.trade-tabs');
const filtersSection = document.querySelector('.filters');
const orderViewSection = document.getElementById('order-view');
const btnBack = document.getElementById('btn-back');

function abrirOrdenActiva(datosOferta) {
    if (tradeTabsSection) tradeTabsSection.classList.add('hidden');
    if (filtersSection) filtersSection.classList.add('hidden');
    if (offersContainer) offersContainer.classList.add('hidden');
    
    if (orderViewSection) orderViewSection.classList.remove('hidden');
    
    if (datosOferta) {
        document.getElementById('order-fiat-amount').textContent = `${datosOferta.montoFiat} Bs`;
        document.getElementById('order-crypto-amount').textContent = `${datosOferta.montoCrypto} USDT`;
        document.getElementById('order-rate').textContent = `${datosOferta.tasa} Bs / USDT`;
    }
}

if (btnBack) {
    btnBack.addEventListener('click', () => {
        if (orderViewSection) orderViewSection.classList.add('hidden');
        if (tradeTabsSection) tradeTabsSection.classList.remove('hidden');
        if (filtersSection) filtersSection.classList.remove('hidden');
        if (offersContainer) offersContainer.classList.remove('hidden');
    });
}

// Datos de prueba simulados para la interfaz
const mockOffers = [
    { id: 1, user: "0x89A...41F", ops: "48 ops", rep: "99%", amount: "50 USDT", rate: "45.20 Bs", net: "Polygon" },
    { id: 2, user: "0x32B...90E", ops: "12 ops", rep: "100%", amount: "20 USDT", rate: "45.10 Bs", net: "BSC" },
    { id: 3, user: "0x77C...11A", ops: "105 ops", rep: "98%", amount: "100 USDT", rate: "45.35 Bs", net: "Polygon" }
];

function renderOffers() {
    const container = document.getElementById('offers-container');
    container.innerHTML = "";
    
    mockOffers.forEach(o => {
        const card = document.createElement('div');
        card.className = "card-offer";
        card.innerHTML = `
            <div class="card-header">
                <div class="user-info">👤 ${o.user} <span class="reputation">★ ${o.rep} (${o.ops})</span></div>
                <span class="badge">${o.net}</span>
            </div>
            <div class="card-body">
                <div>
                    <div class="price">${o.rate} <span>/ USDT</span></div>
                    <div class="limits">Disponible: ${o.amount}</div>
                </div>
                <button class="btn-primary-sm" onclick="initTrade(${o.id})">Intercambiar</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// Función initTrade actualizada para abrir la orden activa
function initTrade(id) {
    const oferta = mockOffers.find(o => o.id === id);
    if (!oferta) return;

    const montoCryptoNum = parseFloat(oferta.amount);
    const tasaNum = parseFloat(oferta.rate);
    const montoFiatTotal = (montoCryptoNum * tasaNum).toFixed(2);

    const datosOferta = {
        montoFiat: montoFiatTotal,
        montoCrypto: montoCryptoNum.toFixed(2),
        tasa: tasaNum.toFixed(2)
    };

    abrirOrdenActiva(datosOferta);
}

// Control del Modal para publicar oferta
const modal = document.getElementById('modal-order');
document.getElementById('btn-new-order').addEventListener('click', () => modal.classList.remove('hidden'));
document.getElementById('btn-cancel-modal').addEventListener('click', () => modal.classList.add('hidden'));

document.getElementById('form-order').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = document.getElementById('order-amount').value;
    const rate = document.getElementById('order-rate').value;
    
    mockOffers.unshift({
        id: Date.now(),
        user: "0xMi...Wallet",
        ops: "0 ops",
        rep: "100%",
        amount: `${amount} USDT`,
        rate: `${rate} Bs`,
        net: "Polygon"
    });
    
    renderOffers();
    modal.classList.add('hidden');
    e.target.reset();
});

// Cargar al inicio
document.addEventListener('DOMContentLoaded', renderOffers);