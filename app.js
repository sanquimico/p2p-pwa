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
// CONTROL DEL TEMPORIZADOR DE LA ORDEN
// ==========================================
let orderTimerInterval = null;

function startOrderTimer(durationInSeconds = 1800) {
    if (orderTimerInterval) {
        clearInterval(orderTimerInterval);
    }

    let timer = durationInSeconds;
    const timerDisplay = document.getElementById('timer-display');
    if (!timerDisplay) return;

    updateTimerUI(timer, timerDisplay);

    orderTimerInterval = setInterval(() => {
        timer--;

        if (timer >= 0) {
            updateTimerUI(timer, timerDisplay);
        } else {
            clearInterval(orderTimerInterval);
            orderTimerInterval = null;
            handleOrderTimeout();
        }
    }, 1000);
}

function updateTimerUI(seconds, element) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(remainingSeconds).padStart(2, '0');

    element.textContent = `${formattedMinutes}:${formattedSeconds}`;
}

function handleOrderTimeout() {
    const statusText = document.getElementById('order-status-text');
    const statusBanner = document.querySelector('.order-status-banner');
    const btnMarkPaid = document.getElementById('btn-mark-paid');
    const btnDispute = document.getElementById('btn-dispute');

    if (statusText) {
        statusText.textContent = 'Orden expirada por tiempo agotado';
    }
    
    if (statusBanner) {
        statusBanner.style.backgroundColor = '#dc3545';
        statusBanner.style.color = '#fff';
    }

    if (btnMarkPaid) {
        btnMarkPaid.disabled = true;
        btnMarkPaid.style.opacity = '0.5';
    }

    if (btnDispute) {
        btnDispute.classList.remove('hidden');
    }

    alert('El tiempo límite de 30 minutos para realizar el pago ha expirado.');
}

function stopOrderTimer() {
    if (orderTimerInterval) {
        clearInterval(orderTimerInterval);
        orderTimerInterval = null;
    }
}

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

    // Inicia la cuenta regresiva al abrir la orden (1800s = 30 min)
    startOrderTimer(1800);
}

if (btnBack) {
    btnBack.addEventListener('click', () => {
        stopOrderTimer(); // Detiene el temporizador al salir de la orden
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

// Función initTrade robusta para limpiar textos y calcular sin errores (NaN)
function initTrade(id) {
    const oferta = mockOffers.find(o => o.id === id);
    if (!oferta) return;

    // Extraemos limpiamente solo los números ignorando "USDT", "Bs", etc.
    const montoCryptoNum = parseFloat(oferta.amount.replace(/[^0-9.]/g, ''));
    const tasaNum = parseFloat(oferta.rate.replace(/[^0-9.]/g, ''));
    
    const montoFiatTotal = (!isNaN(montoCryptoNum) && !isNaN(tasaNum)) 
        ? (montoCryptoNum * tasaNum).toFixed(2) 
        : "0.00";

    const datosOferta = {
        montoFiat: montoFiatTotal,
        montoCrypto: !isNaN(montoCryptoNum) ? montoCryptoNum.toFixed(2) : "0.00",
        tasa: !isNaN(tasaNum) ? tasaNum.toFixed(2) : "0.00"
    };

    abrirOrdenActiva(datosOferta);
}

// Control del Modal para publicar oferta (leyendo los inputs exclusivos del modal)
const modal = document.getElementById('modal-order');
document.getElementById('btn-new-order').addEventListener('click', () => modal.classList.remove('hidden'));
document.getElementById('btn-cancel-modal').addEventListener('click', () => modal.classList.add('hidden'));

document.getElementById('form-order').addEventListener('submit', (e) => {
    e.preventDefault();
    const amountInput = document.getElementById('modal-order-amount').value;
    const rateInput = document.getElementById('modal-order-rate').value;
    const networkInput = document.getElementById('modal-order-network').value; // Capturamos la red elegida
    
    mockOffers.unshift({
        id: Date.now(),
        user: "0xMi...Wallet",
        ops: "0 ops",
        rep: "100%",
        amount: `${amountInput} USDT`,
        rate: `${rateInput} Bs`,
        net: networkInput // Usamos la red seleccionada dinámicamente del select
    });
    
    renderOffers();
    modal.classList.add('hidden');
    e.target.reset();
});

// Cargar al inicio
document.addEventListener('DOMContentLoaded', renderOffers);

// ==========================================
// GESTIÓN DE ACTUALIZACIONES PWA (NO INTRUSIVA)
// ==========================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
        if (reg.waiting) {
            mostrarAvisoActualizacion(reg);
            return;
        }

        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    mostrarAvisoActualizacion(reg);
                }
            });
        });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    });
}

