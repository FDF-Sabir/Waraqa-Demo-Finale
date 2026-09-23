// Les tests e2e n'utilisent jamais la clé réelle éventuellement présente dans backend/.env.
process.env.ANTHROPIC_API_KEY = '';
process.env.ANTHROPIC_WORKSPACE_ID = '';
// Les suites historiques vérifient le profil « local » (bascule manuelle du mode connecté).
// Les suites du profil en ligne le définissent explicitement.
process.env.WARAQA_PROFILE = 'local';
process.env.GOOGLE_ALLOWED_EMAIL = '';
