/**
 * Lógica da Super Vitrine de Afiliados Amazon
 * Gerencia produtos, injeção dinâmica de tag de afiliado, filtros, busca e ferramentas de divulgação.
 */

// Chaves de armazenamento local
const STORAGE_KEYS = {
  TAG: "amz_affiliate_tag",
  PRODUCTS: "amz_affiliate_products",
  STORE_NAME: "amz_store_name",
  VIP_LINK: "amz_vip_link"
};

// Estado Global da Aplicação
const AppState = {
  affiliateTag: localStorage.getItem(STORAGE_KEYS.TAG) || "radar01ce-20",
  storeName: localStorage.getItem(STORAGE_KEYS.STORE_NAME) || "Radar de Ofertas Amazon",
  products: [],
  currentCategory: "all",
  searchQuery: "",
  activeFilter: "all", // 'all', 'prime', 'deals', 'under100', 'toprated'
  sortBy: "popular"
};

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
  loadProducts();
  initUI();
  renderCategories();
  renderProducts();
  setupEventListeners();
  updateAffiliateTagDisplay();
});

// Versão do catálogo de produtos verificados
const CATALOG_VERSION = "v3_real_amazon_synced";

// Carrega os produtos do localStorage ou do catálogo inicial padrão
function loadProducts() {
  const savedVersion = localStorage.getItem("amz_catalog_version");
  const saved = localStorage.getItem(STORAGE_KEYS.PRODUCTS);

  if (saved && savedVersion === CATALOG_VERSION) {
    try {
      AppState.products = JSON.parse(saved);
    } catch (e) {
      console.error("Erro ao carregar produtos salvos:", e);
      AppState.products = [...INITIAL_PRODUCTS];
      saveProducts();
    }
  } else {
    // Força atualização para o catálogo verificado 100% funcional
    AppState.products = [...INITIAL_PRODUCTS];
    localStorage.setItem("amz_catalog_version", CATALOG_VERSION);
    saveProducts();
  }
}

function saveProducts() {
  localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(AppState.products));
}

