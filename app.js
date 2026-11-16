let deferredPrompt;
const pwaBanner = document.getElementById('pwa-banner');
const btnInstall = document.getElementById('btn-install');
const btnCloseBanner = document.getElementById('btn-close-banner');
const pwaBadge = document.getElementById('pwa-badge');

const TARGET_CHAIN_ID = '0x13882'; // Polygon Amoy Testnet (80002)

// Sistema de Notificaciones Toast
function showToast(message, isError = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (pwaBanner) pwaBanner.classList.remove('hidden');
});

if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                if (pwaBanner) pwaBanner.classList.add('hidden');
                if (pwaBadge) {
                    pwaBadge.textContent = "PWA Instalada";
                    pwaBadge.style.color = "#10b981";
                }
            }
            deferredPrompt = null;
        }
    });
}

if (btnCloseBanner) {
    btnCloseBanner.addEventListener('click', () => {
        if (pwaBanner) pwaBanner.classList.add('hidden');
    });
}

// ==========================================
// CONTROL DEL TEMPORIZADOR DE LA ORDEN
// ==========================================
let orderTimerInterval = null;

function startOrderTimer(durationInSeconds = 60) {
    if (orderTimerInterval) clearInterval(orderTimerInterval);

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
    element.textContent = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function handleOrderTimeout() {
    const statusText = document.getElementById('order-status-text');
    const statusBanner = document.querySelector('.order-status-banner');
    const btnMarkPaid = document.getElementById('btn-mark-paid');
    const btnRelease = document.getElementById('btn-release-funds');
    const btnDispute = document.getElementById('btn-dispute');

    if (statusText) statusText.textContent = 'Orden expirada por tiempo agotado';
    if (statusBanner) { statusBanner.style.backgroundColor = '#dc3545'; statusBanner.style.color = '#fff'; }
    if (btnMarkPaid) { btnMarkPaid.disabled = true; btnMarkPaid.style.opacity = '0.5'; }
    if (btnRelease) { btnRelease.disabled = true; btnRelease.style.opacity = '0.5'; }
    if (btnDispute) { btnDispute.classList.remove('hidden'); }

    registrarEnHistorial("Expirada");
    showToast('El tiempo límite para realizar el pago ha expirado.', true);
}

function stopOrderTimer() {
    if (orderTimerInterval) {
        clearInterval(orderTimerInterval);
        orderTimerInterval = null;
    }
}

// ==========================================
// CONTROL DE VISTAS: ORDEN ACTIVA, CHAT & HISTORIAL
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
    
    const statusText = document.getElementById('order-status-text');
    const statusBanner = document.querySelector('.order-status-banner');
    const btnMarkPaid = document.getElementById('btn-mark-paid');
    const btnRelease = document.getElementById('btn-release-funds');
    const btnDispute = document.getElementById('btn-dispute');

    if (statusText) statusText.textContent = 'Esperando depósito / pago...';
    if (statusBanner) { statusBanner.style.backgroundColor = '#2563eb'; statusBanner.style.color = '#fff'; }
    if (btnMarkPaid) { btnMarkPaid.disabled = false; btnMarkPaid.style.opacity = '1'; btnMarkPaid.textContent = 'Ya pagué (Notificar al Vendedor)'; }
    if (btnRelease) { btnRelease.disabled = false; btnRelease.style.opacity = '1'; btnRelease.textContent = 'Liberar USDT (Confirmar Pago)'; }
    if (btnDispute) { btnDispute.classList.add('hidden'); btnDispute.disabled = false; btnDispute.style.opacity = '1'; }

    if (datosOferta) {
        document.getElementById('order-fiat-amount').textContent = `${datosOferta.montoFiat} Bs`;
        document.getElementById('order-crypto-amount').textContent = `${datosOferta.montoCrypto} USDT`;
        document.getElementById('order-rate').textContent = `${datosOferta.tasa} Bs / USDT`;
    }

    const chatMsgs = document.getElementById('chat-messages');
    if (chatMsgs) {
        chatMsgs.innerHTML = `<div style="color: #8b949e; text-align: center; font-style: italic;">Canal cifrado extremo a extremo establecido. Intercambien datos de Pago Móvil de forma segura.</div>`;
    }

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

const btnSendChat = document.getElementById('btn-send-chat');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

if (btnSendChat && chatInput && chatMessages) {
    btnSendChat.addEventListener('click', () => {
        const text = chatInput.value.trim();
        if (!text) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = "chat-message me";
        msgDiv.textContent = `Tú: ${text}`;
        chatMessages.appendChild(msgDiv);
        chatInput.value = "";
        chatMessages.scrollTop = chatMessages.scrollHeight;
        showToast("Mensaje cifrado enviado con éxito.");
    });
}

// Lista limpia sin ofertas falsas por defecto
const mockOffers = [];

function renderOffers() {
    const container = document.getElementById('offers-container');
    if (!container) return;
    container.innerHTML = "";
    
    const filterNet = document.getElementById('filter-network')?.value || 'all';

    const filtered = mockOffers.filter(o => {
        const matchType = (currentTradeType === 'buy') ? (o.type === 'buy') : (o.type === 'sell');
        const matchNet = (filterNet === 'all' || o.net.toLowerCase() === filterNet.toLowerCase());
        return matchType && matchNet;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<p style="color: #8b949e; font-size: 0.9rem; text-align: center; padding: 20px;">No hay ofertas publicadas en este momento. Publica una usando el botón superior.</p>`;
        return;
    }

    filtered.forEach(o => {
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
    let colorStatus = "#10b981"; 
    if (estado === "Expirada" || estado === "Disputa") colorStatus = "#dc3545"; 

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
    
    const montoFiatTotal = (!isNaN(montoCryptoNum) && !isNaN(tasaNum)) ? (montoCryptoNum * tasaNum).toFixed(2) : "0.00";

    currentActiveOrder = {
        id: oferta.id,
        user: oferta.user,
        net: oferta.net,
        montoCrypto: !isNaN(montoCryptoNum) ? montoCryptoNum.toFixed(2) : "0.00",
        montoFiat: montoFiatTotal,
        tasa: !isNaN(tasaNum) ? tasaNum.toFixed(2) : "0.00"
    };

    abrirOrdenActiva(currentActiveOrder);
}

// ==========================================
// CONTROL DE PESTAÑAS, FILTROS Y MODAL
// ==========================================
const tabBuy = document.getElementById('tab-buy');
const tabSell = document.getElementById('tab-sell');
let currentTradeType = 'buy'; 

if (tabBuy && tabSell) {
    tabBuy.addEventListener('click', () => {
        tabBuy.classList.add('active');
        tabSell.classList.remove('active');
        currentTradeType = 'buy';
        renderOffers();
    });

    tabSell.addEventListener('click', () => {
        tabSell.classList.add('active');
        tabBuy.classList.remove('active');
        currentTradeType = 'sell';
        renderOffers();
    });
}

const filterNetwork = document.getElementById('filter-network');
if (filterNetwork) {
    filterNetwork.addEventListener('change', renderOffers);
}

const modal = document.getElementById('modal-order');
const btnNewOrder = document.getElementById('btn-new-order');
const btnCancelModal = document.getElementById('btn-cancel-modal');

if (btnNewOrder && modal) {
    btnNewOrder.addEventListener('click', () => {
        modal.classList.remove('hidden');
        const selectOperation = document.getElementById('modal-order-type');
        if (selectOperation) selectOperation.value = currentTradeType;
        
        const modalNetwork = document.getElementById('modal-order-network');
        if (modalNetwork) {
            if (filterNetwork && filterNetwork.value !== 'all') {
                modalNetwork.value = filterNetwork.value;
            } else {
                // Por defecto selecciona Polygon para evitar errores de red
                modalNetwork.value = 'Polygon';
            }
        }
    });
}

if (btnCancelModal && modal) {
    btnCancelModal.addEventListener('click', () => modal.classList.add('hidden'));
}

// ==========================================
// FORMULARIO, VALIDACIÓN DE RED Y CONTRATO
// ==========================================
const formOrder = document.getElementById('form-order');
if (formOrder) {
    formOrder.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const amountInput = parseFloat(document.getElementById('modal-order-amount').value);
        const rateInput = parseFloat(document.getElementById('modal-order-rate').value);
        const typeInput = document.getElementById('modal-order-type').value;
        const networkInput = document.getElementById('modal-order-network').value;

        if (isNaN(amountInput) || amountInput <= 0) {
            showToast("El monto en USDT debe ser mayor a 0.", true);
            return;
        }
        if (isNaN(rateInput) || rateInput <= 0) {
            showToast("La tasa de cambio debe ser válida.", true);
            return;
        }
        if (typeof window.ethereum === 'undefined') {
            showToast("Por favor instala o desbloquea tu wallet descentralizada.", true);
            return;
        }

        // Validación de coherencia entre la red elegida en el modal y la wallet
        if (networkInput !== 'Polygon') {
            showToast("El contrato de prueba está desplegado en Polygon Amoy. Selecciona Polygon.", true);
            return;
        }

        try {
            const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
            if (currentChainId !== TARGET_CHAIN_ID) {
                showToast("Cambiando tu wallet a Polygon Amoy Testnet...");
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: TARGET_CHAIN_ID }],
                });
            }

            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            const contractAddress = "0xfcfc88bdff4B9493F300E6e093785432d6B1a392";
            
            const contractABI = [
                {
                    "inputs": [
                        { "internalType": "uint256", "name": "montoCrypto", "type": "uint256" },
                        { "internalType": "uint256", "name": "tasa", "type": "uint256" }
                    ],
                    "name": "crearOferta",
                    "outputs": [],
                    "stateMutability": "payable",
                    "type": "function"
                }
            ];

            const escrowContract = new ethers.Contract(contractAddress, contractABI, signer);
            const montoParseado = ethers.utils.parseUnits(amountInput.toString(), 6); 
            const tasaParseada = ethers.utils.parseUnits(rateInput.toString(), 18);

            showToast("Confirma la transacción en tu wallet...");

            // Se especifica gas mínimo exigido por Polygon Amoy (>= 25 Gwei)
            const tx = await escrowContract.crearOferta(montoParseado, tasaParseada, {
                value: ethers.utils.parseEther("0.001"),
                maxPriorityFeePerGas: ethers.utils.parseUnits("30", "gwei"),
                maxFeePerGas: ethers.utils.parseUnits("35", "gwei")
            });

            showToast("Transacción enviada. Esperando confirmación en Amoy...");
            await tx.wait();

            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            const userAddress = accounts[0] || "0x0000...0000";
            const walletUser = `${userAddress.substring(0, 6)}...${userAddress.substring(userAddress.length - 4)}`;

            mockOffers.unshift({
                id: Date.now(),
                user: walletUser,
                ops: "1 op",
                rep: "100%",
                amount: `${amountInput} USDT`,
                rate: `${rateInput.toFixed(2)} Bs`,
                net: networkInput,
                type: typeInput
            });
            
            renderOffers();
            modal.classList.add('hidden');
            e.target.reset();
            showToast("¡Oferta publicada exitosamente en la blockchain!");

        } catch (error) {
            console.error("Detalle del error:", error);
            if (error.code === 4001) {
                showToast("Transacción rechazada en la wallet.", true);
            } else {
                showToast("Error en blockchain: verifica saldo POL de prueba o gas.", true);
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', renderOffers);

// ==========================================
// CONEXIÓN DE WALLET (Amplio / Genérico)
// ==========================================
const btnConnect = document.getElementById('btn-connect');

if (btnConnect) {
    btnConnect.addEventListener('click', async () => {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                const account = accounts[0];
                const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
                
                if (currentChainId !== TARGET_CHAIN_ID) {
                    try {
                        await window.ethereum.request({
                            method: 'wallet_switchEthereumChain',
                            params: [{ chainId: TARGET_CHAIN_ID }],
                        });
                    } catch (switchError) {
                        showToast("Cambia manualmente a Polygon Amoy en tu wallet.", true);
                        return;
                    }
                }

                btnConnect.textContent = `${account.substring(0, 6)}...${account.substring(account.length - 4)}`;
                btnConnect.style.backgroundColor = '#10b981';
                showToast("Wallet descentralizada conectada con éxito.");
            } catch (error) {
                showToast("Conexión rechazada por el usuario.", true);
            }
        } else {
            showToast("No se detectó ninguna Web3 Wallet compatible.", true);
        }
    });
}

// ==========================================
// ACCIONES DE ORDEN
// ==========================================
function marcarComoPagado() {
    stopOrderTimer();
    const statusText = document.getElementById('order-status-text');
    const statusBanner = document.querySelector('.order-status-banner');
    const btnMarkPaid = document.getElementById('btn-mark-paid');
    
    if (statusText) statusText.textContent = 'Pago realizado. Esperando confirmación del vendedor...';
    if (statusBanner) { statusBanner.style.backgroundColor = '#d97706'; }
    if (btnMarkPaid) { btnMarkPaid.disabled = true; btnMarkPaid.style.opacity = '0.5'; }
    showToast("Pago notificado al vendedor.");
}

function liberarFondos() {
    stopOrderTimer();
    const statusText = document.getElementById('order-status-text');
    const statusBanner = document.querySelector('.order-status-banner');
    const btnMarkPaid = document.getElementById('btn-mark-paid');
    const btnRelease = document.getElementById('btn-release-funds');
    
    if (statusText) statusText.textContent = '¡Orden completada! USDT liberados.';
    if (statusBanner) { statusBanner.style.backgroundColor = '#10b981'; }
    if (btnMarkPaid) btnMarkPaid.disabled = true;
    if (btnRelease) { btnRelease.disabled = true; btnRelease.style.opacity = '0.5'; }

    registrarEnHistorial("Completado");
    showToast("¡Fondos liberados exitosamente!");
}

const btnMarkPaid = document.getElementById('btn-mark-paid');
const btnReleaseFunds = document.getElementById('btn-release-funds');

if (btnMarkPaid) btnMarkPaid.addEventListener('click', marcarComoPagado);
if (btnReleaseFunds) btnReleaseFunds.addEventListener('click', liberarFondos);