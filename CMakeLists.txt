cmake_minimum_required(VERSION 3.28)
project(verstaan CXX)

# Not in scope for issue 01: full tier/target matrix, vcpkg ports, generated data libraries.
# Just enough to prove the gate ladder against a real build.
enable_testing()

add_subdirectory(engine)
add_subdirectory(tests)
