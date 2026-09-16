// SPDX-License-Identifier: MPL-2.0
import { Route, Routes } from 'react-router-dom';
import { NavBar } from './NavBar';
import { useChangeStream } from './api/useChangeStream';
import { ConsoleRoom } from './rooms/ConsoleRoom';
import { QuestsRoom } from './rooms/QuestsRoom';
import { PlaybookRoom } from './rooms/PlaybookRoom';
import { LibraryRoom } from './rooms/LibraryRoom';
import { GlossaryRoom } from './rooms/GlossaryRoom';
import { JobsRoom } from './rooms/JobsRoom';
import { ArtifactPage } from './rooms/ArtifactPage';
import { ShipSystemsRoom } from './rooms/ShipSystemsRoom';
import { CodexRoom } from './rooms/CodexRoom';
import { DebriefRoom } from './rooms/DebriefRoom';
import { AtlasRoom } from './rooms/AtlasRoom';

export function App() {
  useChangeStream();

  return (
    <>
      <NavBar />
      <main id="main" className="room">
        <Routes>
          <Route path="/" element={<ConsoleRoom />} />
          <Route path="/quests" element={<QuestsRoom />} />
          <Route path="/quests/:nn" element={<QuestsRoom />} />
          <Route path="/playbook" element={<PlaybookRoom />} />
          <Route path="/library" element={<LibraryRoom />} />
          <Route path="/library/*" element={<LibraryRoom />} />
          <Route path="/glossary" element={<GlossaryRoom />} />
          <Route path="/jobs" element={<JobsRoom />} />
          <Route path="/jobs/:id" element={<JobsRoom />} />
          <Route path="/ship-systems" element={<ShipSystemsRoom />} />
          <Route path="/atlas" element={<AtlasRoom />} />
          <Route path="/codex/:nn" element={<CodexRoom />} />
          <Route path="/debrief" element={<DebriefRoom />} />
          <Route path="/artifacts/*" element={<ArtifactPage />} />
        </Routes>
      </main>
    </>
  );
}
