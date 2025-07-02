import { matchesRule } from '../src/services/utils/match-rule.util';
describe('matchesRule', () => {
  const baseRule = {
    slug: null,
    channel_id: null,
    attr_key: null,
    attr_val: null,
    min_items: 1,
  };
  const assets = [
    { slug: 'foo', attributes: { trait: 'bar' } },
    { slug: 'baz', attributes: { trait: 'qux' } },
  ];

  it('matches slug null/ALL', () => {
    expect(matchesRule({ slug: null }, [{ slug: 'foo', attributes: {} }])).toBe(true);
    expect(matchesRule({ slug: 'ALL' }, [{ slug: 'foo', attributes: {} }])).toBe(true);
  });
  it('matches trait', () => {
    expect(matchesRule({ attribute_key: 'foo', attribute_value: 'bar' }, [{ slug: 'x', attributes: { foo: 'bar' } }])).toBe(true);
    expect(matchesRule({ attribute_key: 'foo', attribute_value: 'baz' }, [{ slug: 'x', attributes: { foo: 'bar' } }])).toBe(false);
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

  it('matches wildcard slug (null and ALL)', () => {
    expect(matchesRule({ ...baseRule, slug: null }, assets)).toBe(true);
    expect(matchesRule({ ...baseRule, slug: 'ALL' }, assets)).toBe(true);
  });

  it('rejects if trait key/value missing', () => {
    const rule = { ...baseRule, attribute_key: 'missing', attribute_value: 'nope' };
    expect(matchesRule(rule, assets)).toBe(false);
  });

  it('accepts default min_items=1', () => {
    expect(matchesRule({ ...baseRule, min_items: 1 }, assets)).toBe(true);
  });

  it('rejects if min_items > asset count', () => {
    expect(matchesRule({ ...baseRule, min_items: 3 }, assets)).toBe(false);
  });

  it('rejects if min_items=0 (should require at least 1)', () => {
    expect(matchesRule({ ...baseRule, min_items: 0 }, assets)).toBe(false);
  });
});
