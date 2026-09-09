#pragma once

// Licence: CC BY-SA 4.0 (data). See data/LICENSE.
//
// FIXTURE — hand-written stand-in for compiler output (SPEC.md §3.5, engine/CLAUDE.md). Not
// generated. Mirrors the shape of engine/generated/<tier>/tables.hpp so the build has a real
// verstaan_data_fixture library to link before tools/compiler exists. Replace with real compiler
// output once tools/compiler produces engine/generated/<tier>/. Real output carries the full
// header (source hash, tier, date, "GENERATED — do not edit") instead of this note.

namespace verstaan::fixture {

// A tier name lets tests confirm they linked this stand-in and not real compiled data.
extern const char* const kTierName;

}  // namespace verstaan::fixture
