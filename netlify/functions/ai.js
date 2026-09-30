// netlify/functions/ai.js
const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key no configurada en Netlify.' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido.' }) }; }

  const { messages, systemContext } = body;
  if (!messages || !Array.isArray(messages)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta el campo messages.' }) };
  }

  const systemPrompt = `Eres el asistente de inteligencia artificial de Back Office Empresarial, una empresa colombiana de gestión administrativa y facturación médica para doctores y especialistas.

Tu rol es ayudar al equipo administrativo con:
1. Responder preguntas sobre procesos de facturación médica, radicación de cuentas y glosas.
2. Analizar datos del sistema cuando se te comparten (doctores, procesos Kanban, tareas).
3. Redactar textos profesionales: correos, informes, notificaciones, respuestas a glosas.
4. Dar recomendaciones sobre gestión administrativa médica en Colombia.

Contexto actual del sistema:
${systemContext || 'No se compartió contexto del sistema.'}

Reglas:
- Responde siempre en español colombiano, de forma clara y profesional.
- Si te piden redactar algo, entrega el texto listo para copiar y usar.
- Si analizas datos, da conclusiones concretas y accionables.
- Mantén las respuestas concisas a menos que se pida un informe completo.`;

  const payload = JSON.stringify({
    model: 'gpt-4o-mini',
    max_tokens: 1500,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
  });

  // Llamada a OpenAI usando https nativo de Node.js (sin dependencias)
  const reply = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(json.error?.message || `OpenAI error ${res.statusCode}`));
          } else {
            resolve(json.choices?.[0]?.message?.content || 'Sin respuesta.');
          }
        } catch (e) {
          reject(new Error('Error parseando respuesta de OpenAI.'));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reply }),
  };
};
