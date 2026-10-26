import fs from 'node:fs';

// Minimal .env o'quvchi (tashqi kutubxonasiz)
try {
  for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {}

export const cfg = {
  port: Number(process.env.PORT || 3000),
  apiKey: process.env.API_KEY || '',
  agentKey: process.env.AGENT_KEY || '',
  labelW: Number(process.env.LABEL_WIDTH_MM || 40),
  labelH: Number(process.env.LABEL_HEIGHT_MM || 30),
  targets: {
    pos: {
      url: process.env.POS_URL || '',
      token: process.env.POS_TOKEN || '',
      path: process.env.POS_PRODUCTS_PATH || '/api/products',
      updatePath: process.env.POS_UPDATE_PATH || '/api/products/{id}',
    },
    ombor: {
      url: process.env.OMBOR_URL || '',
      token: process.env.OMBOR_TOKEN || '',
      path: process.env.OMBOR_PRODUCTS_PATH || '/api/products',
      updatePath: process.env.OMBOR_UPDATE_PATH || '/api/products/{id}',
    },
  },
};
