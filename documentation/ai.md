# AI Opponent Implementation

## 1. Overview
- The current AI opponent is implemented only for **Pong**.
- It is used when the frontend launches `PongPage` with `mode=ai` and a selected difficulty in the URL query string.
- This AI is a **rule-based, heuristic paddle controller**. It does not use machine learning, training data, or search.
- Conceptually, it is a **reactive tracking AI**:
  - it reads the ball's current vertical position
  - it compares that position to the AI paddle's current vertical position
  - it moves the paddle toward the ball using a difficulty-dependent tracking factor
- The backend `PongConsumer` is now **PvP-only**. The active AI is not executed server-side and does not use the Pong WebSocket consumer.
- Tic-Tac-Toe does **not** currently have an active AI opponent in runtime code. Its current modes are local PvP and online PvP.

## 2. Game State Inputs
- The active Pong AI reads state from the local in-browser `gameState` object in `frontend/src/pages/PongPage.tsx`.
- The specific data used by the AI is:
  - `gs.ball.y`: current Y position of the ball
  - `gs.p2.y`: current Y position of the AI paddle
  - `difficulty`: parsed from the URL query string
  - `AI_SPEED[difficulty]`: tracking strength for the chosen difficulty
- Additional runtime values affect the overall AI match, even if they are not direct decision inputs:
  - `BALL_SPEED[difficulty]`: changes the initial and reset ball speed in AI mode
  - `canvas.height`: used to clamp paddle movement and bound the play area
  - `score` and `WIN_SCORE`: determine when the match ends, but do not affect AI decisions
- The AI accesses this data inside the `animate` callback:
  - `const gs = gameState.current`
  - `const difficulty` is derived once from `searchParams`
- Important limitation:
  - the AI does **not** read `ball.vx`
  - the AI does **not** read `ball.vy`
  - the AI does **not** inspect future trajectory or predict bounces

## 3. Decision-Making Logic
- The AI logic runs inside the same browser animation loop that updates the local Pong game.
- Each animation frame, the game performs the following sequence:
  1. Read player keyboard input for the left paddle.
  2. If `mode === 'ai'`, update the right paddle using the current vertical difference between the ball and the AI paddle.
  3. Move the ball using its current velocity.
  4. Resolve wall collisions.
  5. Resolve paddle collisions.
  6. Check scoring and reset the ball if needed.
  7. Render the frame.
- The AI decision itself is this line:

```ts
gs.p2.y += (gs.ball.y - gs.p2.y) * AI_SPEED[difficulty];
```

- Step-by-step, this means:
  1. Compute the vertical error: `ballY - paddleY`
  2. Multiply that error by a difficulty-specific factor
  3. Add the result to the current AI paddle Y position
  4. The paddle therefore moves part of the way toward the ball each frame
- This is not binary `"up"` / `"down"` logic. It is continuous position adjustment.
- Simplified pseudocode:

```text
every animation frame:
    if mode is AI:
        error = ball_y - ai_paddle_y
        ai_paddle_y = ai_paddle_y + error * ai_speed_for_difficulty
```

- Consequence of this design:
  - if the ball is far from the paddle, the paddle moves more in that frame
  - if the paddle is already close to the ball, the movement becomes smaller
  - this creates smooth tracking rather than instant snapping

## 4. Difficulty System
The three difficulties use the same core decision rule. What changes in code is:
- the `AI_SPEED` value
- the `BALL_SPEED` multiplier

There is **no separate reaction timer**, **no aim randomness**, and **no prediction mode switch** between difficulties in the active AI path.

### Easy
- reaction time:
  - no explicit delayed reaction exists in code
  - the AI still updates every animation frame
  - effective reaction is slower because `AI_SPEED.easy = 0.06`, so only 6% of the position error is corrected per frame
- accuracy:
  - lower effective accuracy because the paddle lags behind the ball more
  - there is no prediction, so fast ball changes expose this lag
- randomness:
  - none
  - no random aim offset, random delay, or random movement exists in the active AI logic
- behavior:
  - slowest paddle tracking
  - `BALL_SPEED.easy = 0.7`, so the ball moves at 70% of the base AI-mode speed
  - this makes rallies easier and gives the player more time to recover

### Medium
- reaction time:
  - no explicit delayed reaction exists in code
  - the AI still updates every animation frame
  - effective reaction is faster than easy because `AI_SPEED.medium = 0.10`
- accuracy:
  - more accurate than easy because the paddle closes the vertical gap faster
  - still imperfect because it only follows current `ball.y`
- randomness:
  - none
