// Engine unit tests (docs/standards/testing.md: "fast"). M0: every Engine method is a stub that
// returns Status::not_implemented; these tests pin that stub behaviour so a real body must make
// them fail before it can make them pass.

#include "verstaan/engine.hpp"

#include <gtest/gtest.h>

namespace verstaan {
namespace {

TEST(EngineTest, GeneratedReturnsNotImplemented) {
  const Engine engine = Engine::generated(Tier::basic);
  const Result result = engine.translate("hello", Options{.from = Lang::eng, .to = Lang::afr});
  EXPECT_EQ(result.status, Status::not_implemented);
  EXPECT_TRUE(result.text.empty());
  EXPECT_TRUE(result.unl.nodes.empty());
  EXPECT_TRUE(result.trace.entries.empty());
}

TEST(EngineTest, OptionsDefaultRegisterAndContext) {
  const Options options{.from = Lang::eng, .to = Lang::afr};
  EXPECT_EQ(options.reg, Register::neutral);
  EXPECT_EQ(options.ctx, Context::none);
}

}  // namespace
}  // namespace verstaan
