const ESCROW_CONTRACT_ADDRESS = "0xA3266d32A130cd803abC22dDbbE16f10F8a852D8";
const AMOY_CHAIN_ID = 80002;
const AMOY_CHAIN_ID_HEX = "0x13882";
const HISTORY_STORAGE_KEY = "p2p_escrow_history_amoy";

const AMOY_GAS_OVERRIDES = {
    maxPriorityFeePerGas: ethers.utils.parseUnits("30", "gwei"),
    maxFeePerGas: ethers.utils.parseUnits("35", "gwei")
};

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

const connectWalletBtn = document.getElementById("connect-wallet-btn");
const walletBadge = document.getElementById("wallet-badge");
const createOfferBtn = document.getElementById("create-offer-btn");
const createOfferModal = document.getElementById("create-offer-modal");
const cancelOfferBtn = document.getElementById("cancel-offer-btn");
const publishOfferBtn = document.getElementById("publish-offer-btn");
const offersContainer = document.getElementById("offers-container");
const historySection = document.getElementById("history-section");
const historyList = document.getElementById("history-list");
const tradeTabsSection = document.getElementById("trade-tabs-section");
const filtersSection = document.getElementById("filters-section");
const orderViewSection = document.getElementById("order-view-section");
const backToMarketBtn = document.getElementById("back-to-market-btn");

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

function loadHistoryFromStorage() {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.warn("No se pudo leer historial desde localStorage:", err);
        return [];
    }
}

function saveHistoryToStorage() {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(orderHistory));
    } catch (err) {
        console.warn("No se pudo guardar historial en localStorage:", err);
    }
}

function formatShortAddress(addr) {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function stopOrderTimer() {
    if (orderTimerInterval) {
        clearInterval(orderTimerInterval);
        orderTimerInterval = null;
    }
}

function setTimerDisplayText(text) {
    const timerDisplay = document.getElementById("timer-display");
    if (timerDisplay) {
        timerDisplay.textContent = text;
    }
}

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

    if (acct && seller && acct === seller && acct !== buyer) {
        btnMarkPaid.classList.add("hidden");
    } else if (acct && buyer && acct === buyer && acct !== seller) {
        btnRelease.classList.add("hidden");
    }
}

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

function renderHistory() {
    if (!historyList) return;
    if (!orderHistory.length) {
        historyList.innerHTML = `<p style="color:#8b949e;">No hay transacciones registradas en esta sesión.</p>`;
        return;
    }
    historyList.innerHTML = orderHistory.map((item) => `
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

function syncWalletUI(account) {
    currentAccount = account || null;
    if (connectWalletBtn) {
        connectWalletBtn.textContent = currentAccount ? formatShortAddress(currentAccount) : "Conectar Wallet";
    }
    if (walletBadge) {
        walletBadge.textContent = currentAccount ? formatShortAddress(currentAccount) : "Desconectada";
    }
    if (currentOrderContext && orderViewSection && !orderViewSection.classList.contains("hidden")) {
        aplicarVisibilidadPorRol(currentOrderContext);
    }
}

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

async function conectarWallet(silent = false) {
    if (!window.ethereum) {
        if (!silent) showToast("Instala MetaMask para operar en Polygon Amoy.", "warning");
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
        }
    } catch (err) {
        console.error("Error al conectar wallet:", err);
        if (!silent) showToast("No se pudo conectar la wallet o cambiar a Amoy.", "error");
    }
}

async function cargarOfertasBlockchain() {
    if (isRefreshingOffers) return;
    isRefreshingOffers = true;
    try {
        const readProvider = provider || (window.ethereum ? new ethers.providers.Web3Provider(window.ethereum) : null);
        if (!readProvider) return;
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

window.abrirOrdenDesdeLista = function (index) {
    const visibleOffers = activeOffers.filter((o) => !o.completada);
    const offer = visibleOffers[index];
    if (!offer) return;
    abrirOrdenActiva(offer);
};

function abrirOrdenActiva(datosOferta) {
    currentOrderContext = { ...datosOferta };
    if (tradeTabsSection) tradeTabsSection.classList.add("hidden");
    if (filtersSection) filtersSection.classList.add("hidden");
    if (offersContainer) offersContainer.classList.add("hidden");
    if (historySection) historySection.classList.add("hidden");
    if (orderViewSection) orderViewSection.classList.remove("hidden");

    const statusText = document.getElementById("order-status-text");
    const statusBanner = document.querySelector(".order-status-banner");
    const btnMarkPaid = document.getElementById("btn-mark-paid");
    const btnRelease = document.getElementById("btn-release-funds");
    const btnDispute = document.getElementById("btn-dispute");

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

function volverAlMercado() {
    stopOrderTimer();
    currentOrderContext = null;
    if (orderViewSection) orderViewSection.classList.add("hidden");
    if (tradeTabsSection) tradeTabsSection.classList.remove("hidden");
    if (filtersSection) filtersSection.classList.remove("hidden");
    if (offersContainer) offersContainer.classList.remove("hidden");
    if (historySection) historySection.classList.remove("hidden");
    cargarOfertasBlockchain();
}

async function publicarOferta() {
    const amountInput = document.getElementById("offer-amount-usdt");
    const rateInput = document.getElementById("offer-rate-bs");
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
        if (createOfferModal) createOfferModal.classList.add("hidden");
        await cargarOfertasBlockchain();
    } catch (err) {
        console.error("Error al publicar oferta:", err);
        showToast("Error en blockchain: verifica saldo POL de prueba o gas.", "error");
    }
}

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

if (connectWalletBtn) {
    connectWalletBtn.addEventListener("click", () => conectarWallet(false));
}
if (createOfferBtn && createOfferModal) {
    createOfferBtn.addEventListener("click", () => createOfferModal.classList.remove("hidden"));
}
if (cancelOfferBtn && createOfferModal) {
    cancelOfferBtn.addEventListener("click", () => createOfferModal.classList.add("hidden"));
}
if (publishOfferBtn) {
    publishOfferBtn.addEventListener("click", publicarOferta);
}
if (backToMarketBtn) {
    backToMarketBtn.addEventListener("click", volverAlMercado);
}

const markPaidBtn = document.getElementById("btn-mark-paid");
const releaseFundsBtn = document.getElementById("btn-release-funds");
const disputeBtn = document.getElementById("btn-dispute");

if (markPaidBtn) markPaidBtn.addEventListener("click", marcarComoPagado);
if (releaseFundsBtn) releaseFundsBtn.addEventListener("click", liberarFondos);
if (disputeBtn) disputeBtn.addEventListener("click", abrirDisputaOrden);

if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accounts) => {
        const nextAccount = accounts && accounts.length > 0 ? accounts[0] : null;
        syncWalletUI(nextAccount);
        if (nextAccount) {
            ensureAmoyNetwork().then(cargarOfertasBlockchain).catch(() => {});
        }
    });
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        cargarOfertasBlockchain();
    }
});

renderHistory();
conectarWallet(true).then(() => cargarOfertasBlockchain());