- behavior:
  - moderate tracking speed
  - `BALL_SPEED.medium = 1.0`, so the ball uses the base speed values
  - this is the baseline difficulty configuration

### Hard
- reaction time:
  - no explicit delayed reaction exists in code
  - the AI still updates every animation frame
  - effective reaction is fastest because `AI_SPEED.hard = 0.18`
- accuracy:
  - highest effective accuracy of the three difficulties because the paddle converges toward the ball more aggressively
  - still not perfect because it remains reactive rather than predictive
- randomness:
  - none
- behavior:
  - fastest paddle tracking
  - `BALL_SPEED.hard = 1.4`, so the ball moves at 140% of the base AI-mode speed
  - this increases challenge not only by making the AI paddle stronger, but also by making the entire game faster

## 5. Human-Like Behavior Design
- The AI avoids perfect play mainly through **limited information use** and **limited correction speed**.
- It is intentionally imperfect because:
  - it does not predict where the ball will be later
  - it does not read velocity to estimate trajectory
  - it does not simulate wall bounces
  - it only reacts to the current Y position of the ball
- This makes it feel closer to a human player visually:
  - the paddle chases the ball
  - it can lag behind sharp direction changes
  - it does not instantly snap to the ideal intercept point
- Imperfection is introduced by:
  - partial error correction with `AI_SPEED[difficulty]`
  - not by randomness
- It still remains competent because:
  - it updates every frame
  - it always moves toward the ball in the correct direction
  - higher difficulties reduce lag substantially
- Important technical note:
  - the current active AI path contains **no randomness at all**
  - the human-like quality comes from constrained tracking, not noisy decision-making

## 6. Adaptation to Game Customization
- The active AI adapts to the current game configuration in these ways:
  - difficulty is read dynamically from the URL query string
  - ball speed in AI mode changes through `BALL_SPEED[difficulty]`
  - paddle response changes through `AI_SPEED[difficulty]`
  - paddle movement is constrained by the current canvas height
  - the AI continuously reacts to live ball position during play
- Dynamic values in the current AI path:
  - `difficulty`
  - `gs.ball.y`
  - `gs.p2.y`
  - `canvas.height`
  - `score`
- Hardcoded values in the current AI path:
  - `WIN_SCORE = 7`
  - `PADDLE_SPEED = 6`
  - `AI_SPEED = { easy: 0.06, medium: 0.10, hard: 0.18 }`
  - `BALL_SPEED = { easy: 0.7, medium: 1.0, hard: 1.4 }`
  - `BASE_BALL_VX = 4`
  - `BASE_BALL_VY = 3`
  - collision thresholds and paddle bounds such as `40`, `8`, `22`, and `10`
- The current AI does **not** adapt to backend engine settings, server tick rate, or alternate field dimensions because it runs entirely in the frontend local mode.
- The backend still stores `ai_difficulty` when local AI matches are recorded, but that metadata is for match history and analytics, not runtime decision-making.

## 7. Performance Considerations
- The AI updates on each `requestAnimationFrame(...)` cycle.
- Its per-frame computational cost is constant time:
  - one subtraction
  - one multiplication
  - one addition
- This is efficient enough for real-time gameplay because the AI logic itself is trivial compared with rendering and collision handling.
- The AI mode does not send gameplay decisions over WebSockets, so there is no network overhead in local AI matches.
- Performance is suitable for real-time play because:
  - the logic is O(1) per frame
  - it uses local in-memory state only
  - it does not allocate complex data structures each update
  - it does not run search, prediction, or pathfinding algorithms
- One architectural consequence is that timing depends on the browser render loop rather than a fixed authoritative server tick, so AI responsiveness is tied to client-side frame execution.

## 8. Limitations
- The AI is only implemented for Pong.
- Tic-Tac-Toe currently has no active AI opponent in runtime code.
- Pong AI is purely reactive:
  - no velocity-based prediction
  - no bounce prediction
  - no opponent modeling
  - no learning
- The three difficulties do not change strategy. They only change tracking gain and ball-speed multiplier.
- There is no randomness in the current active AI path, so difficulty variation is deterministic.
- Hard mode is harder partly because the **ball is faster**, not only because the AI paddle logic is stronger.
- Because the AI runs locally in the browser:
  - it is not server-authoritative
  - it depends on frontend timing
  - it is less robust than a backend authoritative AI architecture for consistency and anti-cheat
- The current AI also uses hardcoded gameplay constants, so adaptation to broader customization is limited unless more settings are exposed to the frontend loop.

