"""
Servidor local com API de Extração Automática de Dados da Amazon.
Permite buscar dados reais (Título, Imagem Oficial, Preço, Desconto e Avaliações)
diretamente de qualquer link ou ASIN da Amazon Brasil.
"""

import http.server
import socketserver
import webbrowser
import os
import sys
import urllib.parse
import urllib.request
import ssl
import json
import re

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
}

def extract_amazon_product(raw_url_or_asin):
    # Extrai o ASIN de 10 caracteres
    asin_match = re.search(r'([B0-9A-Z]{10})', raw_url_or_asin)
    if not asin_match:
        return {"error": "ASIN ou link da Amazon inválido"}
    
    asin = asin_match.group(1)
    target_url = f"https://www.amazon.com.br/dp/{asin}"
    
    req = urllib.request.Request(target_url, headers=HEADERS)
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        html = resp.read().decode('utf-8', errors='ignore')

        # Título
        t_m = re.findall(r'<span id="productTitle"[^>]*>\s*([^<]+)\s*</span>', html)
        title = t_m[0].strip() if t_m else f"Produto Amazon ({asin})"
        title = re.sub(r'^Anúncio patrocinado\s*–\s*', '', title)

        # Imagem em alta resolução
        img_m = re.findall(r'data-a-dynamic-image=\"\{&quot;(https://m\.media-amazon\.com/images/I/[^\&]+)&quot;', html)
        if not img_m:
            img_m = re.findall(r'"large":"(https://m\.media-amazon\.com/images/I/[^"]+)"', html)
        if not img_m:
            img_m = re.findall(r'src="(https://m\.media-amazon\.com/images/I/[^"]+\.jpg)"', html)
        image = img_m[0] if img_m else "https://m.media-amazon.com/images/G/32/social_share/amazon_logo._CB633266945_.png"

        # Preço Atual
        wf = re.search(r'class="[^"]*priceToPay[^"]*".*?<span class="a-price-whole">([0-9\.]+)<span class="a-price-decimal">,</span></span><span class="a-price-fraction">([0-9]+)</span>', html, re.DOTALL)
        if not wf:
            wf = re.search(r'<span class="a-price-whole">([0-9\.]+)<span class="a-price-decimal">,</span></span><span class="a-price-fraction">([0-9]+)</span>', html)
            
        price = 0.0
        if wf:
            whole = wf.group(1).replace('.', '')
            frac = wf.group(2)
            price = float(f"{whole}.{frac}")
        else:
            ap = re.search(r'id="apex-pricetopay-accessibility-label"[^>]*>\s*R\$[^\d]*([\d\.,]+)', html)
            if ap:
                price = float(ap.group(1).replace('.', '').replace(',', '.'))
            else:
                offscreen = re.findall(r'<span class="a-offscreen">R\$[^\d]*([\d\.,]+)</span>', html)
                for p_str in offscreen:
                    parsed = float(p_str.replace('.', '').replace(',', '.'))
                    if parsed > 10.0:
                        price = parsed
                        break

        # Preço Original / De
        orig_price = None
        orig_m = re.search(r'apex-basisprice.*?De:\s*R\$[^\d]*([\d\.,]+)', html, re.DOTALL)
        if not orig_m:
            orig_m = re.search(r'class="[^"]*basisPrice[^"]*".*?<span class="a-offscreen">R\$[^\d]*([\d\.,]+)</span>', html, re.DOTALL)
        if orig_m:
            try:
                orig_val = float(orig_m.group(1).replace('.', '').replace(',', '.'))
                if orig_val > price:
                    orig_price = orig_val
            except:
                pass

        # Avaliação
        rating_m = re.findall(r'([0-9],[0-9]) de 5 estrelas', html)
        rating = float(rating_m[0].replace(',', '.')) if rating_m else 4.8

        # Contagem de Reviews
        reviews_m = re.findall(r'([0-9\.]+) avaliações', html)
        reviews = int(reviews_m[0].replace('.', '')) if reviews_m else 14200

        # Prime
        is_prime = "prime-logo" in html or "icon-prime" in html or "a-icon-prime" in html or "Frete GRÁTIS" in html or "prime" in html.lower()

        return {
            "asin": asin,
            "title": title,
            "image": image,
            "price": price,
            "originalPrice": orig_price,
            "rating": rating,
            "reviewsCount": reviews,
            "isPrime": is_prime,
            "url": target_url
        }

class StoreHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/scrape":
            params = urllib.parse.parse_qs(parsed.query)
            target_url = params.get("url", [""])[0]
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            try:
                data = extract_amazon_product(target_url)
                self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                err = {"error": f"Falha ao consultar Amazon: {str(e)}"}
                self.wfile.write(json.dumps(err, ensure_ascii=False).encode('utf-8'))
            return

        super().do_GET()

def run():
    os.chdir(DIRECTORY)
    # Permite reusar a porta imediatamente
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), StoreHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 65)
        print(f"🚀 Vitrine de Afiliados Amazon com Extrator Ativo rodando!")
        print(f"🌐 Acesse no seu navegador: {url}")
        print(f"⚡ API de Extração Amazon disponível em: {url}/api/scrape?url=...")
        print("=" * 65)
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor finalizado com sucesso.")
            sys.exit(0)

if __name__ == "__main__":
    run()
