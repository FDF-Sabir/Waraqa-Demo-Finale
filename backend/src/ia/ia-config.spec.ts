import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cost, KEY_PATTERN, maskedKey, price, writeEnv } from './ia-config';

describe('Configuration IA', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('estime le coût avec cache (écriture ×1,25, lecture ×0,1)', () => {
    expect(cost({ input_tokens: 1_000_000, output_tokens: 0 }, 'claude-sonnet-5')).toBe(2);
    expect(cost({ output_tokens: 1_000_000 }, 'claude-sonnet-5')).toBe(10);
    expect(cost({ cache_read_input_tokens: 1_000_000 }, 'claude-sonnet-5')).toBeCloseTo(0.2);
    expect(cost({ cache_creation_input_tokens: 1_000_000 }, 'claude-haiku-4-5')).toBeCloseTo(1.25);
    expect(price('claude-opus-5-5').input).toBe(4);
    expect(price('modele-inconnu')).toEqual({ input: 10, output: 50, known: false });
  });

  it('valide le format de clé sans l’exposer', () => {
    expect(KEY_PATTERN.test('sk-ant-api03-' + 'a'.repeat(40))).toBe(true);
    expect(KEY_PATTERN.test('pas une clé')).toBe(false);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-' + 'b'.repeat(36) + 'WXYZ';
    expect(maskedKey()).toBe('sk-ant-…WXYZ');
  });

  it('écrit la clé dans .env en conservant les autres lignes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'waraqa-env-'));
    const path = join(dir, '.env');
    writeFileSync(path, 'WARAQA_JWT_SECRET=abc\nANTHROPIC_API_KEY=\nWARAQA_PORT=3000\n');
    process.env.WARAQA_ENV_PATH = path;
    writeEnv('ANTHROPIC_API_KEY', 'sk-ant-test-' + 'c'.repeat(30));
    writeEnv('ANTHROPIC_WORKSPACE_ID', 'wrkspc_test');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('WARAQA_JWT_SECRET=abc');
    expect(content).toContain('WARAQA_PORT=3000');
    expect(content.match(/ANTHROPIC_API_KEY=/g)).toHaveLength(1);
    expect(content).toContain('ANTHROPIC_WORKSPACE_ID=wrkspc_test');
    expect(process.env.ANTHROPIC_API_KEY).toContain('sk-ant-test-');
    rmSync(dir, { recursive: true, force: true });
  });
});
