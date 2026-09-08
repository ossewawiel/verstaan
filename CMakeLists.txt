cmake_minimum_required(VERSION 3.28)
project(verstaan CXX)

# CMake 3.28's Ninja generator auto-enables experimental C++20 modules dependency scanning for
# GCC under cxx_std_20, even though nothing here uses C++ modules. That scanning is broken on at
# least one real toolchain (MinGW g++ 16.1.0: "failed reading mapper '...obj.modmap'" on every
# translation unit) and buys this project nothing, so it is off everywhere, not just for gcc.
set(CMAKE_CXX_SCAN_FOR_MODULES OFF)

list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_SOURCE_DIR}/cmake)
include(warnings)

enable_testing()

add_subdirectory(engine)
add_subdirectory(apps)
add_subdirectory(tests)
