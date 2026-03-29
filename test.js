/**
 * Integra Solar — Teste do Backend
 * Executa: node test.js
 *
 * Testa todos os endpoints com um template .docx de exemplo.
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const API_KEY  = process.env.API_KEY  || 'integra-solar-api-2025';

// ── Funções auxiliares ───────────────────────────────────────────
function req(method, endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url  = new URL(BASE_URL + endpoint);
    const opts = {
      hostname: url.hostname,
      port:     url.port || 3000,
      path:     url.pathname + url.search,
      method,
      headers:  { 'x-api-key': API_KEY, ...options.headers },
    };

    const r = http.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });

    r.on('error', reject);
    if (options.body) r.write(options.body);
    r.end();
  });
}

function multipartForm(fields, file) {
  const boundary = '----IntegraSolarBoundary' + Date.now();
  const parts    = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
      `${value}\r\n`
    );
  }

  if (file) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="template_file"; filename="${file.name}"\r\n` +
      `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`
    );
  }

  const header = Buffer.from(parts.join(''));
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

  const body = file
    ? Buffer.concat([header, file.buffer, footer])
    : Buffer.concat([header, footer]);

  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

// Criar um .docx simples para teste (usando apenas texto XML mínimo)
function criarDocxMinimo() {
  // PizZip não está disponível aqui — usar arquivo existente se disponível
  const testFile = path.join(__dirname, 'test-template.docx');
  if (fs.existsSync(testFile)) return fs.readFileSync(testFile);
  return null;
}

// ── Testes ───────────────────────────────────────────────────────
async function runTests() {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  Integra Solar — Teste do Backend');
  console.log('══════════════════════════════════════════');
  console.log(`  URL: ${BASE_URL}`);
  console.log('');

  let passed = 0, failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`    → ${e.message}`);
      failed++;
    }
  }

  // ── 1. Health check
  await test('GET /health → 200', async () => {
    const r = await req('GET', '/health');
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    const body = JSON.parse(r.body.toString());
    if (body.status !== 'ok') throw new Error('Status não é ok');
    console.log(`     → ${body.service} v${body.version}`);
  });

  // ── 2. Auth check
  await test('GET /health sem API key → 200 (endpoint público)', async () => {
    const r = await req('GET', '/health', { headers: { 'x-api-key': '' } });
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
  });

  await test('POST /api/gerar-proposta sem API key → 401', async () => {
    const r = await req('POST', '/api/gerar-proposta', { headers: { 'x-api-key': 'chave-errada' } });
    if (r.status !== 401) throw new Error(`Esperava 401, recebeu ${r.status}`);
  });

  // ── 3. Gerar proposta com template
  const templateBuf = criarDocxMinimo();
  if (templateBuf) {
    await test('POST /api/testar-template → PDF', async () => {
      const { body, contentType } = multipartForm({}, { name: 'template.docx', buffer: templateBuf });
      const r = await req('POST', '/api/testar-template', {
        headers: { 'content-type': contentType, 'x-api-key': API_KEY },
        body,
      });
      if (r.status !== 200) throw new Error(`Status ${r.status} — ${r.body.toString().slice(0,200)}`);
      if (r.headers['content-type'] !== 'application/pdf') throw new Error('Resposta não é PDF');
      const sizeKb = Math.round(r.body.length / 1024);
      console.log(`     → PDF gerado: ${sizeKb} KB`);
      fs.writeFileSync('/tmp/test-output.pdf', r.body);
      console.log(`     → Salvo em /tmp/test-output.pdf`);
    });
  } else {
    console.log('  ⚠ Coloque um arquivo test-template.docx na pasta para testar a conversão');
  }

  // ── 4. Erro esperado sem template
  await test('POST /api/gerar-proposta sem template → 400', async () => {
    const { body, contentType } = multipartForm({ dados: '{"nome": "Teste"}' });
    const r = await req('POST', '/api/gerar-proposta', {
      headers: { 'content-type': contentType, 'x-api-key': API_KEY },
      body,
    });
    if (r.status !== 400) throw new Error(`Esperava 400, recebeu ${r.status}`);
  });

  // ── Resultado
  console.log('');
  console.log(`══════════════════════════════════════════`);
  console.log(`  Resultado: ${passed} passou, ${failed} falhou`);
  console.log(`══════════════════════════════════════════`);
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Erro nos testes:', e.message);
  console.error('O servidor está rodando em', BASE_URL, '?');
  process.exit(1);
});
