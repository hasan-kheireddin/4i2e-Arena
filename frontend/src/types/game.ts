export interface Vec2 {
  x: number;
  y: number;
}

export interface objectData {
  objectId: string;
  x: number;
  y: number;
  angle: number;
  vertex?: Vec2[];
  radius?: number;
  shapeType: number;
}

export interface renderData {
  objectId: string;
  x: number;
  y: number;
  angle: number;
}

export enum PlayerLocation {
  LEFT = 0,
  RIGHT = 1,
  OBSERVER = 2,
}

export interface PlayerData {
  leftPlayerNickName: string;
  rightPlayerNickName: string;
}

export interface matchStartData {
  gameId: string;
  playerLocation: PlayerLocation;
  sceneData: objectData[];
  leftPlayerNickName: string;
  rightPlayerNickName: string;
}

export interface onSceneObserverData {
  gameId: string;
  playerLocation: PlayerLocation;
  sceneData: objectData[];
  leftPlayerNickName: string;
  rightPlayerNickName: string;
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PaddleState {
  y: number;
}

export interface OnlineGameState {
  ball: BallState;
  paddles: { [slot: number]: PaddleState };
}
