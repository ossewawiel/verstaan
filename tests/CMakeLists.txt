find_package(GTest CONFIG REQUIRED)
include(GoogleTest)

# Engine unit tests. Label `fast` (docs/standards/testing.md).
add_executable(verstaan_tests
  unit/engine_test.cpp
)
target_link_libraries(verstaan_tests PRIVATE verstaan_core GTest::gtest GTest::gtest_main)
target_compile_features(verstaan_tests PRIVATE cxx_std_20)
verstaan_set_warnings(verstaan_tests)

gtest_discover_tests(verstaan_tests
  PROPERTIES LABELS fast
)

# Placeholders for the `golden`, `equivalence` and `tier` CTest labels (docs/standards/testing.md).
# Real content lands with the compiler, the corpus and the tier budgets; these keep the labels
# usable now. Not in scope for issue 02: any translation behaviour.
function(verstaan_add_placeholder_test name label)
  add_executable(${name} ${label}/placeholder_test.cpp)
  target_compile_features(${name} PRIVATE cxx_std_20)
  verstaan_set_warnings(${name})
  add_test(NAME ${name} COMMAND ${name})
  set_tests_properties(${name} PROPERTIES LABELS ${label})
endfunction()

verstaan_add_placeholder_test(golden_placeholder_test golden)
verstaan_add_placeholder_test(equivalence_placeholder_test equivalence)
verstaan_add_placeholder_test(tier_placeholder_test tier)
