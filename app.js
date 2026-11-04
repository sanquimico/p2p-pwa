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

// 60 segundos para pruebas rápidas (1800s = 30 min original guardado para producción)
function startOrderTimer(durationInSeconds = 60) {
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

    registrarEnHistorial("Expirada");
    alert('El tiempo límite para realizar el pago ha expirado.');
}

function stopOrderTimer() {
    if (orderTimerInterval) {
        clearInterval(orderTimerInterval);
        orderTimerInterval = null;
    }
}

// ==========================================
// CONTROL DE VISTAS: ORDEN ACTIVA & HISTORIAL
// ==========================================
const offersContainer = document.getElementById('offers-container');
const tradeTabsSection = document.querySelector('.trade-tabs');
const filtersSection = document.querySelector('.filters');
const orderViewSection = document.getElementById('order-view');
const btnBack = document.getElementById('btn-back');

let currentActiveOrder = null;
const orderHistory = [];

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

    // Inicia con 60s (prueba rápida) -> Usar 1800 para los 30 min reales en producción
    startOrderTimer(60); 
}

if (btnBack) {
    btnBack.addEventListener('click', () => {
        stopOrderTimer();
        if (orderViewSection) orderViewSection.classList.add('hidden');
        if (tradeTabsSection) tradeTabsSection.classList.remove('hidden');
        if (filtersSection) filtersSection.classList.remove('hidden');
        if (offersContainer) offersContainer.classList.remove('hidden');
    });
}

// Ofertas vacías para iniciar limpio (puedes agregar datos de prueba aquí si lo requieres de nuevo)
const mockOffers = [];

