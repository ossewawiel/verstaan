// verstaan_cli: SPEC.md §3.6. M0 stub — prints the version and exits. The full argument contract
// (--from, --to, --register, --context, --trace, --tier, exit codes on Status) is not in scope
// for this issue.

#include <cstdio>

namespace {
constexpr const char* kVersion = "verstaan 0.0.0-m0";
}  // namespace

int main() {
  std::puts(kVersion);
  return 0;
}
