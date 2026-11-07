import { expect, test } from 'bun:test';
import { makeSwarms } from '../src/lib/scene/swarm';

test('a swarm that has come to rest stops building its tables, however long the result stays up', () => {
  const { D } = makeSwarms(1);
  D.start(0);
  for (let t = 0; t < 3; t += 0.1) D.feed(t, 500);
  D.end(3);
  const tables = D as unknown as { xs: number[]; phis: number[] };
  const settled = tables.xs.length;
  D.advance(3600);
  expect(tables.xs.length).toBe(settled);
  expect(tables.phis.length).toBeLessThan(settled + 2);
});
