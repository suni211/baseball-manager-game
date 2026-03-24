import { Server as SocketServer, Socket } from 'socket.io';
import pool from '../database/db';
import { simulateMatch, MatchResult } from './matchEngine';

// =============================================
// 실시간 경기 상태 타입
// =============================================

interface LiveMatchState {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  inning: number;
  half: '초' | '말';
  outs: number;
  runners: string;
  currentBatter: string | null;
  currentPitcher: string | null;
  playLog: LivePlayEvent[];
  status: 'waiting' | 'playing' | 'paused' | 'finished';
  homeTimeoutsLeft: number;
  awayTimeoutsLeft: number;
  timeoutActive: boolean;
  timeoutTeam: 'home' | 'away' | null;
  timeoutEndTime: number | null;
  weather: string;
  attendance: number;
}

interface LivePlayEvent {
  inning: number;
  half: '초' | '말';
  eventType: string;
  description: string;
  outs: number;
  scoreHome: number;
  scoreAway: number;
  runnersOn: string;
  timestamp: number;
}

// =============================================
// 실시간 경기 서비스
// =============================================

export class RealtimeMatchService {
  private io: SocketServer;
  private liveMatches: Map<number, LiveMatchState> = new Map();
  private simulationTimers: Map<number, NodeJS.Timeout[]> = new Map();

  constructor(io: SocketServer) {
    this.io = io;
    this.setupSocketHandlers();
  }

