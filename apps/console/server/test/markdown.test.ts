// SPDX-License-Identifier: MPL-2.0
import { describe, it, expect } from 'vitest';
import { render, titleOf, splitFrontmatter } from '../src/model/markdown.js';

describe('render', () => {
  it('renders headings with stable, unique ids', () => {
    const { html, headings } = render('# Title\n\n## Section\n\n## Section\n');
    expect(headings.map((h) => h.id)).toEqual(['title', 'section', 'section-2']);
    expect(html).toContain('<h1 id="title">');
  });

  it('renders a task list item with a glyph', () => {
    const { html } = render('- [x] done\n- [ ] open\n');
    expect(html).toContain('task--done');
    expect(html).toContain('task--open');
  });

  it('renders a table', () => {
    const { html } = render('| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });
});

describe('titleOf', () => {
  it('takes the first H1', () => {
    expect(titleOf('---\nissue: 1\n---\n# The Title\nbody', 'fallback')).toBe('The Title');
  });

  it('falls back when there is no H1', () => {
    expect(titleOf('just text', 'fallback.md')).toBe('fallback.md');
  });
});

describe('splitFrontmatter', () => {
  it('splits the frontmatter block from the body', () => {
    const { front, body } = splitFrontmatter('---\na: 1\n---\nbody text');
    expect(front).toBe('a: 1');
    expect(body).toBe('body text');
  });
});
