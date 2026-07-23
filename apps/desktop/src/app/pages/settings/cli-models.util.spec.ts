import { CLI_MODEL_CUSTOM, apiModelsToRestore, cliModelSelectValue } from './cli-models.util';

const CLAUDE_CLI = ['sonnet', 'opus', 'haiku'];
const CLAUDE_API = ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
const CLAUDE_DEFAULTS = { default: 'claude-opus-4-8', economy: 'claude-haiku-4-5' };

describe('cliModelSelectValue', () => {
  it('shows the empty option when nothing is set', () => {
    expect(cliModelSelectValue('', CLAUDE_CLI)).toBe('');
  });

  it('shows a known name as itself', () => {
    expect(cliModelSelectValue('sonnet', CLAUDE_CLI)).toBe('sonnet');
  });

  it('falls back to the custom option for a hand-typed name', () => {
    // A name Applye does not list is still valid for the CLI, so it must stay
    // visible and editable rather than silently resetting to the default.
    expect(cliModelSelectValue('claude-3-5-sonnet-latest', CLAUDE_CLI)).toBe(CLI_MODEL_CUSTOM);
  });

  it('treats an API model id as custom, since it is not a CLI name', () => {
    expect(cliModelSelectValue('claude-opus-4-8', CLAUDE_CLI)).toBe(CLI_MODEL_CUSTOM);
  });
});

describe('apiModelsToRestore', () => {
  // The regression this exists for: switching to CLI mode blanks both model
  // fields on purpose, and switching back used to leave them blank, so API
  // mode sent `model: ""` to the provider and every task failed.
  it('fills both fields when CLI mode left them blank', () => {
    expect(
      apiModelsToRestore({ defaultModel: '', economyModel: '' }, CLAUDE_DEFAULTS, CLAUDE_API),
    ).toEqual({ defaultModel: 'claude-opus-4-8', economyModel: 'claude-haiku-4-5' });
  });

  it('leaves a valid non-default choice alone', () => {
    expect(
      apiModelsToRestore(
        { defaultModel: 'claude-sonnet-4-6', economyModel: 'claude-haiku-4-5' },
        CLAUDE_DEFAULTS,
        CLAUDE_API,
      ),
    ).toEqual({});
  });

  it('replaces a model belonging to a different provider', () => {
    expect(
      apiModelsToRestore(
        { defaultModel: 'deepseek-v4-pro', economyModel: 'deepseek-v4-flash' },
        CLAUDE_DEFAULTS,
        CLAUDE_API,
      ),
    ).toEqual({ defaultModel: 'claude-opus-4-8', economyModel: 'claude-haiku-4-5' });
  });

  it('fixes only the field that is broken', () => {
    expect(
      apiModelsToRestore(
        { defaultModel: 'claude-sonnet-4-6', economyModel: '' },
        CLAUDE_DEFAULTS,
        CLAUDE_API,
      ),
    ).toEqual({ economyModel: 'claude-haiku-4-5' });
  });

  it('writes nothing for a provider with no defaults', () => {
    expect(apiModelsToRestore({ defaultModel: '' }, undefined, CLAUDE_API)).toEqual({});
  });

  it('handles missing settings without throwing', () => {
    expect(apiModelsToRestore(null, CLAUDE_DEFAULTS, CLAUDE_API)).toEqual({
      defaultModel: 'claude-opus-4-8',
      economyModel: 'claude-haiku-4-5',
    });
  });
});