## 9. Conclusion
- The current implementation delivers a working AI opponent for Pong using a clean rule-based design.
- Technically, it is a frontend-only reactive paddle tracker that continuously moves the AI paddle toward the ball using difficulty-specific tracking strength.
- It satisfies the core evaluation goals in the following way:
  - challenging gameplay:
    - difficulty levels change both paddle responsiveness and ball speed
  - human-like behavior:
    - the AI is imperfect because it reacts to current position instead of predicting ideal interception
  - evaluation requirements:
    - the implementation is clearly structured
    - the difficulty parameters are explicit in code
    - the architecture is easy to explain and verify
- The most important architectural fact is that **frontend `mode=ai` in `PongPage.tsx` is the only active AI gameplay path**, while the backend Pong WebSocket consumer is now PvP-only.

## 10. Notes

Then stop overthinking it.

## The easiest decision is:

> **Run the AI locally in the frontend.**

---

# Why this is the correct “easy” choice (not opinion, reality)

## 1. Zero infrastructure complexity

Frontend AI:

* no WebSocket
* no async sync issues
* no server coordination
* no state reconciliation

Backend AI:

* WebSocket lifecycle
* sync between client & server
* race conditions
* message delays
* debugging hell

If your goal is *“finish the module safely”*, backend AI is unnecessary risk.

---

## 2. No latency problems

Frontend:

* AI runs in the same loop as the game
* instant reaction
* smooth gameplay

Backend:

* network delay (even locally)
* jitter
* desync risk
* you now have to compensate for latency

##11. code blocks

### Location: `frontend/src/pages/PlayPage.tsx` (launching Pong AI mode, lines 56-61)

```ts
const launch = () => {
  if (!game || !mode) return;
  if (game === 'pong') {
    if      (mode === 'online') navigate('/games/pong?mode=online');
    else if (mode === 'ai')     navigate(`/games/pong?mode=ai&difficulty=${difficulty}`);
    else                        navigate('/games/pong?mode=local');
  } else {
    // TicTacToe
    if (mode === 'online') navigate('/games/tictactoe?mode=online');
    else                   navigate('/games/tictactoe?mode=local');
  }
};
```

### Location: `frontend/src/pages/PongPage.tsx` (AI difficulty constants, lines 20-28)

```ts
const WIN_SCORE = 7;
const PADDLE_SPEED = 6;
// AI difficulty - higher = faster/harder
const AI_SPEED: Record<Difficulty, number> = { easy: 0.06, medium: 0.10, hard: 0.18 };
// Ball speed multipliers based on difficulty
const BALL_SPEED: Record<Difficulty, number> = { easy: 0.7, medium: 1.0, hard: 1.4 };
// Base ball speeds (medium difficulty / local / online)
const BASE_BALL_VX = 4;
const BASE_BALL_VY = 3;
```

### Location: `frontend/src/pages/PongPage.tsx` (mode and difficulty parsing, lines 95-106)

```ts
const rawMode = searchParams.get('mode') ?? 'local';
const mode: Mode = rawMode === 'online' ? 'online' : rawMode === 'ai' ? 'ai' : 'local';
// Difficulty is locked at start — read once from URL, never changes
const rawDiff = searchParams.get('difficulty') ?? 'medium';
const difficulty: Difficulty = (['easy','medium','hard'] as Difficulty[]).includes(rawDiff as Difficulty)
  ? rawDiff as Difficulty : 'medium';

// Helper: Get ball speed based on mode and difficulty
const getBallSpeed = (vx: number, vy: number) => {
  // AI mode uses difficulty-based speed, local/online use normal (medium) speed
  const multiplier = mode === 'ai' ? BALL_SPEED[difficulty] : 1.0;
  return { vx: vx * multiplier, vy: vy * multiplier };
};
```

### Location: `frontend/src/pages/PongPage.tsx` (AI/local game state setup, lines 116-121)

```ts
const initialBall = getBallSpeed(BASE_BALL_VX, BASE_BALL_VY);
const gameState = useRef({
  p1: { y: 250 } as PaddleState,
  p2: { y: 250 } as PaddleState,
  ball: { x: 400, y: 250, vx: initialBall.vx, vy: initialBall.vy } as BallState,
});
```

### Location: `frontend/src/pages/PongPage.tsx` (core AI decision logic inside animation loop, lines 160-216)

