import 'dotenv/config';
import express from 'express';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { speechFromEnvironment } from './speech.js';
import { AzureConversationService, conversationFromEnvironment } from './conversation.js';
import { IncidentStore } from './incidentStore.js';

if (process.env.USE_MOCK_SERVICES && process.env.USE_MOCK_SERVICES !== 'true') {
  throw new Error('Connected mode is not implemented. Set USE_MOCK_SERVICES=true; no silent mock fallback is permitted.');
}
const port = Number(process.env.PORT ?? 3001);
const maxImageMb = Number(process.env.MAX_IMAGE_MB ?? 8);
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(maxImageMb) || maxImageMb <= 0 || maxImageMb > 100) {
  throw new Error('Invalid PORT or MAX_IMAGE_MB environment setting.');
}
const conversation = conversationFromEnvironment();
if (process.env.ENABLE_FOUNDRY_VISION && !['true', 'false'].includes(process.env.ENABLE_FOUNDRY_VISION)) {
  throw new Error('ENABLE_FOUNDRY_VISION must be true or false.');
}
const vision = process.env.ENABLE_FOUNDRY_VISION === 'true' && conversation instanceof AzureConversationService ? conversation : undefined;
if (process.env.ENABLE_FOUNDRY_VISION === 'true' && !vision) {
  throw new Error('Azure vision requires ENABLE_FOUNDRY_CONVERSATION=true and a configured Azure model. No mock fallback was used.');
}
if (conversation.status().configured) await conversation.prepare();
const app = createApp({ maxImageBytes: maxImageMb * 1024 * 1024, speech: speechFromEnvironment(), conversation, vision,
  skillDirectory: process.env.SKILL_LIBRARY_DIRECTORY,
  incidentStore: new IncidentStore(process.env.INCIDENT_DATABASE_PATH ?? resolve('.local', 'quality-demo.sqlite')) });
const dist = resolve('dist');
app.use(express.static(dist, { index: 'index.html' }));
app.listen(port, process.env.HOST ?? '127.0.0.1', (error?: Error) => {
  if (error) {
    console.error(JSON.stringify({ at: new Date().toISOString(), event: 'startup.failed', port, error: error.message }));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ at: new Date().toISOString(), event: 'ready', port, mode: 'synthetic-mock' }));
});
