import { describe, expect, test } from 'bun:test';
import { csvEscape, toCsv } from '../../src/lib/server/csv';

describe('CSV helpers', () => {
  test('escapes commas, quotes, and newlines', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape('hello, world')).toBe('"hello, world"');
    expect(csvEscape('say "hello"')).toBe('"say ""hello"""');
    expect(csvEscape('line one\nline two')).toBe('"line one\nline two"');
  });

  test('converts rows to CSV', () => {
    expect(
      toCsv([
        ['name', 'answer'],
        ['Ada', 'Build agents'],
        ['Grace', 'Compiler, databases']
      ])
    ).toBe('name,answer\nAda,Build agents\nGrace,"Compiler, databases"');
  });

  test('prefixes spreadsheet formulas to reduce CSV injection risk', () => {
    expect(csvEscape('=IMPORTXML("https://example.com")')).toBe('"\'=IMPORTXML(""https://example.com"")"');
    expect(csvEscape('+SUM(1,2)')).toBe("\"'+SUM(1,2)\"");
    expect(csvEscape('-10')).toBe("'-10");
    expect(csvEscape('@cmd')).toBe("'@cmd");
  });
});
