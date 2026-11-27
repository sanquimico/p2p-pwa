// ============================================================================
// CONFIGURACIÓN GENERAL DEL CONTRATO Y RED POLYGON AMOY
// ============================================================================

// Dirección desplegada del contrato Escrow en Polygon Amoy Testnet
const ESCROW_CONTRACT_ADDRESS = "0xA3266d32A130cd803abC22dDbbE16f10F8a852D8";

// Identificadores de red para Polygon Amoy (80002 decimal = 0x13882 hexadecimal)
const AMOY_CHAIN_ID = 80002;
const AMOY_CHAIN_ID_HEX = "0x13882";

// Clave en localStorage para conservar el historial de órdenes entre recargas
const HISTORY_STORAGE_KEY = "p2p_escrow_history_amoy";

// Parámetros de gas sugeridos para transacciones en Amoy (gasLimit fijo + 30 gwei prioridad / 35 gwei tope)
const AMOY_GAS_OVERRIDES = {
    gasLimit: 300000,
    maxPriorityFeePerGas: ethers.utils.parseUnits("30", "gwei"),
    maxFeePerGas: ethers.utils.parseUnits("35", "gwei")
};

// Interfaz mínima (ABI legible) de las funciones que consume la PWA
const ESCROW_ABI = [
    "function offerCount() view returns (uint256)",
    "function offers(uint256) view returns (uint256 id, address seller, address buyer, uint256 amountUSDT, uint256 rateBs, uint8 status, uint256 createdAt)",
    "function createOffer(uint256 _amountUSDT, uint256 _rateBs) payable returns (uint256)",
    "function takeOffer(uint256 _offerId) payable",
    "function markPaid(uint256 _offerId)",
    "function releaseFunds(uint256 _offerId)",
    "function openDispute(uint256 _offerId)",
    "function resolveDispute(uint256 _offerId, bool _releaseToBuyer)"
];

// ============================================================================
// ESTADO DE SESIÓN, BLOCKCHAIN Y UI
// ============================================================================

let provider = null;
let signer = null;
let contract = null;
let currentAccount = null;
let activeOffers = [];
let currentOrderContext = null;
let orderHistory = loadHistoryFromStorage();
let orderTimerInterval = null;
let remainingSeconds = 120;
let isRefreshingOffers = false;

// Referencias a elementos del DOM según los IDs reales de index.html
const btnConnect = document.getElementById("btn-connect");
const pwaBadge = document.getElementById("pwa-badge");
const btnNewOrder = document.getElementById("btn-new-order");
const modalOrder = document.getElementById("modal-order");
const btnCancelModal = document.getElementById("btn-cancel-modal");
const formOrder = document.getElementById("form-order");
const offersContainer = document.getElementById("offers-container");
const historyContainer = document.getElementById("history-container");
const tradeTabsSection = document.querySelector(".trade-tabs");
const filtersSection = document.querySelector(".filters");
const historySection = document.querySelector(".history-section");
const orderView = document.getElementById("order-view");
const btnBack = document.getElementById("btn-back");

// ============================================================================
// UTILIDADES DE NOTIFICACIÓN, PERSISTENCIA Y FORMATO
// ============================================================================

// Muestra notificaciones flotantes no bloqueantes en pantalla
function showToast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.style.cssText = "position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:340px;";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const bgMap = {
        info: "#1f6feb",
        success: "#198754",
        warning: "#b45309",
        error: "#dc3545"
    };
    toast.style.cssText = `background:${bgMap[type] || bgMap.info};color:#fff;padding:10px 14px;border-radius:8px;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.35);`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 4200);
}

// Carga el historial guardado en localStorage para que sobreviva a recargas
function loadHistoryFromStorage() {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.warn("No se pudo leer el historial desde localStorage:", err);
        return [];
    }
}

// Persiste el arreglo orderHistory en localStorage
function saveHistoryToStorage() {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(orderHistory));
    } catch (err) {
        console.warn("No se pudo guardar el historial en localStorage:", err);
    }
}