// Construtor inteligente de links com a Tag de Afiliado
function buildAffiliateUrl(rawUrl, customTag = null) {
  if (!rawUrl) return "#";
  const tagToUse = customTag || AppState.affiliateTag || "suatag-20";
  
  try {
    const url = new URL(rawUrl);
    // Adiciona ou substitui o parâmetro tag
    url.searchParams.set("tag", tagToUse);
    // Parâmetros opcionais de tracking para afiliados Amazon
    url.searchParams.set("language", "pt_BR");
    return url.toString();
  } catch (e) {
    // Caso seja um link relativo ou curto
    const separator = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${separator}tag=${encodeURIComponent(tagToUse)}`;
  }
}

// Formatação monetária BRL
function formatBRL(value) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

// Cálculo do percentual de desconto
function getDiscountPercent(original, current) {
  if (!original || original <= current) return 0;
  return Math.round(((original - current) / original) * 100);
}

// Renderiza as categorias no topo
function renderCategories() {
  const container = document.getElementById("categories-container");
  if (!container) return;

  container.innerHTML = STORE_CATEGORIES.map(cat => {
    if (cat.isCoupon) {
      return `
        <button 
          class="category-pill flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 whitespace-nowrap bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-lg shadow-rose-600/20 border border-rose-400/40 hover:scale-105 active:scale-95"
          onclick="openCoupons()"
          title="Ver página oficial de cupons da Amazon Brasil com até 30% OFF"
        >
          <i class="fa-solid fa-ticket text-amber-300"></i>
          <span>${cat.name}</span>
        </button>
      `;
    }

    const isActive = AppState.currentCategory === cat.id;
    return `
      <button 
        class="category-pill flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
          isActive 
            ? "bg-amber-500 text-slate-900 shadow-md font-semibold ring-2 ring-amber-400/50 scale-105" 
            : "bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60"
        }"
        onclick="setCategory('${cat.id}')"
      >
        <i class="fa-solid ${cat.icon}"></i>
        <span>${cat.name}</span>
      </button>
    `;
  }).join("");
}

// Define categoria atual
function setCategory(catId) {
  AppState.currentCategory = catId;
  renderCategories();
  renderProducts();
}

// Renderiza os produtos filtrados e ordenados
function renderProducts() {
  const grid = document.getElementById("products-grid");
  const countBadge = document.getElementById("product-count");
  if (!grid) return;

  let filtered = [...AppState.products];

  // Filtro por Categoria
  if (AppState.currentCategory !== "all") {
    filtered = filtered.filter(p => p.category === AppState.currentCategory);
  }

  // Filtro por Busca
  if (AppState.searchQuery.trim() !== "") {
    const q = AppState.searchQuery.toLowerCase();
    filtered = filtered.filter(p => 
      p.title.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.categoryName && p.categoryName.toLowerCase().includes(q))
    );
  }

  // Filtros rápidos
  if (AppState.activeFilter === "prime") {
    filtered = filtered.filter(p => p.isPrime);
  } else if (AppState.activeFilter === "deals") {
    filtered = filtered.filter(p => getDiscountPercent(p.originalPrice, p.price) >= 15);
  } else if (AppState.activeFilter === "under100") {
    filtered = filtered.filter(p => p.price <= 100);
  } else if (AppState.activeFilter === "toprated") {
    filtered = filtered.filter(p => p.rating >= 4.7);
  }

  // Ordenação
  if (AppState.sortBy === "popular") {
    filtered.sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0));
  } else if (AppState.sortBy === "discount") {
    filtered.sort((a, b) => getDiscountPercent(b.originalPrice, b.price) - getDiscountPercent(a.originalPrice, a.price));
  } else if (AppState.sortBy === "price-asc") {
    filtered.sort((a, b) => a.price - b.price);
  } else if (AppState.sortBy === "price-desc") {
    filtered.sort((a, b) => b.price - a.price);
  } else if (AppState.sortBy === "rating") {
    filtered.sort((a, b) => b.rating - a.rating);
  }

  if (countBadge) {
    countBadge.textContent = `${filtered.length} produto(s) encontrado(s)`;
  }

  // Se não encontrar nenhum produto
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center">
        <div class="inline-flex p-4 rounded-full bg-slate-800 text-amber-400 mb-4 text-3xl">
          <i class="fa-solid fa-magnifying-glass"></i>
        </div>
        <h3 class="text-xl font-bold text-white mb-2">Nenhum produto encontrado</h3>
        <p class="text-slate-400 text-sm max-w-md mx-auto mb-6">
          Tente alterar os termos de busca ou remover os filtros aplicados para ver mais ofertas.
        </p>
        <button onclick="resetFilters()" class="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold transition-all">
          Limpar Filtros
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const discount = getDiscountPercent(p.originalPrice, p.price);
    const affiliateUrl = buildAffiliateUrl(p.amazonUrl);

    return `
      <article class="group relative flex flex-col bg-slate-800/90 hover:bg-slate-800 rounded-2xl border border-slate-700/60 hover:border-amber-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-amber-500/10 overflow-hidden">
        
        <!-- Badges Superiores -->
        <div class="absolute top-3 left-3 z-10 flex flex-col gap-1.5 items-start">
          ${discount > 0 ? `
            <span class="inline-flex items-center gap-1 bg-rose-600 text-white font-extrabold text-xs px-2.5 py-1 rounded-md shadow-md animate-pulse">
              <i class="fa-solid fa-bolt text-[10px]"></i> -${discount}% OFF
            </span>
          ` : ""}
          ${p.badge ? `
            <span class="inline-flex items-center gap-1 bg-amber-500/95 text-slate-950 font-bold text-[11px] px-2 py-0.5 rounded shadow">
              <i class="fa-solid fa-star text-[10px]"></i> ${p.badge}
            </span>
          ` : ""}
        </div>

        <!-- Botão Rápido de Compartilhar/Copiar Link -->
        <button 
          title="Copiar texto para WhatsApp / Telegram"
          onclick="shareProduct('${p.id}')"
          class="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-slate-900/80 hover:bg-emerald-600 text-slate-200 hover:text-white flex items-center justify-center transition-all border border-slate-700/80 hover:border-emerald-500 shadow-lg"
        >
          <i class="fa-brands fa-whatsapp text-lg"></i>
        </button>

        <!-- Imagem do Produto -->
        <a href="${affiliateUrl}" target="_blank" rel="sponsored noopener" class="relative block pt-6 px-4 bg-white/5 flex items-center justify-center h-56 overflow-hidden">
          <img 
            src="${p.image}" 
            alt="${p.title}"
            loading="lazy"
            class="max-h-48 max-w-full object-contain group-hover:scale-105 transition-transform duration-300 drop-shadow-md"
            onerror="this.onerror=null; this.src='https://m.media-amazon.com/images/G/32/social_share/amazon_logo._CB633266945_.png';"
          />
        </a>

        <!-- Conteúdo do Card -->
        <div class="flex flex-col flex-1 p-5">
          
          <!-- Categoria e Prime -->
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="text-xs uppercase font-semibold tracking-wider text-amber-400">
              ${p.categoryName || "Oferta"}
            </span>
            ${p.isPrime ? `
              <span class="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/60">
                <i class="fa-solid fa-check text-sky-400"></i> prime
              </span>
            ` : ""}
          </div>

          <!-- Título -->
          <h4 class="text-sm font-semibold text-slate-100 hover:text-amber-400 transition-colors line-clamp-2 leading-snug mb-2 flex-1">
            <a href="${affiliateUrl}" target="_blank" rel="sponsored noopener">
              ${p.title}
            </a>
          </h4>

          <!-- Avaliações -->
          <div class="flex items-center gap-1.5 mb-3 text-xs text-slate-400">
            <div class="flex text-amber-400 text-xs">
              ${renderStarRating(p.rating)}
            </div>
            <span class="font-bold text-slate-200">${p.rating.toFixed(1)}</span>
            <span class="text-slate-500">(${Number(p.reviewsCount).toLocaleString("pt-BR")})</span>
          </div>

          <!-- Preço -->
          <div class="mt-auto mb-4 pt-2 border-t border-slate-700/50">
            ${p.originalPrice && p.originalPrice > p.price ? `
              <div class="flex items-center gap-2 text-xs text-slate-400 line-through">
                ${formatBRL(p.originalPrice)}
              </div>
            ` : ""}
            <div class="flex items-baseline gap-2">
              <span class="text-2xl font-black text-white tracking-tight">
                ${formatBRL(p.price)}
              </span>
              ${p.isPrime ? `
                <span class="text-[11px] text-emerald-400 font-medium">Frete Grátis</span>
              ` : ""}
            </div>
            ${p.originalPrice && p.originalPrice > p.price ? `
              <div class="text-[11px] text-emerald-400 font-medium mt-0.5">
                Economize ${formatBRL(p.originalPrice - p.price)}
              </div>
            ` : ""}
          </div>

          <!-- Botões de Ação -->
          <div class="grid grid-cols-5 gap-2">
            <a 
              href="${affiliateUrl}" 
              target="_blank" 
              rel="sponsored noopener"
              class="col-span-4 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-md transition-all active:scale-[0.98]"
            >
              <i class="fa-brands fa-amazon text-base"></i>
              <span>Ver na Amazon</span>
            </a>
            
            <button 
              onclick="copyProductLink('${affiliateUrl}')"
              title="Copiar Link de Afiliado"
              class="col-span-1 flex items-center justify-center rounded-xl bg-slate-700/70 hover:bg-slate-600 text-slate-200 hover:text-white transition-all border border-slate-600/50"
            >
              <i class="fa-solid fa-link text-sm"></i>
            </button>
          </div>

        </div>
      </article>
    `;
  }).join("");
}

// Renderiza estrelinhas de review
function renderStarRating(rating) {
  let stars = "";
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;

  for (let i = 0; i < full; i++) {
    stars += `<i class="fa-solid fa-star"></i>`;
  }
  if (half) {
    stars += `<i class="fa-solid fa-star-half-stroke"></i>`;
  }
  const remaining = 5 - full - (half ? 1 : 0);
  for (let i = 0; i < remaining; i++) {
    stars += `<i class="fa-regular fa-star text-slate-600"></i>`;
  }
  return stars;
}

// Configura Listeners de busca e ordenação
function setupEventListeners() {
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      AppState.searchQuery = e.target.value;
      renderProducts();
    });
  }

  const sortSelect = document.getElementById("sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      AppState.sortBy = e.target.value;
      renderProducts();
    });
  }
}

// Define filtro rápido
function setQuickFilter(filter) {
  AppState.activeFilter = filter;
  
  // Atualiza estilo dos botões de filtro
  document.querySelectorAll(".quick-filter-btn").forEach(btn => {
    if (btn.dataset.filter === filter) {
      btn.className = "quick-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 shadow";
    } else {
      btn.className = "quick-filter-btn px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700";
    }
  });

  renderProducts();
}

function resetFilters() {
  AppState.currentCategory = "all";
  AppState.searchQuery = "";
  AppState.activeFilter = "all";
  AppState.sortBy = "popular";
  
  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.value = "";
  const sortSelect = document.getElementById("sort-select");
  if (sortSelect) sortSelect.value = "popular";

  setQuickFilter("all");
  renderCategories();
  renderProducts();
}

// UI de Tag de Afiliado e Configurações
function updateAffiliateTagDisplay() {
  const tagBadge = document.getElementById("current-tag-badge");
  if (tagBadge) {
    tagBadge.textContent = AppState.affiliateTag;
  }
  const tagInput = document.getElementById("modal-affiliate-tag-input");
  if (tagInput) {
    tagInput.value = AppState.affiliateTag;
  }
  const vipInput = document.getElementById("modal-vip-link-input");
  if (vipInput) {
    vipInput.value = localStorage.getItem(STORAGE_KEYS.VIP_LINK) || "";
  }
}

function openTagModal() {
  const modal = document.getElementById("tag-modal");
  if (modal) modal.classList.remove("hidden");
}

function closeTagModal() {
  const modal = document.getElementById("tag-modal");
  if (modal) modal.classList.add("hidden");
}

function saveAffiliateTag() {
  const input = document.getElementById("modal-affiliate-tag-input");
  const vipInput = document.getElementById("modal-vip-link-input");
  
  if (input) {
    const newTag = input.value.trim();
    if (newTag) {
      AppState.affiliateTag = newTag;
      localStorage.setItem(STORAGE_KEYS.TAG, newTag);
    }
  }

  if (vipInput) {
    const vipLink = vipInput.value.trim();
    localStorage.setItem(STORAGE_KEYS.VIP_LINK, vipLink);
  }

  updateAffiliateTagDisplay();
  closeTagModal();
  renderProducts();
  initUI();
  showToast("Configurações salvas com sucesso!");
}

// Abertura da Central Oficial de Cupons com a tag de afiliado
function openCoupons() {
  const url = buildAffiliateUrl("https://www.amazon.com.br/cupons");
  window.open(url, "_blank", "noopener,sponsored");
  showToast("Abrindo a Central Oficial de Cupons da Amazon!", "success");
}

// Redirecionamento para o Grupo VIP no WhatsApp/Telegram
function handleVipGroupClick(e) {
  if (e) e.preventDefault();
  const savedUrl = localStorage.getItem(STORAGE_KEYS.VIP_LINK);
  if (savedUrl && savedUrl.trim()) {
    window.open(savedUrl.trim(), "_blank");
  } else {
    openTagModal();
    showToast("Cole o link de convite do seu grupo no campo abaixo!", "warning");
  }
}

// Busca dados reais diretamente da Amazon via API local
async function fetchAmazonProductData() {
  const input = document.getElementById("fetch-amazon-input");
  const btn = document.getElementById("btn-fetch-amazon");
  if (!input || !input.value.trim()) {
    showToast("Por favor cole um link ou código ASIN da Amazon", "warning");
    return;
  }
  
  const rawInput = input.value.trim();
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Buscando...</span>`;
  
  try {
    const res = await fetch(`/api/scrape?url=${encodeURIComponent(rawInput)}`);
    if (!res.ok) throw new Error("Erro na comunicação com o servidor local");
    const data = await res.json();
    
    if (data.error) {
      showToast(data.error, "warning");
      return;
    }
    
    // Preenche os campos do formulário automaticamente!
    if (data.title) document.getElementById("new-prod-title").value = data.title;
    if (data.url) document.getElementById("new-prod-url").value = data.url;
    if (data.image) document.getElementById("new-prod-image").value = data.image;
    if (data.price) document.getElementById("new-prod-price").value = data.price;
    if (data.originalPrice) {
      document.getElementById("new-prod-original-price").value = data.originalPrice;
    }
    if (document.getElementById("new-prod-prime")) {
      document.getElementById("new-prod-prime").checked = Boolean(data.isPrime);
    }
    
    showToast("Dados reais extraídos da Amazon com sucesso!");
  } catch (err) {
    console.error(err);
    showToast("Para buscar dados automaticamente, inicie o servidor com 'python server.py'", "warning");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-bolt"></i> <span>Puxar Dados</span>`;
  }
}

