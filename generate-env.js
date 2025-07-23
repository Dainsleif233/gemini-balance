import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';

const randomStr = randomBytes(32).toString('hex');
writeFileSync('.env.production', `CRON_SECRET=${randomStr}\n`);

console.log('✅ Generated CRON_SECRET');