// Acorta direcciones EVM para mostrarlas de forma compacta en la interfaz
function formatShortAddress(addr) {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ============================================================================
// TEMPORIZADOR Y CONTROL DE BOTONES EN LA VISTA DE ORDEN
// ============================================================================

// Detiene cualquier intervalo activo del temporizador
function stopOrderTimer() {
    if (orderTimerInterval) {
        clearInterval(orderTimerInterval);
        orderTimerInterval = null;
    }
}

// Escribe un texto directo en el contador (por ejemplo "02:00" o "--:--")
function setTimerDisplayText(text) {
    const timerDisplay = document.getElementById("timer-display");
    if (timerDisplay) {
        timerDisplay.textContent = text;
    }
}

// Inicia la cuenta regresiva para una orden activa
function startOrderTimer(seconds = 120) {
    stopOrderTimer();
    remainingSeconds = seconds;

    const renderTime = () => {
        const mins = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
        const secs = String(remainingSeconds % 60).padStart(2, "0");
        setTimerDisplayText(`${mins}:${secs}`);
    };

    renderTime();
    orderTimerInterval = setInterval(() => {
        if (remainingSeconds > 0) {
            remainingSeconds -= 1;
            renderTime();
        } else {
            stopOrderTimer();
            setTimerDisplayText("00:00");
            const statusText = document.getElementById("order-status-text");
            if (statusText && currentOrderContext && !currentOrderContext.completada && !currentOrderContext.enDisputa) {
                statusText.textContent = "Tiempo de ventana agotado — verifica estado o abre disputa si aplica.";
            }
        }
    }, 1000);
}

// Bloquea o habilita los botones de acción de la orden según su estado
function setOrderButtonsLocked(locked, isCompleted = false) {
    const btnMarkPaid = document.getElementById("btn-mark-paid");
    const btnRelease = document.getElementById("btn-release-funds");
    const btnDispute = document.getElementById("btn-dispute");
    const buttons = [btnMarkPaid, btnRelease, btnDispute];

    buttons.forEach((btn) => {
        if (!btn) return;
        btn.disabled = Boolean(locked);
        btn.style.opacity = locked ? "0.5" : "1";
        btn.style.cursor = locked ? "not-allowed" : "pointer";
        if (locked && isCompleted) {
            btn.classList.add("hidden");
        }
    });
}

// Muestra u oculta botones clave según si la cuenta conectada es vendedor o comprador
function aplicarVisibilidadPorRol(datosOferta) {
    const btnMarkPaid = document.getElementById("btn-mark-paid");
    const btnRelease = document.getElementById("btn-release-funds");
    const btnDispute = document.getElementById("btn-dispute");

    if (!btnMarkPaid || !btnRelease || !btnDispute) return;

    btnMarkPaid.classList.remove("hidden");
    btnRelease.classList.remove("hidden");
    btnDispute.classList.remove("hidden");

    const acct = (currentAccount || "").toLowerCase();
    const seller = (datosOferta?.seller || "").toLowerCase();
    const buyer = (datosOferta?.buyer || "").toLowerCase();

    // El vendedor no debe marcar "Ya pagué" sobre su propia venta; el comprador no libera fondos
    if (acct && seller && acct === seller && acct !== buyer) {
        btnMarkPaid.classList.add("hidden");
    } else if (acct && buyer && acct === buyer && acct !== seller) {
        btnRelease.classList.add("hidden");
    }
}

// ============================================================================
// HISTORIAL EN MEMORIA + LOCALSTORAGE
// ============================================================================

// Inserta o actualiza una orden en el historial y guarda en localStorage
function upsertHistoryEntry(entry) {
    const idx = orderHistory.findIndex((item) => String(item.offerId) === String(entry.offerId));
    if (idx >= 0) {
        orderHistory[idx] = { ...orderHistory[idx], ...entry };
    } else {
        orderHistory.unshift(entry);
    }
    saveHistoryToStorage();
    renderHistory();
}

// Renderiza el historial dentro de #history-container
function renderHistory() {
    if (!historyContainer) return;
    if (!orderHistory.length) {
        historyContainer.innerHTML = `<p style="color:#8b949e;font-size:0.9rem;">No hay transacciones registradas en esta sesión.</p>`;
        return;
    }

    historyContainer.innerHTML = orderHistory.map((item) => `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
            <div>
                <strong>Oferta #${item.offerId}</strong> · ${item.montoCrypto} USDT @ ${item.tasa} Bs (${item.montoFiat} Bs)
                <div style="font-size:12px;color:#8b949e;">${item.fecha || ""}</div>
            </div>
            <span style="padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;background:#21262d;color:#fff;">
                ${item.estado}
            </span>
        </div>
    `).join("");
}

// ============================================================================
// CONEXIÓN CON METAMASK Y LECTURA DEL CONTRATO EN AMOY
// ============================================================================

// Traduce el código numérico de estado del contrato a etiquetas de interfaz
function mapContractStatus(statusCode) {
    const code = Number(statusCode);
    switch (code) {
        case 0: return { label: "Activa", enDisputa: false, completada: false };
        case 1: return { label: "En Proceso", enDisputa: false, completada: false };
        case 2: return { label: "Completada", enDisputa: false, completada: true };
        case 3: return { label: "En Disputa", enDisputa: true, completada: false };
        case 4: return { label: "Cancelada", enDisputa: false, completada: true };
        default: return { label: "Activa", enDisputa: false, completada: false };
    }
}

// Actualiza textos de cuenta en la cabecera y reevalúa visibilidad por rol si hay orden abierta
function syncWalletUI(account) {
    currentAccount = account || null;
    if (btnConnect) {
        btnConnect.textContent = currentAccount ? formatShortAddress(currentAccount) : "Conectar Wallet";
    }
    if (pwaBadge && currentAccount) {
        pwaBadge.textContent = "Amoy";
    }
    if (currentOrderContext && orderView && !orderView.classList.contains("hidden")) {
        aplicarVisibilidadPorRol(currentOrderContext);
    }
}

// Verifica que MetaMask esté en Polygon Amoy (80002) e inicializa ethers provider/signer/contract
async function ensureAmoyNetwork() {
    if (!window.ethereum) {
        throw new Error("MetaMask no detectado");
    }

    const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    if (parseInt(chainIdHex, 16) !== AMOY_CHAIN_ID) {
        try {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: AMOY_CHAIN_ID_HEX }]
            });
        } catch (switchError) {
            if (switchError.code === 4902) {
                await window.ethereum.request({
                    method: "wallet_addEthereumChain",
                    params: [{
                        chainId: AMOY_CHAIN_ID_HEX,
                        chainName: "Polygon Amoy Testnet",
                        nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
                        rpcUrls: ["https://rpc-amoy.polygon.technology/"],
                        blockExplorerUrls: ["https://amoy.polygonscan.com/"]
                    }]
                });
            } else {
                throw switchError;
            }
        }
    }

    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    contract = new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);
}

