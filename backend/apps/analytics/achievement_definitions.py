# This file defines the achievement system for the games
from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class AchievementDef:
    """Plain data container for an achievement definition."""
    key: str
    name: str
    description: str
    category: str           # must match AchievementCategory values
    tier: str               # must match AchievementTier values
    icon: str
    xp_reward: int
    threshold: int = 1
    is_hidden: bool = False
    ordering_priority: int = 0


ACHIEVEMENTS: list[AchievementDef] = [
    AchievementDef(
        key="first_win",
        name="First Blood",
        description="Win your first game.",
        category="wins",
        tier="bronze",
        icon="sword",
        xp_reward=50,
        threshold=1,
        ordering_priority=0,
    ),
    AchievementDef(
        key="wins_10",
        name="Getting Warmed Up",
        description="Win 10 games.",
        category="wins",
        tier="bronze",
        icon="fire",
        xp_reward=100,
        threshold=10,
        ordering_priority=1,
    ),
    AchievementDef(
        key="wins_50",
        name="Veteran Fighter",
        description="Win 50 games.",
        category="wins",
        tier="silver",
        icon="shield",
        xp_reward=300,
        threshold=50,
        ordering_priority=2,
    ),
    AchievementDef(
        key="wins_100",
        name="Centurion",
        description="Win 100 games.",
        category="wins",
        tier="gold",
        icon="crown",
        xp_reward=500,
        threshold=100,
        ordering_priority=3,
    ),
    AchievementDef(
        key="pong_wins_10",
        name="Pong Master",
        description="Win 10 Pong games.",
        category="wins",
        tier="silver",
        icon="ping-pong",
        xp_reward=150,
        threshold=10,
        ordering_priority=10,
    ),
    AchievementDef(
        key="ttt_wins_10",
        name="Tic-Tac-Toe Strategist",
        description="Win 10 Tic-Tac-Toe games.",
        category="wins",
        tier="silver",
        icon="grid",
        xp_reward=150,
        threshold=10,
        ordering_priority=11,
    ),

    AchievementDef(
        key="games_1",
        name="Welcome Aboard",
        description="Play your first game.",
        category="games",
        tier="bronze",
        icon="gamepad",
        xp_reward=25,
        threshold=1,
        ordering_priority=0,
    ),
    AchievementDef(
        key="games_50",
        name="Regular Player",
        description="Play 50 games.",
        category="games",
        tier="silver",
        icon="joystick",
        xp_reward=200,
        threshold=50,
        ordering_priority=1,
    ),
    AchievementDef(
        key="games_200",
        name="Dedicated Gamer",
        description="Play 200 games.",
        category="games",
        tier="gold",
        icon="star",
        xp_reward=500,
        threshold=200,
        ordering_priority=2,
    ),

    AchievementDef(
        key="win_streak_3",
        name="Hat Trick",
        description="Win 3 games in a row.",
        category="streaks",
        tier="bronze",
        icon="lightning",
        xp_reward=75,
        threshold=3,
        ordering_priority=0,
    ),
    AchievementDef(
        key="win_streak_5",
        name="On Fire",
        description="Win 5 games in a row.",
        category="streaks",
        tier="silver",
        icon="flame",
        xp_reward=150,
        threshold=5,
        ordering_priority=1,
    ),
    AchievementDef(
        key="win_streak_10",
        name="Unstoppable",
        description="Win 10 games in a row.",
        category="streaks",
        tier="gold",
        icon="rocket",
        xp_reward=400,
        threshold=10,
        ordering_priority=2,
    ),

    AchievementDef(
        key="pong_perfect",
        name="Perfect Game",
        description="Win a Pong game 11-0 (shutout).",
        category="skill",
        tier="gold",
        icon="bullseye",
        xp_reward=300,
        threshold=1,
        ordering_priority=0,
    ),
    AchievementDef(
        key="ttt_quick_win",
        name="Quick Draw",
        description="Win a Tic-Tac-Toe game in the minimum number of moves (5).",
        category="skill",
        tier="silver",
        icon="zap",
        xp_reward=200,
        threshold=1,
        ordering_priority=1,
    ),
    AchievementDef(
        key="ai_hard_win",
        name="AI Slayer",
        description="Beat a hard-difficulty AI opponent.",
        category="skill",
        tier="gold",
        icon="robot",
        xp_reward=250,
        threshold=1,
        ordering_priority=2,
    ),

    AchievementDef(
        key="unique_opponents_5",
        name="Social Butterfly",
        description="Play against 5 different opponents.",
        category="social",
        tier="bronze",
        icon="users",
        xp_reward=100,
        threshold=5,
        ordering_priority=0,
    ),
    AchievementDef(
        key="unique_opponents_20",
        name="Popular Player",
        description="Play against 20 different opponents.",
        category="social",
        tier="silver",
        icon="globe",
        xp_reward=250,
        threshold=20,
        ordering_priority=1,
    ),


    AchievementDef(
        key="level_5",
        name="Rising Star",
        description="Reach level 5.",
        category="milestone",
        tier="bronze",
        icon="arrow-up",
        xp_reward=0,   # no XP to avoid feedback loop
        threshold=5,
        ordering_priority=0,
    ),
    AchievementDef(
        key="level_10",
        name="Seasoned Competitor",
        description="Reach level 10.",
        category="milestone",
        tier="silver",
        icon="badge",
        xp_reward=0,
        threshold=10,
        ordering_priority=1,
    ),
    AchievementDef(
        key="level_25",
        name="Elite Player",
        description="Reach level 25.",
        category="milestone",
        tier="gold",
        icon="diamond",
        xp_reward=0,
        threshold=25,
        ordering_priority=2,
    ),
]

ACHIEVEMENT_MAP: dict[str, AchievementDef] = {a.key: a for a in ACHIEVEMENTS}
