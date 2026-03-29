# Integra Solar — Backend de Propostas em PDF

Backend Node.js para geração de propostas em PDF com qualidade profissional, usando LibreOffice headless para conversão fiel do template Word.

---

## Arquitetura

```
Plataforma HTML (browser)
        │
        │ POST /api/gerar-proposta
        │ { template, dados }
        ▼
Backend Node.js (Railway)
        │
        ├─ docxtemplater → preenche placeholders no .docx
        │
        ├─ LibreOffice headless → converte .docx para .pdf
        │
        └─ Supabase Storage → salva PDF gerado
```

---

## Endpoints

### `GET /health`
Verifica se o servidor está rodando.

```json
{ "status": "ok", "service": "Integra Solar", "version": "1.0.0" }
```

---

### `POST /api/gerar-proposta`
Gera um PDF a partir de um template `.docx` e dados da proposta.

**Headers:**
- `X-Api-Key: sua-api-key`
- `Content-Type: multipart/form-data`

**Body (form-data):**
| Campo | Tipo | Descrição |
|---|---|---|
| `template_file` | File (.docx) | Template Word **ou** |
| `template_path` | String | Caminho no Supabase Storage |
| `dados` | JSON string | Dados para substituir os placeholders |
| `org_id` | String | ID da organização |
| `prop_id` | String | ID da proposta (para salvar no Storage) |
| `nome` | String | Nome do arquivo PDF (sem extensão) |
| `salvar` | `"true"` | Se deve salvar no Supabase Storage |

**Resposta:** arquivo `.pdf` para download

---

### `POST /api/testar-template`
Testa um template com dados de exemplo.

**Body:** `template_file` (.docx)  
**Resposta:** PDF com dados fictícios para verificar o layout

---

### `GET /api/proposta/:id?org_id=xxx`
Obtém a URL de download de um PDF já gerado.

---

## Placeholders suportados

Use no template Word no formato `{chave}`:

| Chave | Exemplo |
|---|---|
| `{nome_cliente}` | João da Silva |
| `{cidade_cliente}` | Palmas |
| `{potencia_kwp}` | 8,25 kWp |
| `{geracao_mensal}` | 998 kWh |
| `{geracao_anual}` | 11.979 kWh |
| `{valor_projeto}` | R$ 28.500,00 |
| `{data_proposta}` | 28/03/2026 |
| `{validade_proposta}` | 27/04/2026 |
| `{vendedor}` | Carlos Souza |
| `{economia_mensal}` | R$ 848,30 |
| `{payback}` | 2,8 anos |

---

## Deploy no Railway

### Passo 1 — Criar conta e projeto

1. Acesse [railway.app](https://railway.app) e crie uma conta gratuita
2. Clique em **New Project → Deploy from GitHub**
3. Conecte seu repositório GitHub com o conteúdo desta pasta

### Passo 2 — Configurar variáveis de ambiente

No Railway, vá em **Variables** e adicione:

```env
SUPABASE_URL=https://tlpmkyrzexqxiywvsktx.supabase.co
SUPABASE_KEY=sua-service-role-key-aqui
STORAGE_BUCKET=integra-solar-docs
API_KEY=integra-solar-api-2025
ALLOWED_ORIGINS=*
```

> ⚠️ Use a **service_role key** do Supabase (não a anon key).  
> Acesse: Supabase → Settings → API → `service_role` (secret)

### Passo 3 — Deploy automático

O Railway detecta o `Dockerfile` automaticamente e faz o build com LibreOffice incluído.

Aguarde ~3-5 minutos para o primeiro deploy (instalação do LibreOffice é lenta).

### Passo 4 — Obter a URL do serviço

Railway gera uma URL do tipo:
```
https://integra-solar-backend-production.up.railway.app
```

Copie essa URL — você precisará dela para configurar na plataforma.

---

## Configurar a Plataforma HTML

Após o deploy, configure na plataforma a URL do backend:

1. Abra `integra_solar_v5.html` em um editor de texto
2. Localize a linha:
   ```javascript
   const BACKEND_URL = '';
   const BACKEND_API_KEY = '';
   ```
3. Preencha com suas credenciais:
   ```javascript
   const BACKEND_URL = 'https://integra-solar-backend-production.up.railway.app';
   const BACKEND_API_KEY = 'integra-solar-api-2025';
   ```

---

## Testar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Criar arquivo .env (copiar de .env.example e preencher)
cp .env.example .env

# 3. Iniciar servidor
npm start

# 4. Em outro terminal, executar testes
npm test
```

---

## Custo estimado no Railway

| Recurso | Uso estimado | Custo |
|---|---|---|
| CPU | ~2-5s por proposta | Incluso no free tier |
| RAM | ~512MB | Incluso no free tier |
| Disco | ~1GB (LibreOffice) | Incluso |
| **Total** | Até 500 conversões/mês | **Gratuito** |

O plano gratuito do Railway oferece $5/mês de créditos — o suficiente para uso normal.

---

## Suporte

Gerado pela plataforma **Integra Solar v5** — Sistema de Gestão.