// Conecta o consulta la cuenta activa en MetaMask (silent=true evita popups al cargar)
async function conectarWallet(silent = false) {
    if (!window.ethereum) {
        if (!silent) showToast("Instala o habilita MetaMask para operar en Polygon Amoy.", "warning");
        return;
    }

    try {
        const method = silent ? "eth_accounts" : "eth_requestAccounts";
        const accounts = await window.ethereum.request({ method });
        if (accounts && accounts.length > 0) {
            syncWalletUI(accounts[0]);
            await ensureAmoyNetwork();
            await cargarOfertasBlockchain();
        } else {
            syncWalletUI(null);
            if (!silent) showToast("No se seleccionó ninguna cuenta en MetaMask.", "warning");
        }
    } catch (err) {
        console.error("Error al conectar wallet:", err);
        if (!silent) showToast("No se pudo conectar la wallet o cambiar a Amoy.", "error");
    }
}

// Lee las ofertas almacenadas en el contrato P2PEscrow en Polygon Amoy
async function cargarOfertasBlockchain() {
    if (isRefreshingOffers) return;
    isRefreshingOffers = true;

    try {
        if (!window.ethereum) return;
        const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
        if (parseInt(chainIdHex, 16) !== AMOY_CHAIN_ID) return;

        const readProvider = provider || new ethers.providers.Web3Provider(window.ethereum);
        const readContract = new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, readProvider);
        const countBN = await readContract.offerCount();
        const total = countBN.toNumber();
        const loaded = [];

        for (let i = 1; i <= total; i++) {
            const raw = await readContract.offers(i);
            const statusInfo = mapContractStatus(raw.status);
            const montoCrypto = Number(ethers.utils.formatUnits(raw.amountUSDT, 0));
            const tasa = Number(ethers.utils.formatUnits(raw.rateBs, 0));
            loaded.push({
                offerId: raw.id.toString(),
                seller: raw.seller,
                buyer: raw.buyer,
                montoCrypto,
                tasa,
                montoFiat: (montoCrypto * tasa).toFixed(2),
                statusCode: Number(raw.status),
                estadoLabel: statusInfo.label,
                enDisputa: statusInfo.enDisputa,
                completada: statusInfo.completada
            });
        }

        activeOffers = loaded;
        renderOffers();
    } catch (err) {
        console.warn("No se pudieron cargar ofertas desde Amoy:", err.message || err);
    } finally {
        isRefreshingOffers = false;
    }
}