function renderOffers() {
    const container = document.getElementById('offers-container');
    if (!container) return;
    container.innerHTML = "";
    
    if (mockOffers.length === 0) {
        container.innerHTML = `<p style="color: #8b949e; font-size: 0.9rem; text-align: center; padding: 20px;">No hay ofertas publicadas en este momento. Publica una usando el botón superior.</p>`;
        return;
    }

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

function renderHistory() {
    const container = document.getElementById('history-container');
    if (!container) return;

    if (orderHistory.length === 0) {
        container.innerHTML = `<p style="color: #8b949e; font-size: 0.9rem;">No hay transacciones registradas en esta sesión.</p>`;
        return;
    }

    container.innerHTML = "";
    orderHistory.forEach(item => {
        const card = document.createElement('div');
        card.className = "card-offer";
        card.innerHTML = `
            <div class="card-header">
                <div class="user-info">📦 Orden #${item.id} <span class="reputation" style="color: ${item.color}">${item.status}</span></div>
                <span class="badge">${item.net}</span>
            </div>
            <div class="card-body">
                <div>
                    <div class="price">${item.rate} <span>/ USDT</span></div>
                    <div class="limits">Total: ${item.montoFiat} Bs (${item.montoCrypto} USDT)</div>
                </div>
                <span style="font-size: 0.85rem; color: #8b949e;">${item.fecha}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

function registrarEnHistorial(estado) {
    if (!currentActiveOrder) return;

    let colorStatus = "#10b981"; // Verde por defecto
    if (estado === "Expirada" || estado === "Disputa") colorStatus = "#dc3545"; // Rojo

    orderHistory.unshift({
        id: currentActiveOrder.id,
        user: currentActiveOrder.user,
        net: currentActiveOrder.net || "Polygon",
        montoCrypto: currentActiveOrder.montoCrypto,
        montoFiat: currentActiveOrder.montoFiat,
        rate: currentActiveOrder.tasa,
        status: estado,
        color: colorStatus,
        fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    renderHistory();
}

function initTrade(id) {
    const oferta = mockOffers.find(o => o.id === id);
    if (!oferta) return;

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

    currentActiveOrder = {
        id: oferta.id,
        user: oferta.user,
        net: oferta.net,
        montoCrypto: datosOferta.montoCrypto,
        montoFiat: datosOferta.montoFiat,
        tasa: datosOferta.tasa
    };

    abrirOrdenActiva(datosOferta);
}

// Control del Modal para publicar oferta
const modal = document.getElementById('modal-order');
const btnNewOrder = document.getElementById('btn-new-order');
const btnCancelModal = document.getElementById('btn-cancel-modal');

if (btnNewOrder && modal) {
    btnNewOrder.addEventListener('click', () => modal.classList.remove('hidden'));
}
if (btnCancelModal && modal) {
    btnCancelModal.addEventListener('click', () => modal.classList.add('hidden'));
}

const formOrder = document.getElementById('form-order');
if (formOrder) {
    formOrder.addEventListener('submit', (e) => {
        e.preventDefault();
        const amountInput = document.getElementById('modal-order-amount').value;
        const rateInput = document.getElementById('modal-order-rate').value;
        const networkInput = document.getElementById('modal-order-network').value;
        
        mockOffers.unshift({
            id: Date.now(),
            user: "0xMi...Wallet",
            ops: "0 ops",
            rep: "100%",
            amount: `${amountInput} USDT`,
            rate: `${rateInput} Bs`,
            net: networkInput
        });
        
        renderOffers();
        modal.classList.add('hidden');
        e.target.reset();
    });
}

document.addEventListener('DOMContentLoaded', renderOffers);

// ==========================================
// CONEXIÓN REAL DE WALLET (Web3 / MetaMask / Exodus)
// ==========================================
const btnConnect = document.getElementById('btn-connect');

if (btnConnect) {
    btnConnect.addEventListener('click', async () => {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                const account = accounts[0];
                const shortAccount = `${account.substring(0, 6)}...${account.substring(account.length - 4)}`;
                
                btnConnect.textContent = shortAccount;
                btnConnect.style.backgroundColor = '#10b981';
                btnConnect.style.borderColor = '#10b981';
                
                console.log("Wallet conectada con éxito:", account);
            } catch (error) {
                console.error("El usuario rechazó la conexión de la wallet:", error);
                alert("No se pudo conectar la wallet. Asegúrate de aprobar la solicitud.");
            }
        } else {
            alert("No se detectó ninguna wallet Web3 (como MetaMask o Exodus). Por favor instala una para conectar.");
        }
    });
}

// ==========================================
// GESTIÓN DE ACTUALIZACIONES PWA
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

function marcarComoPagado() {
    stopOrderTimer();
    const statusText = document.getElementById('order-status-text');
    const statusBanner = document.querySelector('.order-status-banner');
    const btnMarkPaid = document.getElementById('btn-mark-paid');
    const timerDisplay = document.getElementById('timer-display');

    if (statusText) statusText.textContent = 'Pago realizado. Esperando confirmación del vendedor...';
    if (statusBanner) {
        statusBanner.style.backgroundColor = '#d97706';
        statusBanner.style.color = '#fff';
    }
    if (btnMarkPaid) {
        btnMarkPaid.disabled = true;
        btnMarkPaid.style.opacity = '0.5';
        btnMarkPaid.textContent = 'Pago Notificado';
    }
    if (timerDisplay) timerDisplay.textContent = 'PAGADO';

    alert('Has notificado el pago. El vendedor verificará sus cuentas para liberar los USDT.');
}

function liberarFondos() {
    stopOrderTimer();
    const statusText = document.getElementById('order-status-text');
    const statusBanner = document.querySelector('.order-status-banner');
    const btnMarkPaid = document.getElementById('btn-mark-paid');
    const btnRelease = document.getElementById('btn-release-funds');
    const timerDisplay = document.getElementById('timer-display');

    if (statusText) statusText.textContent = '¡Orden completada con éxito! USDT liberados al comprador.';
    if (statusBanner) {
        statusBanner.style.backgroundColor = '#10b981';
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
    if (timerDisplay) timerDisplay.textContent = 'COMPLETADO';

    registrarEnHistorial("Completado");
    alert('¡Fondos liberados exitosamente! La orden ha finalizado.');
}

function abrirDisputaOrden() {
    stopOrderTimer();
    const statusText = document.getElementById('order-status-text');
    const statusBanner = document.querySelector('.order-status-banner');
    const btnDispute = document.getElementById('btn-dispute');

    if (statusText) statusText.textContent = 'Disputa abierta. Soporte intervendrá en la orden.';
    if (statusBanner) {
        statusBanner.style.backgroundColor = '#dc3545';
        statusBanner.style.color = '#fff';
    }
    if (btnDispute) {
        btnDispute.disabled = true;
        btnDispute.style.opacity = '0.5';
    }

    registrarEnHistorial("Disputa");
    alert('Se ha abierto una disputa. Un moderador revisará el caso.');
}

const btnMarkPaid = document.getElementById('btn-mark-paid');
const btnReleaseFunds = document.getElementById('btn-release-funds');
const btnDispute = document.getElementById('btn-dispute');

if (btnMarkPaid) btnMarkPaid.addEventListener('click', marcarComoPagado);
if (btnReleaseFunds) btnReleaseFunds.addEventListener('click', liberarFondos);
if (btnDispute) btnDispute.addEventListener('click', abrirDisputaOrden);

// ==========================================
// CONTROL DE PESTAÑAS (Comprar / Vender USDT)
// ==========================================
const tabBuy = document.getElementById('tab-buy');
const tabSell = document.getElementById('tab-sell');

if (tabBuy && tabSell) {
    tabBuy.addEventListener('click', () => {
        tabBuy.classList.add('active');
        tabSell.classList.remove('active');
        console.log("Cambiado a vista: Comprar USDT");
    });

    tabSell.addEventListener('click', () => {
        tabSell.classList.add('active');
        tabBuy.classList.remove('active');
        console.log("Cambiado a vista: Vender USDT");
    });
}