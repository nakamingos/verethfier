import fs from 'fs';
describe('Migration CTE mapping', () => {
  it('parses migration SQL and checks CTE', () => {
    const sql = fs.readFileSync('./supabase/migration/20250629045514_migrate_verifier_servers_to_rules.sql', 'utf8');
    expect(sql).toMatch(/WITH/);
    expect(sql).toMatch(/INSERT INTO/);
    expect(sql).toMatch(/SELECT/);
  });
});
