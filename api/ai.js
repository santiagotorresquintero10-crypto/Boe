// Vercel Serverless Function — Asistente IA de BOE (OpenAI)
// La clave se lee de la variable de entorno OPENAI_API_KEY configurada en Vercel.
const { procesar } = require('../lib/ia-core.js');

module.exports = async (req, res) => {
  try {
    const r = await procesar(req.method, req.headers, req.body);
    res.status(r.statusCode).json(r.body);
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servicio de IA.' });
  }
};
