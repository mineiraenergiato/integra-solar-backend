# ══════════════════════════════════════════════════════════════════
# Integra Solar — Dockerfile
# Node.js 22 + LibreOffice + fontes PT-BR
# ══════════════════════════════════════════════════════════════════

FROM node:22-slim

# Instalar LibreOffice + fontes necessárias para PT-BR
RUN apt-get update && apt-get install -y \
    libreoffice \
    libreoffice-writer \
    fonts-liberation \
    fonts-dejavu \
    fonts-noto \
    fontconfig \
    --no-install-recommends \
    && fc-cache -fv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Configurar diretório de trabalho
WORKDIR /app

# Instalar dependências primeiro (cache de camadas)
COPY package.json ./
RUN npm install --omit=dev

# Copiar código
COPY . .

# Usuário não-root para segurança
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
RUN chown -R appuser:appgroup /app
USER appuser

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
  CMD node -e "require('http').get('http://localhost:${PORT}/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
