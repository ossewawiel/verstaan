# verstaan_data_fixture: a hand-written stand-in for tools/compiler output (SPEC.md §3.5),
# under engine/generated/fixture/. The one part of engine/generated/ that is not compiler output
# and is edited by hand (engine/CLAUDE.md).
add_library(verstaan_data_fixture STATIC
  fixture/tables.cpp
)

target_include_directories(verstaan_data_fixture PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}
)

target_compile_features(verstaan_data_fixture PUBLIC cxx_std_20)
verstaan_set_warnings(verstaan_data_fixture)
