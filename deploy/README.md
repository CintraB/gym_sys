# Deploy no PC servidor de casa

Guia para colocar o Gym Sys no ar em uma máquina Linux da sua rede, com HTTPS.

Arquivos daqui:

- `Caddyfile` — proxy reverso com HTTPS, servindo front e API na mesma origem.
- `gym-sys-api.service` — unidade systemd para a API subir sozinha no boot.

## Por que um proxy reverso

Sem ele o token de login viaja em texto claro pela rede — qualquer aparelho no
mesmo Wi-Fi consegue ler. O Caddy resolve isso e, de quebra, coloca front e API
na **mesma origem** (`/` e `/api`), o que elimina a necessidade de CORS e abre
caminho para trocar o `localStorage` por cookie `httpOnly` mais adiante.

## Passo a passo

### 1. Dependências

```bash
sudo apt install postgresql caddy
# Node 20+ — pelo nodesource ou nvm
```

### 2. Código e banco

```bash
sudo mkdir -p /opt/gym-sys && sudo chown $USER /opt/gym-sys
git clone https://github.com/CintraB/gym_sys /opt/gym-sys
cd /opt/gym-sys/backend && npm ci --omit=dev

sudo -u postgres createuser gymsys --pwprompt
sudo -u postgres createdb gymsys --owner gymsys
psql -U gymsys -d gymsys -f db/schema.sql
psql -U gymsys -d gymsys -f db/triggers.sql
psql -U gymsys -d gymsys -f db/seed.sql
```

### 3. Configuração da API

```bash
cp .env.example .env
```

Ajuste no `.env`:

```plaintext
HOST_BIND=127.0.0.1        # só o Caddy alcança a API
PROXIES_CONFIAVEIS=1       # senão o limitador vê todo mundo como 127.0.0.1
ENABLE_CORS=               # vazio: mesma origem dispensa CORS
TOKEN_SEG=<gere o seu>
```

O segredo:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

`PROXIES_CONFIAVEIS=1` não é detalhe: sem isso o Express lê o IP do proxy em vez
do IP real, o limite de login vira global e um único atacante tranca todo mundo.

### 4. Primeiro professor

```bash
npm run criar-professor -- --cpf 12345678901 --nome "Seu Nome" \
  --senha "umaSenhaBoa" --email voce@exemplo.com --titulo 123456789012
```

### 5. Build do front

O front precisa chamar `/api`, que é o caminho que o Caddy repassa para a API:

```bash
cd /opt/gym-sys/frontend
echo 'VITE_API_URL=/api' > .env
npm ci && npm run build
```

Isso gera `frontend/dist`, que é o diretório servido no `Caddyfile`.

### 6. Serviços

```bash
sudo cp /opt/gym-sys/deploy/gym-sys-api.service /etc/systemd/system/
sudo useradd --system --no-create-home gymsys
sudo chown -R gymsys /opt/gym-sys
sudo systemctl daemon-reload
sudo systemctl enable --now gym-sys-api

sudo cp /opt/gym-sys/deploy/Caddyfile /etc/caddy/Caddyfile
# ajuste o IP ou domínio dentro do arquivo antes
sudo systemctl reload caddy
```

Conferindo:

```bash
systemctl status gym-sys-api
journalctl -u gym-sys-api -f
curl -k https://<ip-do-servidor>/api/health
```

### 7. Certificado no celular

Na opção A do `Caddyfile` (sem domínio), o certificado é emitido pela CA interna
do Caddy. Sem instalá-la, o navegador vai reclamar de site inseguro:

```bash
sudo cat /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt
```

Passe esse arquivo para o celular e instale como certificado confiável. Se
preferir não mexer nisso, use a opção B (domínio + DuckDNS), que dá certificado
público e não exige nada no aparelho.

## Depois de subir

- Dê **IP fixo** ao servidor no roteador — o `Caddyfile` aponta para um IP.
- **Não** abra a porta no roteador enquanto o acesso for só doméstico. Para usar
  fora de casa, prefira uma VPN (WireGuard, Tailscale) a expor a API na
  internet.
- Backup do banco: `pg_dump -U gymsys gymsys > backup-$(date +%F).sql`.

## Atualizando

```bash
cd /opt/gym-sys && git pull
cd backend  && npm ci --omit=dev && sudo systemctl restart gym-sys-api
cd ../frontend && npm ci && npm run build
```

Se a atualização mexer no banco, rode a migração indicada em
`backend/db/` antes de reiniciar o serviço.
