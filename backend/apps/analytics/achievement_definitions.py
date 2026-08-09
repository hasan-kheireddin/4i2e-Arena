from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AchievementDef:
    key: str
    name: str
    description: str
    category: str
    rarity: str
    icon: str
    xp_reward: int
    threshold: int = 1
    is_hidden: bool = False
    ordering_priority: int = 0


def achievement(
    key: str,
    name: str,
    description: str,
    category: str,
    rarity: str,
    icon: str,
    xp_reward: int,
    threshold: int = 1,
    ordering_priority: int = 0,
) -> AchievementDef:
    return AchievementDef(
        key=key,
        name=name,
        description=description,
        category=category,
        rarity=rarity,
        icon=icon,
        xp_reward=xp_reward,
        threshold=threshold,
        ordering_priority=ordering_priority,
    )


ACHIEVEMENTS: list[AchievementDef] = [
    achievement("pong_first_rally", "Rally Regular", "Complete 5 online Pong matches.", "pong", "rare", "table-tennis", 100, 5, 1),
    achievement("pong_getting_warm", "Getting Warm", "Win 3 online Pong matches.", "pong", "rare", "flame", 150, 3, 2),
    achievement("pong_ace", "Pong Ace", "Win 25 online Pong matches.", "pong", "epic", "medal", 300, 25, 3),
    achievement("pong_master", "Pong Master", "Win 100 online Pong matches.", "pong", "legendary", "trophy", 750, 100, 4),
    achievement("pong_rally_master", "Rally Master", "Reach a 30-hit rally in online Pong.", "pong", "rare", "repeat", 200, 1, 5),
    achievement("pong_speed_demon", "Speed Demon", "Score 3 points in under 10 seconds in online Pong.", "pong", "rare", "zap", 200, 1, 6),
    achievement("pong_unstoppable", "Unstoppable", "Win 5 online Pong matches in a row.", "pong", "epic", "rocket", 300, 1, 7),
    achievement("pong_precision_player", "Precision Player", "Win online Pong without missing the ball.", "pong", "epic", "crosshair", 300, 1, 8),
    achievement("pong_comeback_king", "Comeback King", "Win online Pong after trailing by 4 points.", "pong", "epic", "arrow-up", 300, 1, 9),
    achievement("pong_defensive_wall", "Defensive Wall", "Return 15 consecutive shots in online Pong.", "pong", "rare", "shield", 250, 1, 10),
    achievement("pong_dominator", "Dominator", "Win an online Pong match with a shutout.", "pong", "epic", "crown", 350, 1, 11),
    achievement("pong_veteran", "Pong Veteran", "Play 50 online Pong matches.", "pong", "rare", "gamepad", 250, 50, 12),
    achievement("pong_grinder", "Pong Grinder", "Play 200 online Pong matches.", "pong", "epic", "target", 500, 200, 13),
    achievement("ttt_first_move", "Board Regular", "Complete 5 online Tic-Tac-Toe matches.", "tictactoe", "rare", "grid", 100, 5, 101),
    achievement("ttt_first_victory", "Proven Winner", "Win 5 online Tic-Tac-Toe matches.", "tictactoe", "rare", "sword", 150, 5, 102),
    achievement("ttt_quick_thinker", "Quick Thinker", "Win online Tic-Tac-Toe in 5 moves.", "tictactoe", "rare", "bolt", 200, 1, 103),
    achievement("ttt_strategist", "Strategist", "Win 5 online Tic-Tac-Toe matches in a row.", "tictactoe", "epic", "chess", 300, 1, 104),
    achievement("ttt_mind_reader", "Mind Reader", "Block 15 opponent winning moves online.", "tictactoe", "rare", "eye", 250, 15, 105),
    achievement("ttt_perfect_game", "Perfect Game", "Win while the opponent places at most 2 marks.", "tictactoe", "epic", "sparkles", 300, 1, 106),
    achievement("ttt_draw_master", "Draw Master", "Draw 10 online Tic-Tac-Toe matches.", "tictactoe", "rare", "minus", 150, 10, 107),
    achievement("ttt_veteran", "Tic-Tac-Toe Veteran", "Play 50 online Tic-Tac-Toe matches.", "tictactoe", "rare", "gamepad-2", 250, 50, 108),
    achievement("ttt_grinder", "Tic-Tac-Toe Grinder", "Play 200 online Tic-Tac-Toe matches.", "tictactoe", "epic", "activity", 500, 200, 109),
    achievement("ttt_unbeatable", "Unbeatable", "Win 10 online Tic-Tac-Toe matches in a row.", "tictactoe", "legendary", "shield-check", 750, 1, 110),
]

ACHIEVEMENT_MAP: dict[str, AchievementDef] = {
    definition.key: definition for definition in ACHIEVEMENTS
}

ACHIEVEMENTS_BY_CATEGORY: dict[str, tuple[AchievementDef, ...]] = {
    category: tuple(
        definition
        for definition in ACHIEVEMENTS
        if definition.category == category
    )
    for category in ("pong", "tictactoe")
}