// Modal de Adicionar Produto
function openAddProductModal() {
  const modal = document.getElementById("add-product-modal");
  if (modal) modal.classList.remove("hidden");
}

function closeAddProductModal() {
  const modal = document.getElementById("add-product-modal");
  if (modal) modal.classList.add("hidden");
}

function handleAddProductSubmit(e) {
  e.preventDefault();
  
  const title = document.getElementById("new-prod-title").value.trim();
  const category = document.getElementById("new-prod-category").value;
  const price = parseFloat(document.getElementById("new-prod-price").value);
  const originalPrice = parseFloat(document.getElementById("new-prod-original-price").value) || null;
  const amazonUrl = document.getElementById("new-prod-url").value.trim();
  const image = document.getElementById("new-prod-image").value.trim();
  const isPrime = document.getElementById("new-prod-prime").checked;
  const badge = document.getElementById("new-prod-badge").value.trim();

  if (!title || !price || !amazonUrl || !image) {
    showToast("Preencha os campos obrigatórios (Título, Preço, URL e Imagem)", "warning");
    return;
  }

  // Descobre o nome legível da categoria
  const catObj = STORE_CATEGORIES.find(c => c.id === category);
  const categoryName = catObj ? catObj.name : "Oferta";

  const newProduct = {
    id: "prod-" + Date.now(),
    title,
    category,
    categoryName,
    image,
    price,
    originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
    rating: 4.8,
    reviewsCount: Math.floor(Math.random() * 2000) + 100,
    isPrime,
    badge: badge || "Novidade",
    amazonUrl,
    description: title
  };

  AppState.products.unshift(newProduct);
  saveProducts();
  closeAddProductModal();
  renderProducts();
  showToast("Produto adicionado com sucesso ao seu catálogo!");
  
  // Limpa formulário
  document.getElementById("add-product-form").reset();
}

