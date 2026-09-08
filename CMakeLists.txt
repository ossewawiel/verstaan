cmake_minimum_required(VERSION 3.28)
project(verstaan CXX)

list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_SOURCE_DIR}/cmake)
include(warnings)

enable_testing()

add_subdirectory(engine)
add_subdirectory(apps)
add_subdirectory(tests)
