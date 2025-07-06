import fs from 'fs';
describe('Migration CTE mapping', () => {
  it('parses migration SQL and checks structure', () => {
    const sql = fs.readFileSync('./supabase/migrations/20250706000001_complete_verethfier_system.sql', 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS/);
    expect(sql).toMatch(/verifier_user_roles/);
    expect(sql).toMatch(/INSERT INTO/);
    expect(sql).toMatch(/SELECT/);
    expect(sql).toMatch(/Legacy data migration/);
  });
});
