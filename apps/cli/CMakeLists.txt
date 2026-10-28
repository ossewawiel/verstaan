# verstaan_cli: SPEC.md §3.6. --from/--to/--register/--context/--trace against the runtime-tables
# back end (Engine::load(RuleSet), issue 23). --tier is parsed and not yet wired: the
# generated-tables back end (Engine::generated) is M4 (ADR 0007).
# verstaan_cli_trace: the `--trace` line format (issue 180), a library so tests/ can link it.
add_library(verstaan_cli_trace STATIC
  src/trace_line.cpp
)
target_include_directories(verstaan_cli_trace PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(verstaan_cli_trace PUBLIC verstaan_core)
target_compile_features(verstaan_cli_trace PRIVATE cxx_std_20)
verstaan_set_warnings(verstaan_cli_trace)

add_executable(verstaan_cli
  src/main.cpp
)

target_link_libraries(verstaan_cli PRIVATE verstaan_core verstaan_cli_trace)
target_compile_features(verstaan_cli PRIVATE cxx_std_20)
verstaan_set_warnings(verstaan_cli)

# The CLI opens `data/languages/<iso3>` directly (RuleSet::load, Dictionary::load), so it needs
# the checkout root at compile time -- the same reason tests/CMakeLists.txt defines this for
# verstaan_tests.
target_compile_definitions(verstaan_cli PRIVATE
  VERSTAAN_REPO_ROOT="${CMAKE_SOURCE_DIR}"
)
