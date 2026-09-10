// SPDX-License-Identifier: MPL-2.0
// Renders one document the server already turned into HTML (apps/console/server's
// model/markdown.ts), with an "on this page" rail built from its headings.
import { useDocQuery } from '../api/queries';

interface Props {
  path: string;
  band: string;
  lede?: string;
}

export function DocPage({ path, band, lede }: Props) {
  const { data, isLoading, error } = useDocQuery(path);

  if (isLoading) return <p className="muted">Loading {path}…</p>;
  if (error || !data) return <p className="muted">Could not load {path}.</p>;

  return (
    <section>
      <p className="altitude__band">{band}</p>
      <h1 className="headline">{data.title}</h1>
      {lede && <p className="lede">{lede}</p>}
      <div className="doc-layout">
        <div className="prose" dangerouslySetInnerHTML={{ __html: data.html }} />
        {data.headings.length > 1 && (
          <nav className="doc-rail" aria-label="On this page">
            <p className="panel__title">On this page</p>
            <ul>
              {data.headings
                .filter((h) => h.level <= 2)
                .map((h) => (
                  <li key={h.id} style={{ paddingLeft: `${(h.level - 1) * 0.6}rem` }}>
                    <a href={`#${h.id}`}>{h.text}</a>
                  </li>
                ))}
            </ul>
          </nav>
        )}
      </div>
    </section>
  );
}
