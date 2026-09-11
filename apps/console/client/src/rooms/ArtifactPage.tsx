// SPDX-License-Identifier: MPL-2.0
// Renders an artifact the `artifact` opener points at (issue 100), read-only: an HTML artifact
// (the interrogation brief) is shown in a sandboxed iframe so its own markup never runs in this
// page's DOM; anything else is shown as plain text.
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

export function ArtifactPage() {
  const params = useParams<{ '*': string }>();
  const path = params['*'] ?? '';
  const { data, isLoading, error } = useQuery({
    queryKey: ['artifact', path],
    queryFn: async () => {
      const res = await fetch(`/api/artifacts/${path}`);
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      return { contentType: res.headers.get('content-type') ?? '', text: await res.text() };
    },
    enabled: !!path,
  });

  if (isLoading) return <p className="muted">Loading {path}…</p>;
  if (error || !data) return <p className="muted">Could not load {path}.</p>;

  return (
    <section>
      <p className="altitude__band">Artifact</p>
      <h1 className="headline">{path}</h1>
      {data.contentType.includes('text/html') ? (
        <iframe title={path} className="artifact-frame" sandbox="" srcDoc={data.text} />
      ) : (
        <pre className="artifact-text">{data.text}</pre>
      )}
    </section>
  );
}
