import { useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PongGameView, { type PongMode } from './PongGameView';
import { usePongLocalGame } from './usePongLocalGame';
import { usePongOnlineGame } from './usePongOnlineGame';
import FloatingChatWidget from '../components/Chat/FloatingChatWidget';

export default function PongPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = resolveMode(
    searchParams.get('mode'),
    searchParams.has('game_id'),
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localGame = usePongLocalGame({ canvasRef, mode });
  const onlineGame = usePongOnlineGame({
    canvasRef,
    keysRef: localGame.keysRef,
    mode,
    initialGameId: searchParams.get('game_id'),
    onExit: () => navigate('/games/playpage'),
  });

  return (
    <>
      <PongGameView
        canvasRef={canvasRef}
        mode={mode}
        onlinePhase={onlineGame.onlinePhase}
        score={localGame.score}
        onlineScore={onlineGame.onlineScore}
        mySlot={onlineGame.mySlot}
        opponentName={onlineGame.opponentName}
        opponentLeft={onlineGame.opponentLeft}
        onlineReason={onlineGame.onlineReason}
        onlineWinnerSlot={onlineGame.onlineWinnerSlot}
        localPlayerNames={localGame.localPlayerNames}
        localNamesReady={localGame.localNamesReady}
        gameOver={localGame.gameOver}
        iReady={onlineGame.iReady}
        opponentReady={onlineGame.opponentReady}
        gamePaused={onlineGame.gamePaused}
        gameSocketStatus={onlineGame.gameSocketStatus}
        spectatorCount={onlineGame.spectatorCount}
        showEmotePalette={onlineGame.showEmotePalette}
        floatingEmotes={onlineGame.floatingEmotes}
        isLocalPaused={localGame.isLocalPaused}
        onLocalPlayerNamesChange={localGame.setLocalPlayerNames}
        onStartLocalGame={localGame.startLocalGame}
        onFindMatch={onlineGame.findMatch}
        onCancelOnline={onlineGame.cancelOnline}
        onReady={onlineGame.ready}
        onResetGame={localGame.resetGame}
        onBackToGames={() => navigate('/games/playpage')}
        onToggleLocalPause={localGame.toggleLocalPause}
        onForfeit={onlineGame.forfeit}
        onEmote={(emote) => onlineGame.sendEmote(emote.id)}
      />
      <FloatingChatWidget />
    </>
  );
}

function resolveMode(rawMode: string | null, hasGameId: boolean): PongMode {
  if (hasGameId || rawMode === 'online') return 'online';
  return 'local';
}
