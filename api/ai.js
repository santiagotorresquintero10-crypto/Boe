// Vercel Serverless Function — Asistente IA de BOE (OpenAI)
// La clave se lee de la variable de entorno OPENAI_API_KEY configurada en Vercel.
const { procesar } = require('../lib/ia-core.js');

module.exports = async (req, res) => {
  // JARVIS: respuesta progresiva (líneas JSON) para que la voz empiece antes
  const stream = req.method === 'POST' && req.body && typeof req.body === 'object' && req.body.modo === 'chat' && req.body.stream === true;
  try {
    if (stream) {
      let abierto = false;
      const abrir = () => { if (abierto) return; abierto = true; res.statusCode = 200; res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8'); res.setHeader('Cache-Control', 'no-cache'); };
      const r = await procesar(req.method, req.headers, req.body, { escribir: o => { abrir(); res.write(JSON.stringify(o) + '\n'); } });
      if (!abierto && r.statusCode !== 200) return res.status(r.statusCode).json(r.body);
      abrir(); res.write(JSON.stringify(r.statusCode === 200 ? { t: 'fin', ...r.body } : { t: 'error', error: r.body?.error || 'Error' }) + '\n');
      return res.end();
    }
    const r = await procesar(req.method, req.headers, req.body);
    res.status(r.statusCode).json(r.body);
  } catch (e) {
    if (res.headersSent) { try { res.write(JSON.stringify({ t: 'error', error: 'Error interno del servicio de IA.' }) + '\n'); res.end(); } catch (x) {} return; }
    res.status(500).json({ error: 'Error interno del servicio de IA.' });
  }
};