// Dibuja las ofertas activas en #offers-container
function renderOffers() {
    if (!offersContainer) return;
    const visibleOffers = activeOffers.filter((o) => !o.completada);

    if (!visibleOffers.length) {
        offersContainer.innerHTML = `<p style="color:#8b949e;text-align:center;padding:16px;">No hay ofertas activas en el contrato en este momento. Publica una usando el botón superior.</p>`;
        return;
    }

    offersContainer.innerHTML = visibleOffers.map((offer, idx) => `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
            <div>
                <div style="font-size:13px;color:#8b949e;margin-bottom:4px;">
                    ${formatShortAddress(offer.seller)} · <span style="color:${offer.enDisputa ? "#f87171" : "#34d399"};">${offer.estadoLabel}</span>
                </div>
                <div style="font-size:20px;font-weight:700;">${offer.tasa} Bs <span style="font-size:13px;font-weight:400;color:#8b949e;">/ USDT</span></div>
                <div style="font-size:13px;color:#8b949e;">Disponible: ${offer.montoCrypto} USDT · Oferta #${offer.offerId}</div>
            </div>
            <button onclick="abrirOrdenDesdeLista(${idx})" style="background:#10b981;color:#fff;border:none;padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer;">
                Intercambiar
            </button>
        </div>
    `).join("");
}

// Helper global invocado desde los botones de cada oferta renderizada
window.abrirOrdenDesdeLista = function (index) {
    const visibleOffers = activeOffers.filter((o) => !o.completada);
    const offer = visibleOffers[index];
    if (!offer) return;
    abrirOrdenActiva(offer);
};

// ============================================================================
// NAVEGACIÓN ENTRE MERCADO Y ORDEN ACTIVA
// ============================================================================

// Abre la vista detallada de una orden y ajusta estado, temporizador y rol
function abrirOrdenActiva(datosOferta) {
    currentOrderContext = { ...datosOferta };

    if (tradeTabsSection) tradeTabsSection.classList.add("hidden");
    if (filtersSection) filtersSection.classList.add("hidden");
    if (offersContainer) offersContainer.classList.add("hidden");
    if (historySection) historySection.classList.add("hidden");
    if (orderView) orderView.classList.remove("hidden");

    const statusText = document.getElementById("order-status-text");
    const statusBanner = document.querySelector(".order-status-banner");
    const btnMarkPaid = document.getElementById("btn-mark-paid");
    const btnRelease = document.getElementById("btn-release-funds");

    const estaEnDisputa = Boolean(datosOferta?.enDisputa);
    const estaCompletada = Boolean(datosOferta?.completada);

    if (btnMarkPaid) btnMarkPaid.textContent = "Ya pagué (Notificar al Vendedor)";
    if (btnRelease) btnRelease.textContent = "Liberar USDT (Confirmar Pago)";

    aplicarVisibilidadPorRol(datosOferta);

    if (estaCompletada) {
        stopOrderTimer();
        setTimerDisplayText("--:--");
        if (statusText) statusText.textContent = "¡Orden completada! Fondos liberados y comisión 1% transferida.";
        if (statusBanner) { statusBanner.style.backgroundColor = "#10b981"; statusBanner.style.color = "#fff"; }
        setOrderButtonsLocked(true, true);
    } else if (estaEnDisputa) {
        stopOrderTimer();
        setTimerDisplayText("--:--");
        if (statusText) statusText.textContent = "⚠️ Orden en Disputa Arbitral (Congelada)";
        if (statusBanner) { statusBanner.style.backgroundColor = "#dc3545"; statusBanner.style.color = "#fff"; }
        setOrderButtonsLocked(true, false);
    } else {
        if (statusText) statusText.textContent = "Esperando depósito / pago (Comisión 1% incluida)...";
        if (statusBanner) { statusBanner.style.backgroundColor = "#2563eb"; statusBanner.style.color = "#fff"; }
        setOrderButtonsLocked(false, false);
        startOrderTimer(120);
    }

    if (datosOferta) {
        const fiatEl = document.getElementById("order-fiat-amount");
        const cryptoEl = document.getElementById("order-crypto-amount");
        const rateEl = document.getElementById("order-rate");
        if (fiatEl) fiatEl.textContent = `${datosOferta.montoFiat} Bs`;
        if (cryptoEl) cryptoEl.textContent = `${datosOferta.montoCrypto} USDT`;
        if (rateEl) rateEl.textContent = `${datosOferta.tasa} Bs / USDT`;
    }

    const chatMsgs = document.getElementById("chat-messages");
    if (chatMsgs) {
        chatMsgs.innerHTML = `<div style="color:#8b949e;text-align:center;font-style:italic;">Canal cifrado extremo a extremo establecido. Intercambien datos de Pago Móvil de forma segura.</div>`;
    }
}

