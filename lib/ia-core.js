// lib/ia-core.js
// Núcleo único de IA de BOE (OpenAI). Lo usan api/ai.js (Vercel) y netlify/functions/ai.js.
//   modo 'chat'  → asistente con herramientas (las consultas las ejecuta BOE en el navegador
//                  con funciones determinísticas; aquí solo se definen y se interpreta)
//   modo 'pdf'   → lectura de una factura PDF (texto y/o imágenes de las páginas)
//   sin modo     → compatibilidad con el formato anterior {messages, systemContext}
// Toda llamada exige una sesión válida de Firebase (token de BOE).
// La clave de OpenAI se lee SOLO de la variable de entorno OPENAI_API_KEY (Vercel / Netlify).

const MODELO = process.env.OPENAI_MODEL || 'gpt-4o-mini';
// Clave web PÚBLICA de Firebase (la misma de script.js); solo sirve para validar sesiones.
const FIREBASE_WEB_KEY = 'AIzaSyBZsx9UGOGijy5WYdDzWIZcpt355gRTe-Y';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const resp = (statusCode, obj) => ({ statusCode, body: obj });

/* ── Sesión de Firebase ── */
const _tokOk = new Map(); // token → {email, hasta}
async function verificarSesion(h) {
  h = h || {};
  const auth = h.authorization || h.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const c = _tokOk.get(token);
  if (c && c.hasta > Date.now()) return c;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
    });
    if (!r.ok) return null;
    const j = await r.json();
    const u = j.users && j.users[0];
    if (!u) return null;
    const ses = { email: u.email || '', uid: u.localId, hasta: Date.now() + 10 * 60 * 1000 };
    if (_tokOk.size > 200) _tokOk.clear();
    _tokOk.set(token, ses);
    return ses;
  } catch (e) { return null; }
}

/* ── OpenAI ── */
async function openai(payload) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(payload)
  });
  let j = null;
  try { j = await r.json(); } catch (e) { /* respuesta no JSON */ }
  if (!r.ok) {
    const code = j?.error?.code || '';
    const msg = code === 'insufficient_quota' ? 'La cuenta de OpenAI no tiene saldo. Carga créditos en platform.openai.com → Billing.'
      : code === 'invalid_api_key' ? 'La clave de OpenAI no es válida o fue revocada.'
      : (j?.error?.message || `OpenAI respondió ${r.status}`);
    const e = new Error(msg); e.status = r.status === 429 ? 429 : 502; e.code = code; throw e;
  }
  return j;
}

/* ── Herramientas que el modelo puede pedir (se ejecutan en BOE, en el navegador) ── */
const fn = (name, description, properties, required = []) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } }
});
const P_MES = { type: 'string', enum: MESES, description: 'Mes en minúscula' };
const HERRAMIENTAS = [
  fn('consultar_facturacion', 'Facturación registrada en la sección Reportes (colección facturas): totales por especialista y por entidad para un año y opcionalmente un mes. Úsala para "¿cuánto hemos facturado?", "¿cuánto facturó X en octubre?".',
    { anio: { type: 'integer' }, mes: P_MES, doctor: { type: 'string', description: 'Nombre o parte del nombre del especialista/cliente' }, entidad: { type: 'string' } }, ['anio']),
  fn('comparar_periodos', 'Compara la facturación de Reportes de un mes contra el mes anterior, por especialista. Úsala para disminuciones o aumentos.',
    { anio: { type: 'integer' }, mes: P_MES, doctor: { type: 'string' } }, ['anio', 'mes']),
  fn('consultar_pagos_pendientes', 'Facturas madre de UROEXPERTOS sin fecha de pago y honorarios de especialistas (facturas hijas) asociados. Úsala para honorarios pendientes de pago o facturas pendientes de una entidad (p. ej. Panamericana).',
    { entidad: { type: 'string', description: 'Entidad/clínica de la factura madre' }, doctor: { type: 'string', description: 'Especialista de las facturas hijas' }, dias_minimos: { type: 'integer', description: 'Solo las facturadas hace al menos N días' } }),
  fn('consultar_egresos', 'Busca facturas madre de UROEXPERTOS (con sus hijas) por entidad, mes de honorario (YYYY-MM) o número de factura.',
    { entidad: { type: 'string' }, honorario_mes: { type: 'string', description: 'YYYY-MM' }, factura: { type: 'string' } }),
  fn('consultar_clientes', 'Clientes/especialistas registrados en la sección Clientes. Filtros de datos incompletos.',
    { filtro: { type: 'string', enum: ['todos', 'sin_correo', 'sin_nit', 'incompletos'] }, doctor: { type: 'string' } }, ['filtro']),
  fn('consultar_alertas', 'Alertas de facturación calculadas por reglas fijas de BOE: duplicados, diferencias, conciliación madre/hijas, pagos pendientes, disminuciones, datos incompletos.',
    { tipo: { type: 'string', enum: ['todas', 'duplicidad', 'diferencia', 'conciliacion', 'pendiente', 'disminucion', 'incompleto'] }, prioridad: { type: 'string', enum: ['todas', 'alta', 'media', 'baja'] } }),
  fn('consultar_documentos', 'Facturas PDF cargadas y asociadas a los reportes de un especialista y periodo.',
    { doctor: { type: 'string' }, anio: { type: 'integer' }, mes: P_MES }),
  fn('listar_especialistas', 'Lista de especialistas/clientes registrados (nombres).', {})
];