```ts
const animate = useCallback(() => {
  if (mode === 'online') return;
  if (mode === 'local' && !localNamesReady) return;
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const gs = gameState.current;
  const keys = keysRef.current;

  if (!gameOver) {
    // Player 1 (left / blue): W / S or Arrow keys in AI mode
    if (keys['w'] || keys['W'] || (mode === 'ai' && keys['ArrowUp'])) gs.p1.y = Math.max(40, gs.p1.y - PADDLE_SPEED);
    if (keys['s'] || keys['S'] || (mode === 'ai' && keys['ArrowDown'])) gs.p1.y = Math.min(canvas.height - 40, gs.p1.y + PADDLE_SPEED);

    if (mode === 'ai') {
      // AI controls right paddle — speed locked by difficulty
      gs.p2.y += (gs.ball.y - gs.p2.y) * AI_SPEED[difficulty];
    } else {
      // Local 2P: Player 2 uses Arrow keys
      if (keys['ArrowUp'])   gs.p2.y = Math.max(40, gs.p2.y - PADDLE_SPEED);
      if (keys['ArrowDown']) gs.p2.y = Math.min(canvas.height - 40, gs.p2.y + PADDLE_SPEED);
    }

    gs.ball.x += gs.ball.vx;
    gs.ball.y += gs.ball.vy;

    if (gs.ball.y <= 8 || gs.ball.y >= canvas.height - 8) gs.ball.vy *= -1;

    if (gs.ball.x <= 22 && gs.ball.x >= 10 && gs.ball.y >= gs.p1.y - 40 && gs.ball.y <= gs.p1.y + 40) {
      gs.ball.vx = Math.abs(gs.ball.vx) * 1.02;
      gs.ball.vy += (gs.ball.y - gs.p1.y) * 0.04;
    }
    if (gs.ball.x >= canvas.width - 22 && gs.ball.x <= canvas.width - 10 && gs.ball.y >= gs.p2.y - 40 && gs.ball.y <= gs.p2.y + 40) {
      gs.ball.vx = -Math.abs(gs.ball.vx) * 1.02;
      gs.ball.vy += (gs.ball.y - gs.p2.y) * 0.04;
    }

    if (gs.ball.x < 0) {
      setScore((prev) => { const next = { ...prev, p2: prev.p2 + 1 }; if (next.p2 >= WIN_SCORE) setGameOver(true); return next; });
      const resetSpeed = getBallSpeed(-BASE_BALL_VX, BASE_BALL_VY);
      gs.ball = { x: canvas.width / 2, y: canvas.height / 2, vx: resetSpeed.vx, vy: resetSpeed.vy };
    }
    if (gs.ball.x > canvas.width) {
      setScore((prev) => { const next = { ...prev, p1: prev.p1 + 1 }; if (next.p1 >= WIN_SCORE) setGameOver(true); return next; });
      const resetSpeed = getBallSpeed(BASE_BALL_VX, -BASE_BALL_VY);
      gs.ball = { x: canvas.width / 2, y: canvas.height / 2, vx: resetSpeed.vx, vy: resetSpeed.vy };
    }
  }

  drawFrame(ctx, canvas, gs.p1.y, gs.p2.y, gs.ball);
  
  // Only continue loop if game is not over
  if (!gameOver) {
    requestAnimationFrame(animate);
  }
}, [mode, gameOver, difficulty, localNamesReady]);
```

### Location: `frontend/src/pages/PongPage.tsx` (starting the local AI loop, lines 218-227)

```ts
useEffect(() => {
  // Don't start loop if game is over or in online mode
  if (mode === 'online' || gameOver || (mode === 'local' && !localNamesReady)) return;
  // Set start time on first frame for local/AI modes
  if (!gameStartTime && (mode === 'ai' || (mode === 'local' && localNamesReady))) {
    setGameStartTime(Date.now());
  }
  const id = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(id);
}, [mode, animate, gameOver, gameStartTime, localNamesReady]);
```

### Location: `frontend/src/pages/PongPage.tsx` (saving AI match metadata, lines 229-263)

```ts
useEffect(() => {
  if (!gameOver || mode === 'online' || !gameStartTime) return;
  
  const saveMatch = async () => {
    const durationSeconds = Math.round((Date.now() - gameStartTime) / 1000);
    const winner = score.p1 >= WIN_SCORE ? 'X' : 'O';
    
    try {
      await createLocalMatch({
        game_type: 'pong',
        game_mode: mode === 'ai' ? 'pve' : 'pvp',
        winner: winner,
        duration_seconds: durationSeconds,
        player1_score: score.p1,
        player2_score: score.p2,
        ai_difficulty: mode === 'ai' ? difficulty : undefined,
        metadata: {
          mode,
          final_score: score,
          local_players: mode === 'local'
            ? {
                player1_name: localPlayerNames.p1.trim(),
                player2_name: localPlayerNames.p2.trim(),
              }
            : undefined,
        },
      });
    } catch (error) {
      console.error('Failed to save Pong match:', error);
    }
  };
  
  saveMatch();
}, [gameOver, mode, gameStartTime, score, difficulty, localPlayerNames]);
```

