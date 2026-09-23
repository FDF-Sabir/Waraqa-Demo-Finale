// Les tests e2e n'utilisent jamais la clé réelle éventuellement présente dans backend/.env.
process.env.ANTHROPIC_API_KEY = '';
process.env.ANTHROPIC_WORKSPACE_ID = '';