// Copiar Link direto com feedback
function copyProductLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast("Link com sua Tag copiado para a área de transferência!");
  }).catch(() => {
    prompt("Copie o link abaixo:", url);
  });
}

// Compartilhar no WhatsApp/Telegram com copy de alta conversão
function shareProduct(productId) {
  const product = AppState.products.find(p => p.id === productId);
  if (!product) return;

  const affiliateUrl = buildAffiliateUrl(product.amazonUrl);
  const discount = getDiscountPercent(product.originalPrice, product.price);

  let message = `🔥 *ACHADINHO AMAZON BRASIL*\n\n`;
  message += `📦 *${product.title}*\n\n`;
  if (discount > 0) {
    message += `💥 *-${discount}% de DESCONTO!*\n`;
    message += `❌ De: ${formatBRL(product.originalPrice)}\n`;
  }
  message += `✅ *Por apenas: ${formatBRL(product.price)}*\n`;
  if (product.isPrime) {
    message += `⚡ Frete GRÁTIS com Amazon Prime\n`;
  }
  message += `\n🛒 *Compre aqui com segurança na Amazon:* 👇\n${affiliateUrl}\n\n`;
  message += `⚠️ _Preço e estoque sujeitos a alteração a qualquer momento._`;

  // Copia para área de transferência e oferece abrir WhatsApp
  navigator.clipboard.writeText(message).then(() => {
    showToast("Texto formatado copiado! Abrindo WhatsApp Web...", "success");
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank");
  }).catch(() => {
    prompt("Copie o texto de divulgação:", message);
  });
}

