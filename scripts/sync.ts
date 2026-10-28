import { synchronize } from '../src/lib/sync';
import { database } from '../src/lib/db';
try {
  for (const house of ['camara', 'senado'] as const) console.log(house, await synchronize(house));
} finally {
  await database().end();
}
