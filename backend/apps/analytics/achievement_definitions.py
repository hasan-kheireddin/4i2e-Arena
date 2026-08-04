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
    achievement("pong_first_rally", "First Rally", "Complete your first online Pong match.", "pong", "common", "table-tennis", 50, 1, 1),
    achievement("pong_getting_warm", "Getting Warm", "Win your first online Pong match.", "pong", "common", "flame", 100, 1, 2),
    achievement("pong_ace", "Pong Ace", "Win 10 online Pong matches.", "pong", "rare", "medal", 200, 10, 3),
    achievement("pong_master", "Pong Master", "Win 50 online Pong matches.", "pong", "epic", "trophy", 500, 50, 4),
    achievement("pong_rally_master", "Rally Master", "Reach a 20-hit rally in online Pong.", "pong", "rare", "repeat", 150, 1, 5),
    achievement("pong_speed_demon", "Speed Demon", "Score 3 points in under 10 seconds in online Pong.", "pong", "rare", "zap", 150, 1, 6),
    achievement("pong_unstoppable", "Unstoppable", "Win 3 online Pong matches in a row.", "pong", "rare", "rocket", 200, 1, 7),
    achievement("pong_precision_player", "Precision Player", "Win online Pong without missing the ball.", "pong", "epic", "crosshair", 250, 1, 8),
    achievement("pong_comeback_king", "Comeback King", "Win online Pong after trailing by 3 points.", "pong", "epic", "arrow-up", 250, 1, 9),
    achievement("pong_defensive_wall", "Defensive Wall", "Return 10 consecutive shots in online Pong.", "pong", "rare", "shield", 200, 1, 10),
    achievement("pong_dominator", "Dominator", "Win an online Pong match with a shutout.", "pong", "epic", "crown", 300, 1, 11),
    achievement("pong_veteran", "Pong Veteran", "Play 25 online Pong matches.", "pong", "rare", "gamepad", 200, 25, 12),
    achievement("pong_grinder", "Pong Grinder", "Play 100 online Pong matches.", "pong", "epic", "target", 400, 100, 13),
    achievement("pong_champion", "Pong Champion", "Reach the online Pong top 10.", "pong", "epic", "award", 400, 1, 14),
    achievement("pong_legend", "Pong Legend", "Reach rank 1 on the online Pong leaderboard.", "pong", "legendary", "crown", 750, 1, 15),
    achievement("ttt_first_move", "First Move", "Complete your first online Tic-Tac-Toe match.", "tictactoe", "common", "grid", 50, 1, 101),
    achievement("ttt_first_victory", "First Victory", "Win your first online Tic-Tac-Toe match.", "tictactoe", "common", "sword", 100, 1, 102),
    achievement("ttt_quick_thinker", "Quick Thinker", "Win online Tic-Tac-Toe in 5 moves.", "tictactoe", "rare", "bolt", 150, 1, 103),
    achievement("ttt_strategist", "Strategist", "Win 3 online Tic-Tac-Toe matches in a row.", "tictactoe", "rare", "chess", 200, 1, 104),
    achievement("ttt_mind_reader", "Mind Reader", "Block 5 opponent winning moves online.", "tictactoe", "rare", "eye", 150, 5, 105),
    achievement("ttt_perfect_game", "Perfect Game", "Win while the opponent places at most 2 marks.", "tictactoe", "epic", "sparkles", 250, 1, 106),
    achievement("ttt_draw_master", "Draw Master", "Draw 5 online Tic-Tac-Toe matches.", "tictactoe", "common", "minus", 100, 5, 107),
    achievement("ttt_veteran", "Tic-Tac-Toe Veteran", "Play 25 online Tic-Tac-Toe matches.", "tictactoe", "rare", "gamepad-2", 200, 25, 108),
    achievement("ttt_grinder", "Tic-Tac-Toe Grinder", "Play 100 online Tic-Tac-Toe matches.", "tictactoe", "epic", "activity", 400, 100, 109),
    achievement("ttt_unbeatable", "Unbeatable", "Win 10 online Tic-Tac-Toe matches in a row.", "tictactoe", "legendary", "shield-check", 600, 1, 110),
    achievement("level_5", "Rising Player", "Reach player level 5.", "level", "common", "trending-up", 100, 5, 201),
    achievement("level_10", "Seasoned Player", "Reach player level 10.", "level", "rare", "star", 200, 10, 202),
    achievement("level_25", "Elite Player", "Reach player level 25.", "level", "epic", "gem", 400, 25, 203),
    achievement("level_50", "Arena Master", "Reach player level 50.", "level", "epic", "shield", 750, 50, 204),
    achievement("level_100", "Arena Legend", "Reach player level 100.", "level", "legendary", "crown", 1500, 100, 205),
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
    for category in ("pong", "tictactoe", "level")
}
