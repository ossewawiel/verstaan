# Fast-labelled CTest coverage for issue 01. Real unit tests arrive with the real engine.
add_executable(core_smoke_test unit/core_smoke_test.cpp)
target_link_libraries(core_smoke_test PRIVATE verstaan_core)

add_test(NAME core_smoke_fast COMMAND core_smoke_test)
set_tests_properties(core_smoke_fast PROPERTIES LABELS fast)