// Backup & Restauração do Catálogo
function exportCatalog() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(AppState.products, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `catalogo-afiliado-amazon-${new Date().toISOString().split("T")[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast("Download do catálogo concluído!");
}

function importCatalog() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported)) {
          AppState.products = imported;
          saveProducts();
          renderProducts();
          showToast(`Catálogo restaurado com ${imported.length} produtos!`);
        } else {
          showToast("Formato de arquivo JSON inválido", "warning");
        }
      } catch (err) {
        showToast("Erro ao processar arquivo JSON", "warning");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function resetToDefaultCatalog() {
  if (confirm("Deseja restaurar o catálogo inicial com todos os produtos recomendados? Suas alterações serão substituídas.")) {
    AppState.products = [...INITIAL_PRODUCTS];
    saveProducts();
    renderProducts();
    showToast("Catálogo padrão restaurado com sucesso!");
  }
}

// Sistema de Notificações Toast
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  const bgClass = type === "warning" ? "bg-amber-600" : "bg-emerald-600";
  const icon = type === "warning" ? "fa-triangle-exclamation" : "fa-circle-check";

  toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl ${bgClass} text-white shadow-2xl text-sm font-medium transform transition-all duration-300 translate-y-4 opacity-0`;
  toast.innerHTML = `
    <i class="fa-solid ${icon} text-lg"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Animação de entrada
  setTimeout(() => {
    toast.classList.remove("translate-y-4", "opacity-0");
  }, 10);

  // Remoção automática
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function initUI() {
  // Ajuste do link do Prime no topo
  const primeBannerBtn = document.getElementById("prime-cta-btn");
  if (primeBannerBtn) {
    // Link oficial da página de teste de 30 dias grátis do Amazon Prime
    primeBannerBtn.href = buildAffiliateUrl("https://www.amazon.com.br/prime");
  }

  // Ajuste do link da Central de Cupons da Amazon
  const cuponsBtn = document.getElementById("btn-central-cupons");
  if (cuponsBtn) {
    cuponsBtn.href = buildAffiliateUrl("https://www.amazon.com.br/cupons");
  }

  // Exibe timestamp da última sincronização automática com a Amazon
  if (typeof LAST_CATALOG_SYNC !== "undefined") {
    const syncBadge = document.getElementById("sync-status-badge");
    if (syncBadge) {
      syncBadge.textContent = `Preços Sincronizados com a Amazon: ${LAST_CATALOG_SYNC}`;
    }
  }
}
