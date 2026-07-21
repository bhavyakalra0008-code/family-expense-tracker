import app from './app.js';
import { config } from './config/index.js';

app.listen(config.port, () => {
  console.log(`🚀 Ledger Backend Server running on http://localhost:${config.port}`);
  console.log(`📊 Health Check: http://localhost:${config.port}/api/health`);
});
