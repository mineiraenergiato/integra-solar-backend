/**
 * Integra Solar — Backend de Propostas em PDF
 * Node.js + Express + LibreOffice headless + Supabase
 */
'use strict';

const express   = require('express');
const cors      = require('cors');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');
const { exec }  = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { v4: uuidv4 } = require('uuid');
const PizZip         = require('pizzip');
const Docxtemplater  = require('docxtemplater');
const { createClient } = require('@supabase/supabase-js');

const PORT           = process.env.PORT           || 3000;
const SUPABASE_URL   = process.env.SUPABASE_URL   || 'https://tlpmkyrzexqxiywvsktx.supabase.co';
const SUPABASE_KEY   = process.env.SUPABASE_KEY   || '';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'integra-solar-docs';
const API_KEY        = process.env.API_KEY;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app      = express();

app.use(cors({ origin: ALLOWED_ORIGINS, methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Api-Key','x-api-key'] }));
app.use(express.json({ limit: '10mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 52428800 },
  fileFilter: (_req, file, cb) => cb(null, file.originalname.endsWith('.docx') || file.mimetype.includes('docx')),
});

function auth(req, res, next) {
  if (API_KEY && (req.headers['x-api-key'] || req.query.apiKey) !== API_KEY) {
    return res.status(401).json({ error: 'API key inválida' });
  }
  next();
}

const DEMO = {
  nome_cliente: 'João da Silva', cpf_cliente: '000.000.000-00',
  telefone_cliente: '(63) 99999-9999', email_cliente: 'joao@email.com',
  cidade_cliente: 'Palmas', estado_cliente: 'TO', endereco_cliente: 'Rua Exemplo, 123',
  tipo_sistema: 'On-Grid', potencia_kwp: '8,25 kWp', geracao_mensal: '998 kWh',
  geracao_anual: '11.979 kWh', qtd_modulos: '22', potencia_modulo: '375 W',
  marca_modulo: 'Jinko Solar', qtd_inversores: '1', potencia_inversor: '8 kW',
  marca_inversor: 'Growatt', fornecedor: 'Solar Distribuidora',
  valor_projeto: 'R$ 28.500,00', valor_kit: 'R$ 14.800,00', valor_instalacao: 'R$ 2.200,00',
  forma_pagamento: 'Financiamento 60x',
  data_proposta: new Date().toLocaleDateString('pt-BR'),
  validade_proposta: new Date(Date.now() + 30*86400000).toLocaleDateString('pt-BR'),
  numero_proposta: 'PROP-DEMO-v1', vendedor: 'Carlos Souza',
  empresa_nome: 'Integra Solar', empresa_telefone: '(63) 3000-0000',
  empresa_email: 'contato@integrasolar.com.br',
  economia_mensal: 'R$ 848,30', economia_anual: 'R$ 10.179,60',
  payback: '2,8 anos', reducao_co2: '5.170 kg',
};

function preencher(buffer, dados) {
  const zip  = new PizZip(buffer);
  const docx = new Docxtemplater(zip, {
    paragraphLoop: true, linebreaks: true,
    delimiters: { start: '{', end: '}' },
    errorLogging: false, nullGetter: () => '',
  });
  docx.render({ ...DEMO, ...dados });
  return docx.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function toPdf(docxBuf, nome) {
  const tmp  = os.tmpdir();
  const id   = uuidv4().slice(0, 8);
  const docx = path.join(tmp, `is_${id}_${nome}.docx`);
  const pdf  = path.join(tmp, `is_${id}_${nome}.pdf`);
  try {
    fs.writeFileSync(docx, docxBuf);
    await execAsync(`soffice --headless --convert-to pdf --outdir "${tmp}" "${docx}"`, { timeout: 90000 });
    if (!fs.existsSync(pdf)) {
      const found = fs.readdirSync(tmp).find(f => f.includes(id) && f.endsWith('.pdf'));
      if (!found) throw new Error('LibreOffice não gerou PDF');
      return fs.readFileSync(path.join(tmp, found));
    }
    return fs.readFileSync(pdf);
  } finally {
    [docx, pdf].forEach(f => { try { fs.existsSync(f) && fs.unlinkSync(f); } catch {} });
  }
}

app.get('/health', (_req, res) => res.json({
  status: 'ok', service: 'Integra Solar — Backend', version: '1.0.0',
  timestamp: new Date().toISOString(),
}));

app.post('/api/testar-template', auth, upload.single('template_file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Envie o arquivo .docx como template_file' });
  try {
    const pdfBuf = await toPdf(preencher(req.file.buffer, {}), 'teste');
    const xml    = new PizZip(req.file.buffer).files['word/document.xml']?.asText() || '';
    const found  = [...new Set([...xml.matchAll(/\{([a-z_]+)\}/g)].map(m => m[1]))];
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="TESTE_${req.file.originalname.replace('.docx','.pdf')}"`,
      'Content-Length': pdfBuf.length,
      'X-Placeholders-Found': found.join(','),
      'X-Placeholders-Count': found.length,
    });
    res.send(pdfBuf);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao testar template: ' + e.message });
  }
});

app.post('/api/gerar-proposta', auth, upload.single('template_file'), async (req, res) => {
  const t0 = Date.now();
  try {
    let templateBuf;
    if (req.file) {
      templateBuf = req.file.buffer;
    } else if (req.body.template_path) {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(req.body.template_path);
      if (error) return res.status(400).json({ error: 'Template não encontrado: ' + error.message });
      templateBuf = Buffer.from(await data.arrayBuffer());
    } else {
      return res.status(400).json({ error: 'Forneça template_file ou template_path' });
    }

    let dados = {};
    try { dados = typeof req.body.dados === 'string' ? JSON.parse(req.body.dados) : (req.body.dados || {}); }
    catch { return res.status(400).json({ error: '"dados" deve ser JSON válido' }); }

    const nome   = (req.body.nome || `Proposta_${uuidv4().slice(0,8)}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const orgId  = req.body.org_id  || 'default';
    const propId = req.body.prop_id || uuidv4();
    const salvar = req.body.salvar === 'true';

    let docxFilled;
    try { docxFilled = preencher(templateBuf, dados); }
    catch (e) {
      const msg = e.properties?.errors?.map(er => er.properties?.id || er.message).join(', ') || e.message;
      return res.status(422).json({ error: 'Erro nos placeholders: ' + msg });
    }

    const pdfBuf = await toPdf(docxFilled, nome);
    console.log(`[Proposta] PDF: ${(pdfBuf.length/1024).toFixed(1)}KB em ${Date.now()-t0}ms`);

    if (salvar) {
      await supabase.storage.from(STORAGE_BUCKET)
        .upload(`${orgId}/propostas/${propId}/${nome}.pdf`, pdfBuf, { contentType: 'application/pdf', upsert: true });
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nome}.pdf"`,
      'Content-Length': pdfBuf.length,
      'X-Prop-Id': propId,
      'X-Elapsed-Ms': Date.now() - t0,
    });
    res.send(pdfBuf);
  } catch (e) {
    console.error('[Proposta]', e.message);
    res.status(500).json({ error: 'Erro ao gerar proposta: ' + e.message });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\nIntegra Solar Backend rodando na porta ${PORT}`);
  console.log(`Supabase: ${SUPABASE_URL}\n`);
});

module.exports = app;
