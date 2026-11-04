// SPDX-License-Identifier: MPL-2.0
// verstaan_cli: SPEC.md §3.6.
//   verstaan --from eng --to afr [--register formal] [--context medical] [--trace] [--tier basic]
//   "text"
// Exit 0 on Status::ok, 2 on Status::partial, 3 on Status::no_parse, 1 otherwise (a bad argument,
// or Status::not_implemented). A --from or --to value must be an iso3 code that has a store with a
// meta.yaml under data/languages/ (ADR 0029). --tier is parsed and not yet wired: the
// generated-tables back end (Engine::generated) is M4 (ADR 0007), so this issue always runs the
// runtime-tables back end, Engine::load(RuleSet::load(...)), against the checkout's own
// `data/languages/<iso3>` stores.

#include <cstddef>
#include <cstdio>
#include <filesystem>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "trace_line.hpp"
#include "verstaan/engine.hpp"
#include "verstaan/lang.hpp"
#include "verstaan/rule_set.hpp"

#ifndef VERSTAAN_REPO_ROOT
#error "VERSTAAN_REPO_ROOT must be defined by apps/cli/CMakeLists.txt"
#endif

namespace {

using verstaan::Context;
using verstaan::Engine;
using verstaan::Lang;
using verstaan::Options;
using verstaan::Register;
using verstaan::Result;
using verstaan::RuleSet;
using verstaan::Status;

constexpr const char* kVersion = "verstaan 0.0.0-m3";

// The store for `lang` under the checkout's `data/languages/`, or no value when that folder holds
// no `meta.yaml`. The invented fixture pair sits under `tests/fixtures/` and never ships, so no
// flag reaches it (ADR 0029).
std::optional<std::string> store_root(Lang lang) {
  std::string path(VERSTAAN_REPO_ROOT);
  path += "/data/languages/";
  path += verstaan::iso3_of(lang);
  if (!std::filesystem::is_regular_file(path + "/meta.yaml")) {
    return std::nullopt;
  }
  return path;
}

// A flag value is a language when it is an ISO 639-3 code and a store holds it.
std::optional<Lang> parse_lang(std::string_view value) {
  const std::optional<Lang> lang = verstaan::lang_from_iso3(value);
  if (!lang.has_value() || !store_root(*lang).has_value()) {
    return std::nullopt;
  }
  return lang;
}

std::optional<Register> parse_register(std::string_view value) {
  if (value == "neutral") return Register::neutral;
  if (value == "formal") return Register::formal;
  if (value == "informal") return Register::informal;
  if (value == "technical") return Register::technical;
  return std::nullopt;
}

std::optional<Context> parse_context(std::string_view value) {
  if (value == "none") return Context::none;
  if (value == "medical") return Context::medical;
  if (value == "rescue") return Context::rescue;
  return std::nullopt;
}

int exit_code(Status status) {
  switch (status) {
    case Status::ok:
      return 0;
    case Status::partial:
      return 2;
    case Status::no_parse:
      return 3;
    case Status::not_implemented:
      return 1;
  }
  return 1;
}

}  // namespace

int main(int argc, char** argv) {
  const std::vector<std::string_view> args(argv + 1, argv + argc);
  if (args.empty()) {
    std::puts(kVersion);
    return 0;
  }

  Options options{.from = Lang::eng, .to = Lang::afr};
  bool trace_requested = false;
  std::string text;

  for (std::size_t i = 0; i < args.size(); ++i) {
    const std::string_view arg = args[i];
    const auto next = [&]() -> std::string_view {
      return (i + 1 < args.size()) ? args[++i] : std::string_view{};
    };

    if (arg == "--from") {
      const std::optional<Lang> lang = parse_lang(next());
      if (!lang.has_value()) {
        std::fputs("verstaan: bad --from\n", stderr);
        return 1;
      }
      options.from = *lang;
    } else if (arg == "--to") {
      const std::optional<Lang> lang = parse_lang(next());
      if (!lang.has_value()) {
        std::fputs("verstaan: bad --to\n", stderr);
        return 1;
      }
      options.to = *lang;
    } else if (arg == "--register") {
      const std::optional<Register> reg = parse_register(next());
      if (!reg.has_value()) {
        std::fputs("verstaan: bad --register\n", stderr);
        return 1;
      }
      options.reg = *reg;
    } else if (arg == "--context") {
      const std::optional<Context> ctx = parse_context(next());
      if (!ctx.has_value()) {
        std::fputs("verstaan: bad --context\n", stderr);
        return 1;
      }
      options.ctx = *ctx;
    } else if (arg == "--trace") {
      trace_requested = true;
    } else if (arg == "--tier") {
      next();  // Parsed, not yet wired to Engine::generated (M4, ADR 0007).
    } else {
      if (!text.empty()) {
        text += ' ';
      }
      text += arg;
    }
  }

  // Owner ruling 2026-11-04: the CLI allows eng to afr only. The engine names no language, so
  // this is the one line to widen when a store joins at M6.
  if (options.from != Lang::eng || options.to != Lang::afr) {
    std::fprintf(stderr, "verstaan: only eng to afr is supported, not %s to %s\n",
                 verstaan::iso3_of(options.from).c_str(), verstaan::iso3_of(options.to).c_str());
    return 1;
  }

  // The flags passed parse_lang, but the defaults did not, so a missing store is still possible.
  const std::optional<std::string> from_root = store_root(options.from);
  const std::optional<std::string> to_root = store_root(options.to);
  if (!from_root.has_value() || !to_root.has_value()) {
    std::fprintf(stderr, "verstaan: no store for %s\n",
                 verstaan::iso3_of(from_root.has_value() ? options.to : options.from).c_str());
    return 1;
  }
  const RuleSet rules = RuleSet::load(*from_root, *to_root);
  if (!rules.from_lang().has_value() || !rules.to_lang().has_value()) {
    std::fprintf(stderr, "verstaan: store %s holds no readable iso3 in meta.yaml\n",
                 (rules.from_lang().has_value() ? *to_root : *from_root).c_str());
    return 1;
  }
  const Engine engine = Engine::load(rules);
  const Result result = engine.translate(text, options);

  if (trace_requested) {
    for (const auto& entry : result.trace.entries) {
      std::puts(verstaan::cli::trace_line(entry).c_str());
    }
  }
  std::puts(result.text.c_str());

  return exit_code(result.status);
}
