# verstaan_cli: SPEC.md §3.6. M0 stub prints the version and exits; the argument contract
# (--from, --to, --register, --context, --trace, --tier, exit codes on Status) arrives with the
# real engine.
add_executable(verstaan_cli
  src/main.cpp
)

target_link_libraries(verstaan_cli PRIVATE verstaan_core)
target_compile_features(verstaan_cli PRIVATE cxx_std_20)
verstaan_set_warnings(verstaan_cli)
