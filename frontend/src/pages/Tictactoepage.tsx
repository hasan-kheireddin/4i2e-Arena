import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TicTacToeGameView from './TicTacToeGameView';
import {
  checkWinner,
  getDisplayBoard,
  isOnlineTurnPlayable,
  resolveMode,
  shouldShowRealtimeRecoveryOverlay,
} from './TicTacToeGameShared';
import { useTicTacToeLocalGame } from './useTicTacToeLocalGame';
import { useTicTacToeOnlineGame } from './useTicTacToeOnlineGame';
import FloatingChatWidget from '../components/Chat/FloatingChatWidget';

export default function TicTacToePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialGameId = searchParams.get('game_id');
  const mode = resolveMode(
    searchParams.get('mode') ?? 'local',
    searchParams.has('game_id'),
  );

  const localGame = useTicTacToeLocalGame({ mode });
  const onlineGame = useTicTacToeOnlineGame({
    mode,
    initialGameId,
    defaultOpponentName: t('ttt.opponent'),
    onExit: () => navigate('/games/playpage'),
  });

  const displayBoard = getDisplayBoard(
    mode,
    onlineGame.onlineGameState,
    localGame.board,
  );
  const displayWinner = mode === 'online'
    ? onlineGame.onlineWinner
    : localGame.winner;
  const displayLine = mode === 'online'
    ? checkWinner(displayBoard).line
    : localGame.line;
  const isMyTurn = isOnlineTurnPlayable(
    onlineGame.onlineGameState?.current_turn,
    onlineGame.mySymbol,
    onlineGame.onlinePhase,
    onlineGame.gamePaused,
  );
  const showRealtimeRecoveryOverlay = shouldShowRealtimeRecoveryOverlay(
    mode,
    onlineGame.onlinePhase,
    onlineGame.gamePaused,
    onlineGame.gameSocketStatus,
  );

  const handleCellClick = (index: number) => {
    if (mode === 'local') {
      localGame.playMove(index);
      return;
    }
    onlineGame.playMove(index);
  };

  return (
    <>
      <TicTacToeGameView
        mode={mode}
        displayBoard={displayBoard}
        displayWinner={displayWinner}
        displayLine={displayLine}
        scores={localGame.scores}
        localPlayerNames={localGame.localPlayerNames}
        localNamesReady={localGame.localNamesReady}
        isXTurn={localGame.isXTurn}
        mySymbol={onlineGame.mySymbol}
        opponentName={onlineGame.opponentName}
        onlinePhase={onlineGame.onlinePhase}
        onlineWinner={onlineGame.onlineWinner}
        iReady={onlineGame.iReady}
        opponentReady={onlineGame.opponentReady}
        gamePaused={onlineGame.gamePaused}
        gameSocketStatus={onlineGame.gameSocketStatus}
        isMyTurn={isMyTurn}
        showRealtimeRecoveryOverlay={showRealtimeRecoveryOverlay}
        opponentLeftMsg={onlineGame.opponentLeftMsg}
        gameOverReason={onlineGame.gameOverReason}
        floatingEmotes={onlineGame.floatingEmotes}
        showEmotePalette={onlineGame.showEmotePalette}
        onDismissOpponentLeft={onlineGame.dismissOpponentLeft}
        onLocalPlayerNamesChange={localGame.setLocalPlayerNames}
        onStartLocalGame={localGame.startLocalGame}
        onReady={onlineGame.ready}
        onCancelOnline={onlineGame.cancelOnline}
        onCellClick={handleCellClick}
        onResetGame={localGame.resetGame}
        onPlayAgainOnline={onlineGame.findMatch}
        onBackToGames={() => navigate('/games/playpage')}
        onForfeit={onlineGame.forfeit}
        onToggleEmotePalette={onlineGame.toggleEmotePalette}
        onSendEmote={onlineGame.sendEmote}
      />
      <FloatingChatWidget />
    </>
  );
}
