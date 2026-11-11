// netlify/functions/jarvis.js
// Proxy seguro para Gemini 2.5 Flash — API key nunca llega al navegador
const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode:405, body: JSON.stringify({error:'Method not allowed'}) };
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return { statusCode:500, body: JSON.stringify({error:'GEMINI_API_KEY no configurada en Netlify.'}) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode:400, body: JSON.stringify({error:'JSON inválido.'}) }; }

  const { messages, systemContext } = body;
  if (!messages?.length) {
    return { statusCode:400, body: JSON.stringify({error:'Falta messages.'}) };
  }

  const systemInstruction = `Eres JARVIS, el asistente de inteligencia artificial de Back Office Empresarial, una empresa colombiana de gestión administrativa y facturación médica para doctores.

Tu personalidad: profesional, conciso, ligeramente formal como el JARVIS de Iron Man. Usa frases como "Por supuesto", "Procesado", "Analizando". Responde siempre en español colombiano.

Contexto actual del sistema:
${systemContext || 'No se proporcionó contexto del sistema.'}

Reglas importantes:
- Respuestas cortas y directas (máximo 3 párrafos)
- Si te piden navegar o crear algo, confirma la acción
- Nunca inventes datos que no estén en el contexto
- Cuando des números, sé preciso
- Saluda como JARVIS de Iron Man, no como un chatbot genérico`;

  // Convertir historial al formato Gemini
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const payload = JSON.stringify({
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
  });

  const reply = await new Promise((resolve, reject) => {
    const path = `/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${GEMINI_KEY}`;
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(json.error?.message || `Gemini error ${res.statusCode}`));
          } else {
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta.';
            resolve(text);
          }
        } catch(e) { reject(new Error('Error parseando respuesta.')); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reply })
  };
};