### Location: `backend/apps/games/views.py` (backend recording of local AI matches, lines 451-535)

```py
def post(self, request):
    from datetime import datetime, timezone as tz
    from apps.games.models import Match, MatchPlayer, GameType, GameMode, FinishReason, MatchOutcome
    from django.utils import timezone as dj_tz
    import uuid

    data = request.data
    user = request.user

    # Validate required fields
    game_type = data.get("game_type")
    if game_type not in ("pong", "tictactoe"):
        return Response({"error": "Invalid game_type"}, status=status.HTTP_400_BAD_REQUEST)

    game_mode_str = data.get("game_mode", "pvp")
    if game_mode_str not in ("pvp", "pve"):
        return Response({"error": "Invalid game_mode"}, status=status.HTTP_400_BAD_REQUEST)

    # Extract result
    winner = data.get("winner")  # "X", "O", or None for draw
    duration_seconds = float(data.get("duration_seconds", 0))
    ai_difficulty = data.get("ai_difficulty", "")
    player1_score = int(data.get("player1_score", 0))
    player2_score = int(data.get("player2_score", 0))

    # Determine finish reason
    if winner is None:
        finish_reason = FinishReason.DRAW
    else:
        finish_reason = FinishReason.SCORE

    # Determine winner
    winner_user = None
    player_outcome = MatchOutcome.DRAW
    
    if game_mode_str == "pve":
        # Player is always slot 1 (X), AI is slot 2 (O)
        if winner == "X":
            winner_user = user
            player_outcome = MatchOutcome.WIN
        elif winner == "O":
            player_outcome = MatchOutcome.LOSS
    else:
        # Local PvP: both slots are human, winner is determined
        if winner == "X":
            winner_user = user
            player_outcome = MatchOutcome.WIN
        elif winner == "O":
            # In local PvP, we can't track second player
            player_outcome = MatchOutcome.LOSS

    # Create match
    now = dj_tz.now()
    started_at = now - dj_tz.timedelta(seconds=duration_seconds)

    match = Match.objects.create(
        game_session_id=f"local-{uuid.uuid4().hex[:16]}",
        game_type=game_type,
        game_mode=game_mode_str,
        finish_reason=finish_reason,
        winner=winner_user,
        started_at=started_at,
        finished_at=now,
        duration_seconds=round(duration_seconds, 2),
        player1_score=player1_score,
        player2_score=player2_score,
        ai_difficulty=ai_difficulty,
        metadata=data.get("metadata", {}),
    )

    # Create player record
    MatchPlayer.objects.create(
        match=match,
        user=user,
        slot=1,  # User is always slot 1
        outcome=player_outcome,
        score=player1_score,
        xp_earned=0,
    )

    # Invalidate stats cache
    from apps.games.stats_service import invalidate_user_stats
    invalidate_user_stats(user.pk)
```

### Location: `backend/apps/games/models.py` (database AI metadata field, lines 100-106)

```py
# AI metadata
ai_difficulty = models.CharField(
    max_length=20,
    blank=True,
    default="",
    help_text="AI difficulty if this was a PvE game.",
)
```

### Location: `backend/apps/games/pong_consumer.py`

```py
# No active AI code remains in this file.
# The Pong WebSocket consumer is now PvP-only.
```

You’re adding problems you don’t need.

---

## 3. Simpler debugging

Frontend:

* console.log → done
* inspect state directly
* deterministic behavior

Backend:

* logs split across client + server
* async bugs
* timing issues
* harder to reproduce problems

---

## 4. Evaluation does NOT require backend AI

Read the requirement carefully:

> “Introduce an AI Opponent for games”

It does NOT say:

* distributed system
* server-side AI
* multiplayer AI service

So backend AI gives you **zero extra points**.

---

## 5. Faster to make it “human-like”

Frontend:

* easy to tweak:

  * reaction delay
  * randomness
  * prediction error

Backend:

* every tweak requires:

  * redeploy / restart
  * syncing protocol
  * possible bugs

---

# The only reason to use backend AI (which you don’t need)

Backend AI makes sense if:

* AI plays against real users in multiplayer
* server is authoritative
* anti-cheat matters
* matchmaking uses bots

That is **not your requirement**.

---
