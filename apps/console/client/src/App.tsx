// SPDX-License-Identifier: MPL-2.0
import { Route, Routes } from 'react-router-dom';
import { NavBar } from './NavBar';
import { useChangeStream } from './api/useChangeStream';
import { ConsoleRoom } from './rooms/ConsoleRoom';
import { QuestsRoom } from './rooms/QuestsRoom';
import { PlaybookRoom } from './rooms/PlaybookRoom';
import { LibraryRoom } from './rooms/LibraryRoom';
import { GlossaryRoom } from './rooms/GlossaryRoom';

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
        </Routes>
      </main>
    </>
  );
}
