find_package(GTest CONFIG REQUIRED)
include(GoogleTest)

# Engine unit tests. Label `fast` (docs/standards/testing.md).
add_executable(verstaan_tests
  unit/capital_names_test.cpp
  unit/cli_trace_line_test.cpp
  unit/dictionary_lookup_test.cpp
  unit/engine_status_test.cpp
  unit/engine_test.cpp
  unit/golden_loader_test.cpp
  unit/generation_test.cpp
  unit/lang_test.cpp
  unit/language_pair_test.cpp
  unit/read_graph_test.cpp
  unit/rule_interpreter_test.cpp
  unit/tokeniser_test.cpp
  unit/tree_pass_test.cpp
)
target_link_libraries(verstaan_tests PRIVATE verstaan_core verstaan_cli_trace GTest::gtest GTest::gtest_main)
target_compile_features(verstaan_tests PRIVATE cxx_std_20)
verstaan_set_warnings(verstaan_tests)

# dictionary_lookup_test.cpp reads the real data/languages/eng and data/languages/afr stores
# (issue 20's acceptance criteria: only the real, sharded store can prove a wrong shard or a wrong
# iso3 translation), so it needs the checkout root at compile time.
target_compile_definitions(verstaan_tests PRIVATE
  VERSTAAN_REPO_ROOT="${CMAKE_SOURCE_DIR}"
)
# language_pair_test.cpp runs the CLI binary (issue 28, rows L54 to L59).
add_dependencies(verstaan_tests verstaan_cli)
target_compile_definitions(verstaan_tests PRIVATE VERSTAAN_CLI_PATH="$<TARGET_FILE:verstaan_cli>")
# golden_loader_test.cpp includes golden/row_loader.hpp (issue 202).
target_include_directories(verstaan_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/golden ${CMAKE_SOURCE_DIR}/engine/src)

gtest_discover_tests(verstaan_tests
  PROPERTIES LABELS fast
)

# Golden loader (issue 26): one CTest case per row of every fixture YAML and golden text file.
# The checkout root is needed at compile time for the fixture files and the real eng/afr stores.
add_executable(golden_tests golden/loader_test.cpp)
target_link_libraries(golden_tests PRIVATE verstaan_core GTest::gtest GTest::gtest_main)
target_compile_features(golden_tests PRIVATE cxx_std_20)
target_compile_definitions(golden_tests PRIVATE VERSTAAN_REPO_ROOT="${CMAKE_SOURCE_DIR}")
verstaan_set_warnings(golden_tests)
gtest_discover_tests(golden_tests PROPERTIES LABELS golden)

# Held-out rows: same shape, own label. Run at the gate and in CI only.
add_executable(held_out_tests held-out/held_out_test.cpp)
target_link_libraries(held_out_tests PRIVATE verstaan_core GTest::gtest GTest::gtest_main)
target_compile_features(held_out_tests PRIVATE cxx_std_20)
target_compile_definitions(held_out_tests PRIVATE VERSTAAN_REPO_ROOT="${CMAKE_SOURCE_DIR}")
verstaan_set_warnings(held_out_tests)
gtest_discover_tests(held_out_tests PROPERTIES LABELS held-out)

# Placeholders for the `equivalence` and `tier` CTest labels (docs/standards/testing.md).
function(verstaan_add_placeholder_test name label)
  add_executable(${name} ${label}/placeholder_test.cpp)
  target_compile_features(${name} PRIVATE cxx_std_20)
  verstaan_set_warnings(${name})
  add_test(NAME ${name} COMMAND ${name})
  set_tests_properties(${name} PROPERTIES LABELS ${label})
endfunction()

verstaan_add_placeholder_test(equivalence_placeholder_test equivalence)
verstaan_add_placeholder_test(tier_placeholder_test tier)