function mostrarAvisoActualizacion(reg) {
    if (document.getElementById('update-toast')) return;

    const toast = document.createElement('div');
    toast.id = 'update-toast';
    toast.innerHTML = `
        <div style="position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #1f2937; color: #fff; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; gap: 15px; z-index: 9999; border: 1px solid #374151; font-family: sans-serif; font-size: 14px;">
            <span>¡Nueva versión de P2P Escrow disponible!</span>
            <button id="btn-update-app" style="background: #10b981; color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-weight: bold;">Actualizar</button>
        </div>
    `;
    document.body.appendChild(toast);

    document.getElementById('btn-update-app').addEventListener('click', () => {
        if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    });
}

// ==========================================
// ACCIONES DE ORDEN (COMPRADOR Y VENDEDOR)
// ==========================================

// Acción: Marcar como pagado (Comprador)
function marcarComoPagado() {
    stopOrderTimer();

    const statusText = document.getElementById('order-status-text');
    const statusBanner = document.querySelector('.order-status-banner');
    const btnMarkPaid = document.getElementById('btn-mark-paid');
    const timerDisplay = document.getElementById('timer-display');

    if (statusText) {
        statusText.textContent = 'Pago realizado. Esperando confirmación del vendedor...';
    }

    if (statusBanner) {
        statusBanner.style.backgroundColor = '#d97706'; // Ámbar / Alerta moderada
        statusBanner.style.color = '#fff';
    }

    if (btnMarkPaid) {
        btnMarkPaid.disabled = true;
        btnMarkPaid.style.opacity = '0.5';
        btnMarkPaid.textContent = 'Pago Notificado';
    }

    if (timerDisplay) {
        timerDisplay.textContent = 'PAGADO';
    }

    alert('Has notificado el pago. El vendedor verificará sus cuentas para liberar los USDT.');
}

// Acción: Liberar Fondos (Vendedor)
function liberarFondos() {
    stopOrderTimer();

    const statusText = document.getElementById('order-status-text');
    const statusBanner = document.querySelector('.order-status-banner');
    const btnMarkPaid = document.getElementById('btn-mark-paid');
    const btnRelease = document.getElementById('btn-release-funds');
    const timerDisplay = document.getElementById('timer-display');

    if (statusText) {
        statusText.textContent = '¡Orden completada con éxito! USDT liberados al comprador.';
    }

    if (statusBanner) {
        statusBanner.style.backgroundColor = '#10b981'; // Verde éxito
        statusBanner.style.color = '#fff';
    }

    if (btnMarkPaid) {
        btnMarkPaid.disabled = true;
        btnMarkPaid.style.opacity = '0.5';
    }

    if (btnRelease) {
        btnRelease.disabled = true;
        btnRelease.style.opacity = '0.5';
        btnRelease.textContent = 'USDT Liberados';
    }

    if (timerDisplay) {
        timerDisplay.textContent = 'COMPLETADO';
    }

    alert('¡Fondos liberados exitosamente! La orden ha finalizado.');
}

// Acción: Abrir Disputa
function abrirDisputaOrden() {
    stopOrderTimer();

    const statusText = document.getElementById('order-status-text');
    const statusBanner = document.querySelector('.order-status-banner');
    const btnDispute = document.getElementById('btn-dispute');

    if (statusText) {
        statusText.textContent = 'Disputa abierta. Soporte intervendrá en la orden.';
    }

    if (statusBanner) {
        statusBanner.style.backgroundColor = '#dc3545'; // Rojo de alerta
        statusBanner.style.color = '#fff';
    }

    if (btnDispute) {
        btnDispute.disabled = true;
        btnDispute.style.opacity = '0.5';
    }

    alert('Se ha abierto una disputa. Un moderador revisará el caso.');
}

// Vincular los eventos de los botones de la orden
const btnMarkPaid = document.getElementById('btn-mark-paid');
const btnReleaseFunds = document.getElementById('btn-release-funds');
const btnDispute = document.getElementById('btn-dispute');

if (btnMarkPaid) {
    btnMarkPaid.addEventListener('click', marcarComoPagado);
}

if (btnReleaseFunds) {
    btnReleaseFunds.addEventListener('click', liberarFondos);
}

if (btnDispute) {
    btnDispute.addEventListener('click', abrirDisputaOrden);
}