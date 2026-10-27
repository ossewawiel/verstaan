// SPDX-License-Identifier: MPL-2.0
// The boarding pass copies a line that sits inside a double-quoted shell string (issue 191), so it
// must only carry allow-listed values, and its format must match the server's composeQuestPrompt.
import { describe, it, expect } from 'vitest';
import { boardingLine } from '../src/components/BoardingPass';
import { composeQuestPrompt, ORCHESTRATOR_MODEL } from '../../server/src/jobs/kinds';

describe('boardingLine (issue 191)', () => {
  it('boards at sonnet and carries the quest loadout for the first pass, whatever the quest model', () => {
    expect(boardingLine('/factory-run 10', 'implementer', 'opus', 'high')).toBe(
      'claude --model sonnet "/factory-run 10 first pass: agent=implementer model=opus effort=high"',
    );
  });

  it('never copies shell text from a bad effort or agent', () => {
    const line = boardingLine('/factory-run 10', 'x$(id)', 'opus', '$(touch /tmp/pwned)') ?? '';
    expect(line).not.toContain('$(');
    expect(line).toBe('claude --model sonnet "/factory-run 10 first pass: model=opus"');
  });

  it('gives no line for a model outside the allow-list', () => {
    expect(boardingLine('/factory-run 10', 'implementer', '$(id)', 'low')).toBeNull();
  });

  it('matches the server composeQuestPrompt format', () => {
    const server = composeQuestPrompt('/factory-run 10', { agent: 'implementer', model: 'opus', effort: 'high' });
    expect(boardingLine('/factory-run 10', 'implementer', 'opus', 'high')).toBe(`claude --model ${ORCHESTRATOR_MODEL} "${server}"`);
  });
});
