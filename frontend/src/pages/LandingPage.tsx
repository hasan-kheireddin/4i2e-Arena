import { Link } from "react-router-dom";
import { Gamepad2, ArrowRight, Users, Trophy, Zap } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Decorative Elements */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

        <div className="relative container mx-auto px-6 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-8 animate-fadeIn">
              <div className="inline-block">
                <span
                  className="px-4 py-2 rounded-full text-sm font-semibold"
                  style={{
                    backgroundColor: "rgba(168, 85, 247, 0.1)",
                    color: "var(--color-primary)",
                    border: "1px solid var(--color-primary)",
                  }}
                >
                  ✨ Welcome to the Arena
                </span>
              </div>

              <h1
                className="text-5xl lg:text-7xl font-extrabold leading-tight"
                style={{
                  background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                GAME
                <br />
                STRATEGIES
              </h1>

              <p
                className="text-lg lg:text-xl max-w-lg"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Master your skills, compete with friends, and dominate the leaderboard.
                Join the ultimate gaming experience today.
              </p>

              <div className="flex gap-4">
                <Link
                  to="/register"
                  className="group px-8 py-4 rounded-lg font-semibold text-white transition-all duration-300 flex items-center gap-2"
                  style={{ backgroundColor: "var(--color-primary)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.transform = "translateY(-2px)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.transform = "translateY(0)")
                  }
                >
                  LEARN MORE
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>

                <Link
                  to="/login"
                  className="px-8 py-4 rounded-lg font-semibold transition-all duration-300"
                  style={{
                    color: "var(--color-text-primary)",
                    border: "2px solid var(--color-border)",
                    backgroundColor: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-primary)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  Sign In
                </Link>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 pt-8">
                <div>
                  <div
                    className="text-3xl font-bold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    10K+
                  </div>
                  <div
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Active Players
                  </div>
                </div>
                <div>
                  <div
                    className="text-3xl font-bold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    50+
                  </div>
                  <div
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Game Modes
                  </div>
                </div>
                <div>
                  <div
                    className="text-3xl font-bold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    24/7
                  </div>
                  <div
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Support
                  </div>
                </div>
              </div>
            </div>

            {/* Right Image */}
            <div className="relative animate-fadeIn animation-delay-200">
              <div
                className="relative rounded-3xl overflow-hidden"
                style={{
                  border: "2px solid var(--color-primary)",
                  boxShadow: "0 0 40px rgba(168, 85, 247, 0.3)",
                }}
              >
                <img
                  src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80"
                  alt="Gaming"
                  className="w-full h-auto"
                />
                {/* Overlay gradient */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)",
                  }}
                />
              </div>

              {/* Decorative dots */}
              <div className="absolute -top-4 -right-4 grid grid-cols-4 gap-2">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: "var(--color-primary)" }}
                  />
                ))}
              </div>

              {/* Decorative shapes */}
              <div
                className="absolute -bottom-8 -left-8 w-32 h-32 rounded-lg opacity-50"
                style={{
                  background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                  transform: "rotate(45deg)",
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2
              className="text-4xl font-bold mb-4"
              style={{ color: "var(--color-text-primary)" }}
            >
              Why Choose Arena?
            </h2>
            <p
              className="text-lg max-w-2xl mx-auto"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Experience the next generation of competitive gaming
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div
              className="p-8 rounded-2xl transition-all duration-300 hover:-translate-y-2"
              style={{
                backgroundColor: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center mb-6"
                style={{
                  background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                }}
              >
                <Gamepad2 className="w-8 h-8 text-white" />
              </div>
              <h3
                className="text-2xl font-bold mb-4"
                style={{ color: "var(--color-text-primary)" }}
              >
                Multiple Games
              </h3>
              <p style={{ color: "var(--color-text-secondary)" }}>
                Play Pong, Tic-Tac-Toe, and more. New games added regularly.
              </p>
            </div>

            {/* Feature 2 */}
            <div
              className="p-8 rounded-2xl transition-all duration-300 hover:-translate-y-2"
              style={{
                backgroundColor: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center mb-6"
                style={{
                  background: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
                }}
              >
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3
                className="text-2xl font-bold mb-4"
                style={{ color: "var(--color-text-primary)" }}
              >
                Multiplayer
              </h3>
              <p style={{ color: "var(--color-text-secondary)" }}>
                Challenge friends or match with players worldwide in real-time.
              </p>
            </div>

            {/* Feature 3 */}
            <div
              className="p-8 rounded-2xl transition-all duration-300 hover:-translate-y-2"
              style={{
                backgroundColor: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center mb-6"
                style={{
                  background: "linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)",
                }}
              >
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <h3
                className="text-2xl font-bold mb-4"
                style={{ color: "var(--color-text-primary)" }}
              >
                Leaderboards
              </h3>
              <p style={{ color: "var(--color-text-secondary)" }}>
                Compete for the top spot and earn achievements along the way.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div
            className="relative rounded-3xl p-12 lg:p-20 overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
            }}
          >
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />

            <div className="relative text-center">
              <Zap className="w-16 h-16 text-white mx-auto mb-6" />
              <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
                Ready to Start Playing?
              </h2>
              <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
                Join thousands of players in the arena. Sign up now and get
                your first game free!
              </p>
              <Link
                to="/register"
                className="inline-block px-10 py-5 bg-white text-purple-600 rounded-lg font-bold text-lg transition-all duration-300 hover:scale-105"
              >
                Get Started Now
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}