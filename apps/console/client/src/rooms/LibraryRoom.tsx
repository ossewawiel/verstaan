// SPDX-License-Identifier: MPL-2.0
import { Link, useParams } from 'react-router-dom';
import { useLibraryQuery } from '../api/queries';
import { DocPage } from './DocPage';

export function LibraryRoom() {
  const { '*': docPath } = useParams();
  const { data: groups, isLoading } = useLibraryQuery();

  if (docPath) {
    return <DocPage path={docPath} band="Library" />;
  }

  if (isLoading || !groups) return <p className="muted">Loading the library…</p>;

  return (
    <section>
      <p className="altitude__band">Library</p>
      <h1 className="headline">Every project document</h1>
      <p className="lede">Grouped as the project groups them. Pick a document for its rendered page.</p>
      {groups.map((g) => (
        <div className="panel" key={g.group}>
          <p className="panel__title">{g.group}</p>
          <p className="panel__ctx">{g.blurb}</p>
          <ul className="storylist">
            {g.docs.map((path) => (
              <li key={path}>
                <Link to={`/library/${path}`}>{path}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
