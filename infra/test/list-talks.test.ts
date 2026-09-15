/**
 * `collection` is a DynamoDB reserved keyword. Using it literally in an
 * expression makes the request fail with a ValidationException at runtime —
 * which nothing in a synth or a type check can see, and which took the whole
 * /talks endpoint down for every user.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const source = fs.readFileSync(
  path.join(__dirname, '../lambda/api/list-talks.ts'),
  'utf8',
);

describe('list-talks expressions', () => {
  it('never names a reserved keyword literally in an expression', () => {
    const expressions = source.match(/(?:KeyCondition|Projection|Filter)Expression:\s*'[^']*'/g) ?? [];
    expect(expressions.length).toBeGreaterThan(0);
    for (const expression of expressions) {
      expect(expression).not.toMatch(/\bcollection\b/);
    }
  });

  it('binds the name through a placeholder instead', () => {
    expect(source).toContain("'#c': 'collection'");
  });
});
