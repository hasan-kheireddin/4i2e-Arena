from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AchievementDef:
    key: str
    name: str
    description: str
    category: str
    tier: str
    icon: str
    xp_reward: int
    threshold: int = 1
    is_hidden: bool = False
    ordering_priority: int = 0


ACHIEVEMENTS: list[AchievementDef] = [
    # ---------------------------------------------------------------------
    # Pong achievements (online PvP only)
    # ---------------------------------------------------------------------
    AchievementDef(
        key="pong_first_rally",
        name="First Rally",
        description="Complete your first online Pong match.",
        category="games",
        tier="bronze",
        icon="table-tennis",
        xp_reward=50,
        threshold=1,
        ordering_priority=1,
    ),
    AchievementDef(
        key="pong_getting_warm",
        name="Getting Warm",
        description="Win your first online Pong match.",
        category="wins",
        tier="bronze",
        icon="flame",
        xp_reward=100,
        threshold=1,
        ordering_priority=2,
    ),
    AchievementDef(
        key="pong_rally_master",
        name="Rally Master",
        description="Reach a 20-hit rally in online Pong.",
        category="skill",
        tier="silver",
        icon="repeat",
        xp_reward=150,
        threshold=1,
        ordering_priority=3,
    ),
    AchievementDef(
        key="pong_speed_demon",
        name="Speed Demon",
        description="Score 3 points in under 10 seconds in online Pong.",
        category="skill",
        tier="silver",
        icon="zap",
        xp_reward=150,
        threshold=1,
        ordering_priority=4,
    ),
    AchievementDef(
        key="pong_unstoppable",
        name="Unstoppable",
        description="Win 3 online Pong matches in a row.",
        category="streaks",
        tier="silver",
        icon="rocket",
        xp_reward=200,
        threshold=1,
        ordering_priority=5,
    ),
    AchievementDef(
        key="pong_precision_player",
        name="Precision Player",
        description="Win an online Pong match without missing the ball.",
        category="skill",
        tier="silver",
        icon="crosshair",
        xp_reward=250,
        threshold=1,
        ordering_priority=6,
    ),
    AchievementDef(
        key="pong_comeback_king",
        name="Comeback King",
        description="Win an online Pong match after trailing by 3 points.",
        category="skill",
        tier="silver",
        icon="arrow-up",
        xp_reward=250,
        threshold=1,
        ordering_priority=7,
    ),
    AchievementDef(
        key="pong_defensive_wall",
        name="Defensive Wall",
        description="Block 10 consecutive shots in online Pong.",
        category="skill",
        tier="silver",
        icon="shield",
        xp_reward=200,
        threshold=1,
        ordering_priority=8,
    ),
    AchievementDef(
        key="pong_dominator",
        name="Dominator",
        description="Win an online Pong match with a perfect shutout.",
        category="skill",
        tier="gold",
        icon="crown",
        xp_reward=300,
        threshold=1,
        ordering_priority=9,
    ),
    AchievementDef(
        key="pong_veteran",
        name="Veteran",
        description="Play 25 online Pong matches.",
        category="games",
        tier="silver",
        icon="gamepad",
        xp_reward=200,
        threshold=25,
        ordering_priority=10,
    ),
    AchievementDef(
        key="pong_grinder",
        name="Grinder",
        description="Play 100 online Pong matches.",
        category="games",
        tier="gold",
        icon="target",
        xp_reward=400,
        threshold=100,
        ordering_priority=11,
    ),

    # ---------------------------------------------------------------------
    # Tic-Tac-Toe achievements (online PvP only)
    # ---------------------------------------------------------------------
    AchievementDef(
        key="ttt_first_move",
        name="First Move",
        description="Play your first online Tic-Tac-Toe match.",
        category="games",
        tier="bronze",
        icon="grid",
        xp_reward=50,
        threshold=1,
        ordering_priority=21,
    ),
    AchievementDef(
        key="ttt_first_victory",
        name="First Victory",
        description="Win your first online Tic-Tac-Toe match.",
        category="wins",
        tier="bronze",
        icon="sword",
        xp_reward=100,
        threshold=1,
        ordering_priority=22,
    ),
    AchievementDef(
        key="ttt_quick_thinker",
        name="Quick Thinker",
        description="Win an online Tic-Tac-Toe match in 5 moves.",
        category="skill",
        tier="silver",
        icon="bolt",
        xp_reward=150,
        threshold=1,
        ordering_priority=23,
    ),
    AchievementDef(
        key="ttt_strategist",
        name="Strategist",
        description="Win 3 online Tic-Tac-Toe matches in a row.",
        category="streaks",
        tier="silver",
        icon="chess",
        xp_reward=200,
        threshold=1,
        ordering_priority=24,
    ),
    AchievementDef(
        key="ttt_mind_reader",
        name="Mind Reader",
        description="Block an opponent winning move 5 times in online Tic-Tac-Toe.",
        category="skill",
        tier="silver",
        icon="eye",
        xp_reward=150,
        threshold=5,
        ordering_priority=25,
    ),
    AchievementDef(
        key="ttt_perfect_game",
        name="Perfect Game",
        description="Win online Tic-Tac-Toe with opponent placing at most 2 marks.",
        category="skill",
        tier="silver",
        icon="sparkles",
        xp_reward=200,
        threshold=1,
        ordering_priority=26,
    ),
    AchievementDef(
        key="ttt_draw_master",
        name="Draw Master",
        description="Get 5 draws in online Tic-Tac-Toe.",
        category="games",
        tier="bronze",
        icon="minus",
        xp_reward=100,
        threshold=5,
        ordering_priority=27,
    ),
    AchievementDef(
        key="ttt_veteran",
        name="Veteran",
        description="Play 25 online Tic-Tac-Toe matches.",
        category="games",
        tier="silver",
        icon="gamepad-2",
        xp_reward=200,
        threshold=25,
        ordering_priority=28,
    ),
    AchievementDef(
        key="ttt_grinder",
        name="Grinder",
        description="Play 100 online Tic-Tac-Toe matches.",
        category="games",
        tier="gold",
        icon="activity",
        xp_reward=400,
        threshold=100,
        ordering_priority=29,
    ),
    AchievementDef(
        key="ttt_unbeatable",
        name="Unbeatable",
        description="Win 10 online Tic-Tac-Toe matches in a row.",
        category="streaks",
        tier="gold",
        icon="shield-check",
        xp_reward=400,
        threshold=1,
        ordering_priority=30,
    ),

]

ACHIEVEMENT_MAP: dict[str, AchievementDef] = {a.key: a for a in ACHIEVEMENTS}