function promptSistema(ctx) {
  return `Eres el asistente de BOE (Back Office Empresarial), empresa colombiana de gestión administrativa y facturación médica.
Usuario: ${ctx.usuario || 'usuario'}. Fecha de hoy: ${ctx.hoy || new Date().toISOString().slice(0, 10)}.
Secciones a las que este usuario tiene acceso: ${(ctx.secciones || []).join(', ') || 'no informado'}.

REGLAS OBLIGATORIAS
1. Para cualquier cifra, registro, nombre o estado de BOE usa SIEMPRE las herramientas. Nunca inventes ni estimes datos.
2. No hagas cálculos propios con los montos: usa los totales que devuelven las herramientas (ya vienen calculados por BOE).
3. En cada respuesta financiera indica el periodo consultado y cuántos registros se usaron (campos "periodo" y "registros" de la herramienta).
4. Si una herramienta responde "sin_acceso" o no hay datos suficientes, dilo claramente y no completes con suposiciones.
5. Las alertas son POSIBLES anomalías detectadas por reglas: nunca las presentes como errores confirmados.
6. Si la pregunta no indica año o mes, usa el periodo más reciente con datos que informe la herramienta y dilo.
7. Si la pregunta no tiene que ver con datos de BOE (redactar un correo, explicar un concepto), responde directamente sin herramientas.
8. Responde en español de Colombia, directo y breve. Montos con formato $ 1.234.567. Usa viñetas cortas cuando listes registros (máximo 10; si hay más, di cuántos faltan).`;
}

const MIME_OK = /^data:image\/(png|jpe?g|webp);base64,/;

/* ── Lectura de factura PDF ── */
const CAMPO = { type: 'object', additionalProperties: false, required: ['valor', 'confianza'],
  properties: { valor: { type: ['string', 'null'] }, confianza: { type: 'string', enum: ['alta', 'media', 'baja'] } } };
const CAMPOS_PDF = ['numero_factura', 'fecha_emision', 'emisor_nombre', 'emisor_nit', 'cliente_entidad', 'cliente_nit',
  'valor_total', 'subtotal', 'iva', 'concepto', 'profesional', 'periodo_servicio'];
const ESQUEMA_PDF = {
  name: 'factura_boe', strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['es_factura', 'campos', 'observaciones'],
    properties: {
      es_factura: { type: 'boolean' },
      observaciones: { type: 'string' },
      campos: { type: 'object', additionalProperties: false, required: CAMPOS_PDF,
        properties: Object.fromEntries(CAMPOS_PDF.map(k => [k, CAMPO])) }
    } }
};
const PROMPT_PDF = `Extraes datos de facturas colombianas (factura electrónica, cuenta de cobro o documento equivalente) para BOE.
Reglas estrictas:
- Copia SOLO lo que está escrito en el documento. Si un dato no aparece, valor = null.
- No deduzcas ni completes valores faltantes. No conviertas una lectura dudosa en un dato seguro: si no se lee con claridad, confianza = "baja".
- numero_factura: número/prefijo completo tal como aparece (ej. "FE-1234").
- fecha_emision: formato AAAA-MM-DD.
- emisor_*: quien emite/cobra (el profesional o su empresa). cliente_*: a quién se le factura (entidad, clínica, EPS).
- valor_total: el VALOR TOTAL FACTURADO del documento ("Total factura", "Total a pagar" de la factura, "Valor total"). NO uses el subtotal, retenciones (retefuente, reteICA, reteIVA), abonos, anticipos, saldo pendiente, valor pagado ni otros importes. Si hay varios totales posibles y no es claro cuál es el total facturado, pon el más probable con confianza "baja" y explica la duda en observaciones.
- valor_total, subtotal, iva: solo dígitos, sin puntos ni símbolos, sin decimales salvo que existan centavos (ej. "4250000").
- cliente_entidad: nombre de la clínica o entidad a la que se dirige la factura (el adquiriente/cliente), tal como aparece.
- profesional: nombre del médico/especialista que aparece en el documento, si aparece.
- periodo_servicio: periodo de los servicios facturados si el documento lo dice (texto literal).
- es_factura: false si el documento claramente no es una factura ni cuenta de cobro.
- observaciones: frase corta en español con lo que no se pudo leer o lo que parece inusual (vacía si nada).`;

