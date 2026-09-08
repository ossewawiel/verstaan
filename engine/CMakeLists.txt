# verstaan_core: the engine library target. Empty but for one function until later issues build
# the real engine (SPEC.md §3.4). Enough for the gate ladder in issue 01 to have something to
# compile and link against.
add_library(verstaan_core STATIC
  src/placeholder.cpp
)

target_include_directories(verstaan_core PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_features(verstaan_core PUBLIC cxx_std_20)

if (MSVC)
  target_compile_options(verstaan_core PRIVATE /W4 /WX /permissive-)
else()
  target_compile_options(verstaan_core PRIVATE -Wall -Wextra -Werror -Wpedantic)
endif()
