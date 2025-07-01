import { matchesRule } from '../src/services/utils/match-rule.util';
describe('matchesRule', () => {
  it('matches slug null/ALL', () => {
    expect(matchesRule({ slug: null }, [{ slug: 'foo', attributes: {} }])).toBe(true);
    expect(matchesRule({ slug: 'ALL' }, [{ slug: 'foo', attributes: {} }])).toBe(true);
  });
  it('matches trait', () => {
    expect(matchesRule({ attr_key: 'foo', attr_val: 'bar' }, [{ slug: 'x', attributes: { foo: 'bar' } }])).toBe(true);
    expect(matchesRule({ attr_key: 'foo', attr_val: 'baz' }, [{ slug: 'x', attributes: { foo: 'bar' } }])).toBe(false);
  });
  it('matches min_items', () => {
    expect(matchesRule({ min_items: 2 }, [{}, {}])).toBe(true);
    expect(matchesRule({ min_items: 3 }, [{}, {}])).toBe(false);
  });
  it('matches channel wildcard', () => {
    expect(matchesRule({ channel_id: null }, [], 'abc')).toBe(true);
    expect(matchesRule({ channel_id: 'abc' }, [], 'abc')).toBe(true);
    expect(matchesRule({ channel_id: 'def' }, [], 'abc')).toBe(false);
  });
});
