// SPDX-License-Identifier: MPL-2.0
#include "verstaan/lang.hpp"

#include <optional>
#include <string>
#include <string_view>

namespace verstaan {

std::optional<Lang> lang_from_iso3(std::string_view /*code*/) { return std::nullopt; }

std::string iso3_of(Lang /*lang*/) { return {}; }

}  // namespace verstaan
