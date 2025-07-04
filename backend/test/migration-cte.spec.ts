import fs from 'fs';
describe('Migration CTE mapping', () => {
  it('parses migration SQL and checks structure', () => {
    const sql = fs.readFileSync('./supabase/migrations/20250104000000_migrate_legacy_data.sql', 'utf8');
    expect(sql).toMatch(/DO \$\$/);
    expect(sql).toMatch(/INSERT INTO verifier_rules/);
    expect(sql).toMatch(/SELECT/);
    expect(sql).toMatch(/FROM verifier_users/);
    expect(sql).toMatch(/jsonb_each/);
  });
});