// Regresa desde la vista de orden hacia la lista principal de ofertas
function volverAlMercado() {
    stopOrderTimer();
    currentOrderContext = null;
    if (orderView) orderView.classList.add("hidden");
    if (tradeTabsSection) tradeTabsSection.classList.remove("hidden");
    if (filtersSection) filtersSection.classList.remove("hidden");
    if (offersContainer) offersContainer.classList.remove("hidden");
    if (historySection) historySection.classList.remove("hidden");
    cargarOfertasBlockchain();
}

// ============================================================================
// ACCIONES SOBRE EL SMART CONTRACT (CREAR, PAGAR, LIBERAR, DISPUTAR)
// ============================================================================

// Publica una nueva oferta llamando a createOffer en el contrato
async function publicarOferta(event) {
    if (event) event.preventDefault();

    const amountInput = document.getElementById("modal-order-amount");
    const rateInput = document.getElementById("modal-order-rate");
    const amountUSDT = parseInt(amountInput?.value || "0", 10);
    const rateBs = parseInt(rateInput?.value || "0", 10);

    if (!amountUSDT || amountUSDT <= 0 || !rateBs || rateBs <= 0) {
        showToast("Ingresa montos y tasa enteros mayores que cero.", "warning");
        return;
    }

    try {
        await ensureAmoyNetwork();
        showToast("Confirma la garantía en tu wallet...", "info");
        const tx = await contract.createOffer(amountUSDT, rateBs, {
            ...AMOY_GAS_OVERRIDES,
            value: ethers.utils.parseEther("0.001")
        });
        showToast("Transacción enviada. Esperando confirmación en Amoy...", "info");
        await tx.wait();
        showToast("Oferta publicada correctamente.", "success");
        if (modalOrder) modalOrder.classList.add("hidden");
        await cargarOfertasBlockchain();
    } catch (err) {
        console.error("Error al publicar oferta:", err);
        showToast("Error en blockchain: verifica saldo POL de prueba, red Amoy o cola pendiente.", "error");
    }
}

// Marca la orden como pagada por el comprador
async function marcarComoPagado() {
    if (!currentOrderContext?.offerId) return;
    try {
        await ensureAmoyNetwork();
        const tx = await contract.markPaid(currentOrderContext.offerId, AMOY_GAS_OVERRIDES);
        showToast("Notificando pago en blockchain...", "info");
        await tx.wait();
        const statusText = document.getElementById("order-status-text");
        if (statusText) statusText.textContent = "Pago marcado como enviado. Esperando liberación del vendedor...";
        showToast("Pago notificado correctamente.", "success");
    } catch (err) {
        console.error("Error en markPaid:", err);
        showToast("No se pudo marcar como pagado en esta red.", "error");
    }
}

// Libera los fondos de la orden y registra el cierre en el historial persistente
async function liberarFondos() {
    if (!currentOrderContext?.offerId) return;
    try {
        await ensureAmoyNetwork();
        const tx = await contract.releaseFunds(currentOrderContext.offerId, AMOY_GAS_OVERRIDES);
        showToast("Liberando fondos en Amoy...", "info");
        await tx.wait();

        stopOrderTimer();
        setTimerDisplayText("--:--");
        currentOrderContext.completada = true;

        const statusText = document.getElementById("order-status-text");
        const statusBanner = document.querySelector(".order-status-banner");
        if (statusText) statusText.textContent = "¡Orden completada! Fondos liberados y comisión 1% transferida.";
        if (statusBanner) { statusBanner.style.backgroundColor = "#10b981"; statusBanner.style.color = "#fff"; }
        setOrderButtonsLocked(true, true);

        upsertHistoryEntry({
            ...currentOrderContext,
            estado: "Completada",
            fecha: new Date().toLocaleString()
        });
        showToast("Fondos liberados con éxito.", "success");
    } catch (err) {
        console.error("Error en releaseFunds:", err);
        showToast("Error al liberar fondos en blockchain.", "error");
    }
}

