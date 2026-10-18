"""
Script de Atualização Automática de Ofertas da Amazon Brasil.
Executado automaticamente pelo GitHub Actions a cada 12 horas (ou sob demanda)
para manter todos os preços, fotos e ofertas 100% atualizados sem intervenção manual.
Possui proteção anti-bot: se a Amazon não retornar o título do produto (ex: Captcha),
o script preserva os dados existentes com segurança, nunca quebrando o site.
"""

import urllib.request
import ssl
import re
import json
import time
from datetime import datetime

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
}

def load_existing_catalog():
    try:
        with open("products.js", "r", encoding="utf-8") as f:
            code = f.read()
        m = re.search(r'const INITIAL_PRODUCTS = (\[.*?\]);', code, re.DOTALL)
        if m:
            return json.loads(m.group(1))
    except Exception as e:
        print(f"Aviso ao carregar produtos existentes: {e}")
    return []

def sync_single_product(existing_prod):
    asin = existing_prod.get("asin")
    if not asin:
        return existing_prod
        
    url = f"https://www.amazon.com.br/dp/{asin}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=8) as resp:
            html = resp.read().decode('utf-8', errors='ignore')

            # Título: Se não houver productTitle (bloqueio/captcha), não sobrescreva!
            t_m = re.findall(r'<span id="productTitle"[^>]*>\s*([^<]+)\s*</span>', html)
            if not t_m:
                # Mantém dados originais
                return existing_prod

            title = t_m[0].strip()
            title = re.sub(r'^Anúncio patrocinado\s*–\s*', '', title)
            existing_prod["title"] = title
            existing_prod["description"] = title

            # Imagem
            img_m = re.findall(r'data-a-dynamic-image=\"\{&quot;(https://m\.media-amazon\.com/images/I/[^\&]+)&quot;', html)
            if not img_m:
                img_m = re.findall(r'"large":"(https://m\.media-amazon\.com/images/I/[^"]+)"', html)
            if img_m:
                existing_prod["image"] = img_m[0]

            # Preço Atual
            wf = re.search(r'class="[^"]*priceToPay[^"]*".*?<span class="a-price-whole">([0-9\.]+)<span class="a-price-decimal">,</span></span><span class="a-price-fraction">([0-9]+)</span>', html, re.DOTALL)
            if not wf:
                wf = re.search(r'<span class="a-price-whole">([0-9\.]+)<span class="a-price-decimal">,</span></span><span class="a-price-fraction">([0-9]+)</span>', html)
                
            if wf:
                whole = wf.group(1).replace('.', '')
                frac = wf.group(2)
                existing_prod["price"] = float(f"{whole}.{frac}")
            else:
                ap = re.search(r'id="apex-pricetopay-accessibility-label"[^>]*>\s*R\$[^\d]*([\d\.,]+)', html)
                if ap:
                    existing_prod["price"] = float(ap.group(1).replace('.', '').replace(',', '.'))

            # Preço Original
            orig_m = re.search(r'apex-basisprice.*?De:\s*R\$[^\d]*([\d\.,]+)', html, re.DOTALL)
            if not orig_m:
                orig_m = re.search(r'class="[^"]*basisPrice[^"]*".*?<span class="a-offscreen">R\$[^\d]*([\d\.,]+)</span>', html, re.DOTALL)
            if orig_m:
                try:
                    orig_val = float(orig_m.group(1).replace('.', '').replace(',', '.'))
                    if orig_val > existing_prod["price"]:
                        existing_prod["originalPrice"] = orig_val
                except:
                    pass

            # Avaliação
            rating_m = re.findall(r'([0-9],[0-9]) de 5 estrelas', html)
            if rating_m:
                existing_prod["rating"] = float(rating_m[0].replace(',', '.'))

            # Prime
            existing_prod["isPrime"] = "prime-logo" in html or "icon-prime" in html or "a-icon-prime" in html or "Frete GRÁTIS" in html or "prime" in html.lower()

            print(f" -> Atualizado: [{asin}] R$ {existing_prod['price']} | {existing_prod['title'][:30]}")
    except Exception as e:
        print(f" -> Mantido dados atuais para [{asin}] ({e})")

    return existing_prod

def main():
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Iniciando sincronização segura...")
    catalog = load_existing_catalog()
    if not catalog:
        print("Erro: Nenhum produto encontrado no catálogo.")
        return

    updated_catalog = []
    for prod in catalog:
        updated = sync_single_product(prod)
        updated_catalog.append(updated)
        time.sleep(1.0) # Delay para evitar bloqueios da Amazon

    now_str = datetime.now().strftime("%d/%m/%Y às %H:%M")
    
    js_code = f"""/**
 * Catálogo Oficial Sincronizado Automaticamente com a Amazon Brasil
 * Última atualização automática: {now_str}
 */

const LAST_CATALOG_SYNC = "Sincronizado em {now_str}";

const INITIAL_PRODUCTS = {json.dumps(updated_catalog, ensure_ascii=False, indent=2)};

const STORE_CATEGORIES = [
  {{ id: "all", name: "Todos os Produtos", icon: "fa-border-all" }},
  {{ id: "casa-inteligente", name: "Casa Inteligente & Alexa", icon: "fa-house-signal" }},
  {{ id: "tecnologia", name: "Tecnologia & Smartphones", icon: "fa-mobile-screen-button" }},
  {{ id: "setup", name: "Setup & Informática", icon: "fa-laptop-code" }},
  {{ id: "games", name: "Games & Consoles", icon: "fa-gamepad" }},
  {{ id: "livros-kindle", name: "Livros & Kindle", icon: "fa-book-open" }},
  {{ id: "achadinhos", name: "Achadinhos Virais", icon: "fa-fire" }}
];
"""
    with open("products.js", "w", encoding="utf-8") as f:
        f.write(js_code)
        
    print(f"\n[SUCESSO] Catálogo mantido e sincronizado com segurança ({len(updated_catalog)} produtos).")

if __name__ == "__main__":
    main()