  // =============================================
  // 소켓 이벤트 핸들러 설정
  // =============================================

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[소켓] 클라이언트 접속: ${socket.id}`);

      // 경기 방 참가
      socket.on('joinMatch', (matchId: number) => {
        const room = `match-${matchId}`;
        socket.join(room);
        console.log(`[소켓] ${socket.id} → 경기 ${matchId} 관전 시작`);

        // 이미 진행 중인 경기면 현재 상태 전송
        const state = this.liveMatches.get(matchId);
        if (state) {
          socket.emit('matchState', state);
        }
      });

      // 경기 방 퇴장
      socket.on('leaveMatch', (matchId: number) => {
        socket.leave(`match-${matchId}`);
        console.log(`[소켓] ${socket.id} → 경기 ${matchId} 관전 종료`);
      });

      // 타임아웃 요청
      socket.on('requestTimeout', (data: { matchId: number; team: 'home' | 'away'; userId: number }) => {
        this.handleTimeoutRequest(data.matchId, data.team, data.userId);
      });

      // 라이브 경기 목록 요청
      socket.on('getLiveMatches', () => {
        const liveList = Array.from(this.liveMatches.entries()).map(([id, state]) => ({
          matchId: id,
          homeName: state.homeName,
          awayName: state.awayName,
          homeScore: state.homeScore,
          awayScore: state.awayScore,
          inning: state.inning,
          half: state.half,
          status: state.status,
        }));
        socket.emit('liveMatchesList', liveList);
      });

      socket.on('disconnect', () => {
        console.log(`[소켓] 클라이언트 퇴장: ${socket.id}`);
      });
    });
  }

  // =============================================
  // 타임아웃 처리
  // =============================================

  private async handleTimeoutRequest(matchId: number, team: 'home' | 'away', userId: number) {
    const state = this.liveMatches.get(matchId);
    if (!state) return;

    // 이미 타임아웃 중이면 무시
    if (state.timeoutActive) {
      this.io.to(`match-${matchId}`).emit('timeoutDenied', { reason: '이미 타임아웃 진행 중입니다.' });
      return;
    }

    // 경기가 진행 중이어야 함
    if (state.status !== 'playing') {
      this.io.to(`match-${matchId}`).emit('timeoutDenied', { reason: '경기가 진행 중이 아닙니다.' });
      return;
    }

    // 해당 팀의 유저인지 검증
    const teamId = team === 'home' ? state.homeTeamId : state.awayTeamId;
    const userCheck = await pool.query('SELECT id FROM teams WHERE id = $1 AND owner_id = $2', [teamId, userId]);
    if (userCheck.rows.length === 0) {
      this.io.to(`match-${matchId}`).emit('timeoutDenied', { reason: '해당 팀의 감독이 아닙니다.' });
      return;
    }

    // 타임아웃 횟수 확인
    const timeoutsLeft = team === 'home' ? state.homeTimeoutsLeft : state.awayTimeoutsLeft;
    if (timeoutsLeft <= 0) {
      this.io.to(`match-${matchId}`).emit('timeoutDenied', { reason: '타임아웃 횟수를 모두 사용했습니다.' });
      return;
    }

    // 타임아웃 실행: 2분 동안 시뮬레이션 일시정지
    state.timeoutActive = true;
    state.timeoutTeam = team;
    state.status = 'paused';
    const TIMEOUT_DURATION = 2 * 60 * 1000; // 2분
    state.timeoutEndTime = Date.now() + TIMEOUT_DURATION;

    if (team === 'home') {
      state.homeTimeoutsLeft--;
    } else {
      state.awayTimeoutsLeft--;
    }

    const teamName = team === 'home' ? state.homeName : state.awayName;

    this.io.to(`match-${matchId}`).emit('timeout', {
      team,
      teamName,
      timeoutsLeft: team === 'home' ? state.homeTimeoutsLeft : state.awayTimeoutsLeft,
      duration: TIMEOUT_DURATION,
      endTime: state.timeoutEndTime,
    });

    // 2분 후 자동 재개
    setTimeout(() => {
      if (state.timeoutActive && state.timeoutTeam === team) {
        state.timeoutActive = false;
        state.timeoutTeam = null;
        state.timeoutEndTime = null;
        state.status = 'playing';
        this.io.to(`match-${matchId}`).emit('timeoutEnd', { team });
      }
    }, TIMEOUT_DURATION);
  }

  // =============================================
  // 실시간 경기 시뮬레이션
  // =============================================

  async simulateMatchRealtime(matchId: number): Promise<MatchResult> {
    // 경기 정보 로드
    const matchQuery = await pool.query(
      `SELECT m.*, ht.name as home_name, at.name as away_name
       FROM matches m
       JOIN teams ht ON m.home_team_id = ht.id
       JOIN teams at ON m.away_team_id = at.id
       WHERE m.id = $1`,
      [matchId]
    );

    if (matchQuery.rows.length === 0) {
      throw new Error(`경기 ID ${matchId}를 찾을 수 없습니다`);
    }

    const m = matchQuery.rows[0];

    // 경기 상태를 '진행중'으로 업데이트
    await pool.query('UPDATE matches SET status = $1 WHERE id = $2', ['진행중', matchId]);

    // 라이브 상태 초기화
    const state: LiveMatchState = {
      matchId,
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      homeName: m.home_name,
      awayName: m.away_name,
      homeScore: 0,
      awayScore: 0,
      inning: 0,
      half: '초',
      outs: 0,
      runners: '',
      currentBatter: null,
      currentPitcher: null,
      playLog: [],
      status: 'playing',
      homeTimeoutsLeft: 3,
      awayTimeoutsLeft: 3,
      timeoutActive: false,
      timeoutTeam: null,
      timeoutEndTime: null,
      weather: '맑음',
      attendance: 0,
    };

    this.liveMatches.set(matchId, state);
    this.simulationTimers.set(matchId, []);

    // 알림: 경기 시작 예고
    this.io.to(`match-${matchId}`).emit('matchStarting', {
      matchId,
      homeName: m.home_name,
      awayName: m.away_name,
    });

    // 기존 matchEngine의 simulateMatch를 호출하여 전체 결과를 먼저 계산
    const result = await simulateMatch(matchId);

    // playLog를 시간 간격을 두고 하나씩 브로드캐스트
    state.weather = result.weather;
    state.attendance = result.attendance;

    // 이벤트 사이의 간격 계산
    // 총 10분(600초) / 총 이벤트 수 = 이벤트당 간격
    const totalEvents = result.playLog.length;
    const TARGET_DURATION_MS = 10 * 60 * 1000; // 10분
    const baseDelay = Math.max(2000, Math.floor(TARGET_DURATION_MS / Math.max(totalEvents, 1)));
    // 최소 2초, 최대 7초
    const eventDelay = Math.min(7000, baseDelay);

    return new Promise<MatchResult>((resolve) => {
      let eventIndex = 0;

      const emitNextEvent = () => {
        // 타임아웃 중이면 대기
        if (state.timeoutActive) {
          const waitTimer = setTimeout(emitNextEvent, 1000);
          const timers = this.simulationTimers.get(matchId);
          if (timers) timers.push(waitTimer);
          return;
        }

        if (eventIndex >= totalEvents) {
          // 모든 이벤트 완료 → 경기 종료
          state.status = 'finished';
          state.homeScore = result.homeScore;
          state.awayScore = result.awayScore;

          this.io.to(`match-${matchId}`).emit('gameEnd', {
            matchId,
            homeScore: result.homeScore,
            awayScore: result.awayScore,
            mvpPlayerId: result.mvpPlayerId,
            weather: result.weather,
            attendance: result.attendance,
          });

          // 라이브 상태 정리 (30초 후 삭제)
          setTimeout(() => {
            this.liveMatches.delete(matchId);
            this.simulationTimers.delete(matchId);
          }, 30000);

          resolve(result);
          return;
        }

        const logEntry = result.playLog[eventIndex];
        eventIndex++;

        // 상태 업데이트
        state.inning = logEntry.inning;
        state.half = logEntry.half;
        state.outs = logEntry.outs;
        state.runners = logEntry.runnersOn;
        state.homeScore = logEntry.scoreHome;
        state.awayScore = logEntry.scoreAway;

        // 이벤트 유형에 따라 다른 소켓 이벤트 방출
        const liveEvent: LivePlayEvent = {
          inning: logEntry.inning,
          half: logEntry.half,
          eventType: logEntry.eventType,
          description: logEntry.description,
          outs: logEntry.outs,
          scoreHome: logEntry.scoreHome,
          scoreAway: logEntry.scoreAway,
          runnersOn: logEntry.runnersOn,
          timestamp: Date.now(),
        };

        state.playLog.push(liveEvent);

        const room = `match-${matchId}`;

        switch (logEntry.eventType) {
          case '경기시작':
            this.io.to(room).emit('matchStart', liveEvent);
            break;
          case '이닝시작':
            this.io.to(room).emit('inningChange', liveEvent);
            break;
          case '투수교체':
            this.io.to(room).emit('pitcherChange', liveEvent);
            break;
          case '대타':
            this.io.to(room).emit('pinchHitter', liveEvent);
            break;
          case '경기종료':
          case '끝내기':
            this.io.to(room).emit('gameEnd', {
              ...liveEvent,
              homeScore: result.homeScore,
              awayScore: result.awayScore,
              mvpPlayerId: result.mvpPlayerId,
            });
            break;
          default:
            // 타석 결과: 안타, 홈런, 삼진, 볼넷, 아웃 등
            this.io.to(room).emit('atBat', liveEvent);
            break;
        }

        // 이벤트 유형에 따라 딜레이 차별화
        let delay = eventDelay;
        if (logEntry.eventType === '이닝시작') {
          delay = eventDelay + 2000; // 이닝 전환은 좀 더 길게
        } else if (logEntry.eventType === '홈런') {
          delay = eventDelay + 3000; // 홈런은 여운을 위해 좀 더 길게
        } else if (logEntry.eventType === '경기시작') {
          delay = 3000; // 경기 시작은 짧게
        } else if (logEntry.eventType === '투수교체' || logEntry.eventType === '대타') {
          delay = eventDelay + 1500; // 교체 이벤트
        }

        const timer = setTimeout(emitNextEvent, delay);
        const timers = this.simulationTimers.get(matchId);
        if (timers) timers.push(timer);
      };

      // 첫 이벤트 시작 (2초 후)
      const startTimer = setTimeout(emitNextEvent, 2000);
      const timers = this.simulationTimers.get(matchId);
      if (timers) timers.push(startTimer);
    });
  }

  // =============================================
  // 경기 강제 종료 (서버 셧다운 등)
  // =============================================

  cancelMatch(matchId: number) {
    const timers = this.simulationTimers.get(matchId);
    if (timers) {
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
    }
    this.liveMatches.delete(matchId);
    this.simulationTimers.delete(matchId);
    this.io.to(`match-${matchId}`).emit('matchCancelled', { matchId });
  }

  // =============================================
  // 진행 중인 경기 확인
  // =============================================

  isMatchLive(matchId: number): boolean {
    return this.liveMatches.has(matchId);
  }

  getLiveState(matchId: number): LiveMatchState | undefined {
    return this.liveMatches.get(matchId);
  }

  getLiveMatchCount(): number {
    return this.liveMatches.size;
  }

  // =============================================
  // 모든 라이브 경기 정리 (서버 종료 시)
  // =============================================

  cleanup() {
    for (const [matchId] of this.liveMatches) {
      this.cancelMatch(matchId);
    }
  }
}