// Abre disputa arbitral en el contrato y congela el temporizador
async function abrirDisputaOrden() {
    if (!currentOrderContext?.offerId) return;
    try {
        await ensureAmoyNetwork();
        const tx = await contract.openDispute(currentOrderContext.offerId, AMOY_GAS_OVERRIDES);
        showToast("Abriendo disputa en el contrato...", "warning");
        await tx.wait();

        stopOrderTimer();
        setTimerDisplayText("--:--");
        currentOrderContext.enDisputa = true;

        const statusText = document.getElementById("order-status-text");
        const statusBanner = document.querySelector(".order-status-banner");
        if (statusText) statusText.textContent = "⚠️ Orden en Disputa Arbitral (Congelada)";
        if (statusBanner) { statusBanner.style.backgroundColor = "#dc3545"; statusBanner.style.color = "#fff"; }
        setOrderButtonsLocked(true, false);

        upsertHistoryEntry({
            ...currentOrderContext,
            estado: "En Disputa",
            fecha: new Date().toLocaleString()
        });
        showToast("Disputa abierta y orden congelada.", "warning");
    } catch (err) {
        console.error("Error en openDispute:", err);
        showToast("Error al abrir disputa en blockchain.", "error");
    }
}

// ============================================================================
// EVENTOS DE INTERFAZ, CAMBIO DE CUENTA Y VISIBILIDAD DE PESTAÑA
// ============================================================================

if (btnConnect) {
    btnConnect.addEventListener("click", () => conectarWallet(false));
}
if (btnNewOrder && modalOrder) {
    btnNewOrder.addEventListener("click", () => modalOrder.classList.remove("hidden"));
}
if (btnCancelModal && modalOrder) {
    btnCancelModal.addEventListener("click", () => modalOrder.classList.add("hidden"));
}
if (formOrder) {
    formOrder.addEventListener("submit", publicarOferta);
}
if (btnBack) {
    btnBack.addEventListener("click", volverAlMercado);
}

// Pestañas de filtro Comprar USDT / Vender USDT en la vista principal
const tabBuy = document.getElementById("tab-buy");
const tabSell = document.getElementById("tab-sell");

if (tabBuy && tabSell) {
    tabBuy.addEventListener("click", () => {
        tabBuy.classList.add("active");
        tabSell.classList.remove("active");
        renderOffers();
    });
    tabSell.addEventListener("click", () => {
        tabSell.classList.add("active");
        tabBuy.classList.remove("active");
        renderOffers();
    });
}

const markPaidBtn = document.getElementById("btn-mark-paid");
const releaseFundsBtn = document.getElementById("btn-release-funds");
const disputeBtn = document.getElementById("btn-dispute");

if (markPaidBtn) markPaidBtn.addEventListener("click", marcarComoPagado);
if (releaseFundsBtn) releaseFundsBtn.addEventListener("click", liberarFondos);
if (disputeBtn) disputeBtn.addEventListener("click", abrirDisputaOrden);

// Chat local dentro de la vista de orden
const btnSendChat = document.getElementById("btn-send-chat");
const chatInput = document.getElementById("chat-input");
if (btnSendChat && chatInput) {
    btnSendChat.addEventListener("click", () => {
        const text = chatInput.value.trim();
        const chatMessages = document.getElementById("chat-messages");
        if (!text || !chatMessages) return;
        const msgEl = document.createElement("div");
        msgEl.style.cssText = "background:#1f2937;color:#fff;padding:6px 10px;border-radius:6px;align-self:flex-end;max-width:85%;";
        msgEl.textContent = text;
        chatMessages.appendChild(msgEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        chatInput.value = "";
    });
}

// Sincroniza la UI si el usuario cambia de cuenta en MetaMask
if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
        const nextAccount = accounts && accounts.length > 0 ? accounts[0] : null;
        syncWalletUI(nextAccount);
        if (nextAccount) {
            ensureAmoyNetwork().then(cargarOfertasBlockchain).catch(() => {});
        }
    });
}

// Refresca ofertas automáticamente al volver a enfocar la pestaña del navegador
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        cargarOfertasBlockchain();
    }
});

// Inicialización al cargar la página
renderHistory();
conectarWallet(true).then(() => cargarOfertasBlockchain());