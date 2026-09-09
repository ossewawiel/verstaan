# verstaan_core: the engine library (SPEC.md §3.4). No port dependency (docs/standards/cpp.md).
add_library(verstaan_core STATIC
  src/engine.cpp
)

target_include_directories(verstaan_core PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_features(verstaan_core PUBLIC cxx_std_20)
verstaan_set_warnings(verstaan_core)

add_subdirectory(generated)
