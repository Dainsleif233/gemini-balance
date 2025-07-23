const crypto = require('crypto');
const fs = require('fs');

const randomStr = crypto.randomBytes(32).toString('hex');
fs.writeFileSync('.env.production', `CRON_SECRET=${randomStr}\n`);

console.log('✅ Generated CRON_SECRET: ', randomStr);