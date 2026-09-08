# Shared warnings-as-errors flags (docs/standards/cpp.md). One place so every target gets the
# same treatment: -Wall -Wextra -Werror -Wpedantic, or /W4 /WX /permissive- on MSVC and ClangCL.
function(verstaan_set_warnings target)
  if (MSVC)
    target_compile_options(${target} PRIVATE /W4 /WX /permissive-)
  else()
    target_compile_options(${target} PRIVATE -Wall -Wextra -Werror -Wpedantic)
  endif()
endfunction()