/* method, headers (objeto), body (objeto ya parseado o texto JSON) → { statusCode, body } */
async function procesar(method, headers, rawBody) {
  if (method !== 'POST') return resp(405, { error: 'Método no permitido' });
  if (!process.env.OPENAI_API_KEY) return resp(500, { error: 'Falta la variable de entorno OPENAI_API_KEY en el servidor.' });

  const ses = await verificarSesion(headers);
  if (!ses) return resp(401, { error: 'Sesión no válida. Vuelve a iniciar sesión en BOE.' });

  let body;
  if (rawBody && typeof rawBody === 'object' && !Buffer.isBuffer(rawBody)) body = rawBody;
  else { try { body = JSON.parse(rawBody ? String(rawBody) : '{}'); } catch { return resp(400, { error: 'JSON inválido.' }); } }

  try {
    /* ── Asistente con herramientas ── */
    if (body.modo === 'chat') {
      const msgs = Array.isArray(body.messages) ? body.messages.slice(-30) : null;
      if (!msgs || !msgs.length) return resp(400, { error: 'Falta messages.' });
      const j = await openai({
        model: MODELO, temperature: 0.2, max_tokens: 900,
        messages: [{ role: 'system', content: promptSistema(body.contexto || {}) }, ...msgs],
        tools: HERRAMIENTAS, tool_choice: 'auto', parallel_tool_calls: true
      });
      const m = j.choices?.[0]?.message || { role: 'assistant', content: 'Sin respuesta.' };
      return resp(200, { message: { role: 'assistant', content: m.content || null, ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) }, uso: j.usage || null });
    }

    /* ── Lectura de factura PDF ── */
    if (body.modo === 'pdf') {
      const texto = String(body.texto || '').slice(0, 24000);
      const imgs = (Array.isArray(body.imagenes) ? body.imagenes : []).filter(s => typeof s === 'string' && MIME_OK.test(s)).slice(0, 4);
      if (!texto.trim() && !imgs.length) return resp(400, { error: 'El PDF no tiene texto ni imágenes legibles.' });
      const partes = [{ type: 'text', text: `Archivo: ${body.archivo || 'factura.pdf'}\n\n` + (texto.trim() ? `TEXTO EXTRAÍDO DEL PDF:\n${texto}` : 'El PDF es escaneado: lee los datos de las imágenes de sus páginas.') }];
      imgs.forEach(u => partes.push({ type: 'image_url', image_url: { url: u, detail: 'high' } }));
      const j = await openai({
        model: MODELO, temperature: 0, max_tokens: 900,
        messages: [{ role: 'system', content: PROMPT_PDF }, { role: 'user', content: partes }],
        response_format: { type: 'json_schema', json_schema: ESQUEMA_PDF }
      });
      let datos;
      try { datos = JSON.parse(j.choices?.[0]?.message?.content || ''); } catch { return resp(502, { error: 'La IA no devolvió datos legibles. Intenta de nuevo.' }); }
      return resp(200, { datos, fuente: texto.trim() ? (imgs.length ? 'texto+imagen' : 'texto') : 'imagen', uso: j.usage || null });
    }

    /* ── Formato anterior (compatibilidad) ── */
    const { messages, systemContext } = body;
    if (!Array.isArray(messages)) return resp(400, { error: 'Falta el campo messages.' });
    const j = await openai({
      model: MODELO, max_tokens: 1500, temperature: 0.7,
      messages: [{ role: 'system', content: `Eres el asistente de Back Office Empresarial. Responde en español colombiano, claro y profesional.\n\nContexto:\n${systemContext || 'Sin contexto.'}` }, ...messages]
    });
    return resp(200, { reply: j.choices?.[0]?.message?.content || 'Sin respuesta.' });
  } catch (e) {
    return resp(e.status || 500, { error: e.message || 'Error interno.' });
  }
}

module.exports = { procesar };
