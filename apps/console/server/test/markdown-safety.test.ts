// SPDX-License-Identifier: MPL-2.0
// Ported from tools/console/test/run.mjs. The client's first consumer of this renderer's output
// (DocPage.tsx) pushes `html` straight into `dangerouslySetInnerHTML`, so these guarantees are
// no longer just nice-to-have: an unescaped `<script>` or an unblocked `javascript:` href here is
// a real XSS hole in the browser, not just a wrong rendering.
import { describe, it, expect } from 'vitest';
import { render } from '../src/model/markdown.js';

describe('render: HTML escaping', () => {
  it('escapes angle brackets and ampersands in a paragraph', () => {
    const { html } = render('a <b>bold</b> & c');
    expect(html).toBe('<p>a &lt;b&gt;bold&lt;/b&gt; &amp; c</p>');
  });

  it('escapes a raw <script> tag rather than emitting it', () => {
    const { html } = render('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('render: fenced code escaping', () => {
  it('keeps angle brackets in fenced code escaped', () => {
    const { html } = render('```cpp\nint a<b>;\n```');
    expect(html).toBe('<pre data-lang="cpp"><code>int a&lt;b&gt;;</code></pre>');
  });
});

describe('render: link scheme blocking', () => {
  it('blocks a javascript: link', () => {
    const { html } = render('[x](javascript:alert)');
    expect(html).toBe('<p><a href="#">x</a></p>');
  });

  it('blocks a data: link', () => {
    const { html } = render('[x](data:text/html,evil)');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('href="data:');
  });

  it('blocks a vbscript: link', () => {
    const { html } = render('[x](vbscript:msgbox)');
    expect(html).toContain('href="#"');
  });

  it('blocks mixed-case scheme variants', () => {
    expect(render('[x](JavaScript:alert)').html).toContain('href="#"');
    expect(render('[x](Data:text/html,x)').html).toContain('href="#"');
    expect(render('[x](VBScript:msgbox)').html).toContain('href="#"');
  });

  it('keeps an https: link', () => {
    const { html } = render('[x](https://a.b/c)');
    expect(html).toBe('<p><a href="https://a.b/c">x</a></p>');
  });
});
