// SPDX-License-Identifier: MPL-2.0
#pragma once

// Public API. SPEC.md §3.4. Changing this file needs an ADR (engine/CLAUDE.md).
//
// Issue 28, ADR 0029. `Lang` lives here, not in engine.hpp, because engine.hpp includes
// rule_set.hpp and `RuleSet` names `Lang`.

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace verstaan {

// Source/target language, by ISO 639-3 code. An open enum: the value packs the three ASCII bytes
// of the code, so any code is a valid `Lang` with no member and no edit here (ADR 0029). The
// members name the three languages the repository ships or seeds; no branch in engine/src reads
// them. SPEC.md §1: eng and afr at M3, nld seeded at M6.
enum class Lang : std::uint32_t { eng = 0x656E67, afr = 0x616672, nld = 0x6E6C64 };

// The `Lang` for an ISO 639-3 code, or no value when `code` is not three lower-case ASCII letters.
// It reads no store: a well-formed code with no store still maps (ADR 0029).
[[nodiscard]] std::optional<Lang> lang_from_iso3(std::string_view code);

// The ISO 639-3 code of `lang`, or an empty string for a value that holds no code (ADR 0029).
[[nodiscard]] std::string iso3_of(Lang lang);

}  // namespace verstaan
