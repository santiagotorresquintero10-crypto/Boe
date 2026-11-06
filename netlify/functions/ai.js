// netlify/functions/ai.js — mismo asistente IA de BOE para Netlify.
// La clave se lee de la variable de entorno OPENAI_API_KEY (nunca va escrita en el código).
const { procesar } = require('../../lib/ia-core.js');

exports.handler = async (event) => {
  const r = await procesar(event.httpMethod, event.headers, event.body);
  return { statusCode: r.statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.body) };
};
