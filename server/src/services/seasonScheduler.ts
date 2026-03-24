import pool from '../database/db';
import {
  generateLeagueSchedule,
  generateARCup,
  generateNationalCup,
  generateNationalKnockout,
  distributePrizes,
  processOffseason,
  generateFreshmen,
} from './seasonManager';
import { RealtimeMatchService } from './realtimeMatch';

// =============================================
// 시즌 페이즈 순서 및 기간 설정
// =============================================

const PHASE_ORDER: string[] = ['봄리그', 'AR상단배', '여름리그', '마전국기', '오프시즌'];

// 각 페이즈 지속 시간 (밀리초)
const PHASE_DURATION: Record<string, number> = {
  '봄리그': 2 * 24 * 60 * 60 * 1000,      // 2일
  'AR상단배': 2 * 24 * 60 * 60 * 1000,     // 2일
  '여름리그': 2 * 24 * 60 * 60 * 1000,     // 2일
  '마전국기': 2 * 24 * 60 * 60 * 1000,     // 2일
  '오프시즌': 12 * 60 * 60 * 1000,          // 12시간
};

// 시간당 동시 진행 경기 수
const MATCHES_PER_HOUR = 4;

// =============================================
// 시즌 스케줄러
// =============================================

export class SeasonScheduler {
  private hourlyTimer: NodeJS.Timeout | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private realtimeService: RealtimeMatchService | null = null;
  private isRunning: boolean = false;

  setRealtimeService(service: RealtimeMatchService) {
    this.realtimeService = service;
  }

  // =============================================
  // 서버 시작 시 호출
  // =============================================

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[시즌스케줄러] 시작...');

    try {
      // 현재 활성 시즌 확인
      const activeSeason = await pool.query(
        'SELECT id, current_phase, started_at FROM seasons WHERE is_active = TRUE ORDER BY id DESC LIMIT 1'
      );

      if (activeSeason.rows.length === 0) {
        // 활성 시즌 없으면 새 시즌 생성
        console.log('[시즌스케줄러] 활성 시즌이 없습니다. 새 시즌을 생성합니다.');
        await this.createNewSeason();
      } else {
        const season = activeSeason.rows[0];
        console.log(`[시즌스케줄러] 현재 시즌 #${season.id}, 페이즈: ${season.current_phase}`);
        await this.resumeSeason(season.id, season.current_phase);
      }
    } catch (error) {
      console.error('[시즌스케줄러] 시작 실패:', error);
    }
  }

  // =============================================
  // 새 시즌 생성
  // =============================================

  private async createNewSeason() {
    // 이전 시즌 비활성화
    await pool.query('UPDATE seasons SET is_active = FALSE WHERE is_active = TRUE');

    // 현재 연도 기반 시즌 생성
    const year = new Date().getFullYear();
    const result = await pool.query(
      `INSERT INTO seasons (year, current_phase, is_active, started_at)
       VALUES ($1, '봄리그', TRUE, NOW()) RETURNING id`,
      [year]
    );
    const seasonId = result.rows[0].id;
    console.log(`[시즌스케줄러] 새 시즌 #${seasonId} (${year}년) 생성 완료`);

    // 봄리그부터 시작
    await this.startPhase(seasonId, '봄리그');
  }

  // =============================================
  // 시즌 재개 (서버 재시작 시)
  // =============================================

  private async resumeSeason(seasonId: number, currentPhase: string) {
    console.log(`[시즌스케줄러] 시즌 #${seasonId} 재개, 현재 페이즈: ${currentPhase}`);

    if (currentPhase === '오프시즌') {
      // 오프시즌이면 남은 시간 계산 후 새 시즌 대기
      await this.handleOffseasonResume(seasonId);
      return;
    }

    // 해당 페이즈의 미완료 경기가 있는지 확인
    const pendingMatches = currentPhase === '마전국기'
      ? await pool.query(
          `SELECT COUNT(*) as cnt FROM matches m
           JOIN tournaments t ON m.tournament_id = t.id
           WHERE m.season_id = $1 AND t.type = '마전국기' AND m.status = '예정'`,
          [seasonId]
        )
      : await pool.query(
          `SELECT COUNT(*) as cnt FROM matches
           WHERE season_id = $1 AND stage LIKE $2 AND status = '예정'`,
          [seasonId, `%${this.getStagePattern(currentPhase)}%`]
        );

    const pendingCount = parseInt(pendingMatches.rows[0].cnt);

    if (pendingCount > 0) {
      console.log(`[시즌스케줄러] 미완료 경기 ${pendingCount}개 발견. 매시간 경기 진행을 재개합니다.`);
      this.startHourlySchedule(seasonId, currentPhase);
    } else {
      // 미완료 경기 없으면 다음 페이즈로 진행
      console.log(`[시즌스케줄러] ${currentPhase}의 모든 경기가 완료되었습니다.`);
      await this.advancePhase(seasonId);
    }
  }

  // =============================================
  // 페이즈 시작
  // =============================================

  private async startPhase(seasonId: number, phase: string) {
    console.log(`[시즌스케줄러] 페이즈 시작: ${phase}`);

    // DB 업데이트
    await pool.query('UPDATE seasons SET current_phase = $1 WHERE id = $2', [phase, seasonId]);

    if (phase === '오프시즌') {
      await this.handleOffseason(seasonId);
      return;
    }

    // 일정 생성
    await this.schedulePhase(seasonId, phase);

    // 매시간 경기 진행 스케줄링
    this.startHourlySchedule(seasonId, phase);
  }

  // =============================================
  // 페이즈별 경기 일정 생성
  // =============================================

  async schedulePhase(seasonId: number, phase: string) {
    console.log(`[시즌스케줄러] ${phase} 일정 생성 중...`);

    switch (phase) {
      case '봄리그':
        await generateLeagueSchedule(seasonId, '봄리그');
        break;

      case 'AR상단배':
        await generateARCup(seasonId);
        break;

      case '여름리그':
        await generateLeagueSchedule(seasonId, '여름리그');
        break;

      case '마전국기':
        await generateNationalCup(seasonId);
        break;
    }

    // 생성된 경기를 2일에 걸쳐 분배
    await this.distributeMatchesAcrossTime(seasonId, phase);

    const matchCount = phase === '마전국기'
      ? await pool.query(
          `SELECT COUNT(*) as cnt FROM matches m
           JOIN tournaments t ON m.tournament_id = t.id
           WHERE m.season_id = $1 AND t.type = '마전국기' AND m.status = '예정'`,
          [seasonId]
        )
      : await pool.query(
          `SELECT COUNT(*) as cnt FROM matches
           WHERE season_id = $1 AND status = '예정'
           AND stage LIKE $2`,
          [seasonId, `%${this.getStagePattern(phase)}%`]
        );
    console.log(`[시즌스케줄러] ${phase} 총 ${matchCount.rows[0].cnt}경기 일정 생성 완료`);
  }

  // =============================================
  // 경기를 2일에 걸쳐 시간대별로 분배
  // =============================================

  private async distributeMatchesAcrossTime(seasonId: number, phase: string) {
    // 해당 페이즈의 모든 예정 경기 조회 (팀 정보 포함)
    const matches = phase === '마전국기'
      ? await pool.query(
          `SELECT m.id, m.home_team_id, m.away_team_id FROM matches m
           JOIN tournaments t ON m.tournament_id = t.id
           WHERE m.season_id = $1 AND t.type = '마전국기' AND m.status = '예정'
           ORDER BY m.id`,
          [seasonId]
        )
      : await pool.query(
          `SELECT id, home_team_id, away_team_id FROM matches
           WHERE season_id = $1 AND status = '예정'
           AND stage LIKE $2
           ORDER BY id`,
          [seasonId, `%${this.getStagePattern(phase)}%`]
        );

    if (matches.rows.length === 0) return;

    const totalMatches = matches.rows.length;
    const activeHoursPerDay = 14; // 09:00 ~ 23:00
    const totalActiveHours = activeHoursPerDay * 2; // 2일

    const now = new Date();
    const startTime = new Date(now);
    startTime.setMinutes(0, 0, 0);
    if (startTime <= now) {
      startTime.setHours(startTime.getHours() + 1);
    }
    if (startTime.getHours() < 9) {
      startTime.setHours(9, 0, 0, 0);
    }

    // 시간대별 슬롯 생성
    const timeSlots: Date[] = [];
    let slotTime = new Date(startTime);
    for (let h = 0; h < totalActiveHours; h++) {
      if (slotTime.getHours() >= 23) {
        slotTime.setDate(slotTime.getDate() + 1);
        slotTime.setHours(9, 0, 0, 0);
      }
      timeSlots.push(new Date(slotTime));
      slotTime = new Date(slotTime.getTime() + 60 * 60 * 1000);
    }

    // 각 시간대에 배정된 팀 추적 (팀 충돌 방지)
    const slotTeams: Map<number, Set<number>> = new Map();
    timeSlots.forEach((_, i) => slotTeams.set(i, new Set()));

    // 미배정 경기 목록
    const unassigned = [...matches.rows];
    const assignments: { matchId: number; slotIndex: number }[] = [];

    // 라운드 로빈 방식으로 경기 배정 (팀 충돌 없이)
    let slotIdx = 0;
    let retries = 0;
    const maxRetries = totalMatches * totalActiveHours;

    while (unassigned.length > 0 && retries < maxRetries) {
      const match = unassigned[0];
      const teams = slotTeams.get(slotIdx)!;

      // 이 시간대에 해당 팀이 이미 경기가 있는지 확인
      if (!teams.has(match.home_team_id) && !teams.has(match.away_team_id)) {
        // 배정 가능
        teams.add(match.home_team_id);
        teams.add(match.away_team_id);
        assignments.push({ matchId: match.id, slotIndex: slotIdx });
        unassigned.shift();
        retries = 0;
      } else {
        retries++;
      }

      // 다음 슬롯으로 (순환)
      slotIdx = (slotIdx + 1) % timeSlots.length;
    }

    // 혹시 남은 경기가 있으면 강제 배정 (어쩔 수 없는 경우)
    for (const match of unassigned) {
      assignments.push({ matchId: match.id, slotIndex: slotIdx % timeSlots.length });
      slotIdx++;
    }

    // DB 업데이트
    for (const { matchId, slotIndex } of assignments) {
      await pool.query(
        'UPDATE matches SET match_date = $1 WHERE id = $2',
        [timeSlots[slotIndex], matchId]
      );
    }

    const maxPerSlot = Math.max(...Array.from(slotTeams.values()).map(s => s.size / 2));
    console.log(`[시즌스케줄러] ${totalMatches}경기를 시간대별로 분배 완료 (시간당 최대 ${Math.ceil(maxPerSlot)}경기, 팀 충돌 없음)`);
  }

  // =============================================
  // 매시간 경기 진행 스케줄
  // =============================================

  private startHourlySchedule(seasonId: number, phase: string) {
    // 기존 타이머 정리
    this.stopTimers();

    // 즉시 현재 시간대 경기 확인
    this.runHourlyMatches(seasonId, phase);

    // 다음 정시까지 대기 후 매시간 반복
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const msUntilNextHour = nextHour.getTime() - now.getTime();

    console.log(`[시즌스케줄러] 다음 경기 체크: ${nextHour.toLocaleTimeString('ko-KR')} (${Math.round(msUntilNextHour / 1000)}초 후)`);

    this.phaseTimer = setTimeout(() => {
      // 첫 정시 실행
      this.runHourlyMatches(seasonId, phase);

      // 이후 매시간 반복
      this.hourlyTimer = setInterval(() => {
        this.runHourlyMatches(seasonId, phase);
      }, 60 * 60 * 1000); // 1시간
    }, msUntilNextHour);
  }

  // =============================================
  // 매시간 경기 시뮬레이션 실행
  // =============================================

  async runHourlyMatches(seasonId: number, phase: string) {
    try {
      const now = new Date();
      const currentHourStart = new Date(now);
      currentHourStart.setMinutes(0, 0, 0);
      const currentHourEnd = new Date(currentHourStart.getTime() + 60 * 60 * 1000);

      console.log(`[시즌스케줄러] ${currentHourStart.toLocaleTimeString('ko-KR')} 경기 시작 체크`);

      // 현재 시간대에 예정된 경기 조회
      const matches = await pool.query(
        `SELECT id FROM matches
         WHERE season_id = $1 AND status = '예정'
         AND match_date >= $2 AND match_date < $3
         ORDER BY match_date
         LIMIT $4`,
        [seasonId, currentHourStart, currentHourEnd, MATCHES_PER_HOUR]
      );

      // 추가로 과거에 놓친 경기도 처리 (서버 재시작 등의 이유로)
      const missedMatches = await pool.query(
        `SELECT id FROM matches
         WHERE season_id = $1 AND status = '예정'
         AND match_date < $2
         ORDER BY match_date
         LIMIT $3`,
        [seasonId, currentHourStart, MATCHES_PER_HOUR]
      );

      const allMatchIds: number[] = [
        ...missedMatches.rows.map((r: any) => r.id),
        ...matches.rows.map((r: any) => r.id),
      ];

      // 중복 제거
      const uniqueMatchIds = [...new Set(allMatchIds)].slice(0, MATCHES_PER_HOUR);

      if (uniqueMatchIds.length === 0) {
        console.log(`[시즌스케줄러] 현재 시간대에 예정된 경기 없음`);
        await this.checkPhaseCompletion(seasonId, phase);
        return;
      }

      console.log(`[시즌스케줄러] ${uniqueMatchIds.length}경기 시뮬레이션 시작:`, uniqueMatchIds);

      // 경기들을 동시에 시작 (각각 약 10분 소요)
      const simulationPromises = uniqueMatchIds.map(matchId =>
        this.simulateSingleMatch(matchId)
      );

      // 모든 경기 완료 대기
      await Promise.allSettled(simulationPromises);

      console.log(`[시즌스케줄러] ${uniqueMatchIds.length}경기 시뮬레이션 완료`);

      // 페이즈 완료 확인
      await this.checkPhaseCompletion(seasonId, phase);
    } catch (error) {
      console.error('[시즌스케줄러] 경기 시뮬레이션 중 오류:', error);
    }
  }

  // =============================================
  // 단일 경기 시뮬레이션
  // =============================================

  private async simulateSingleMatch(matchId: number): Promise<void> {
    try {
      if (this.realtimeService) {
        // 실시간 서비스가 있으면 실시간 시뮬레이션 (이벤트 브로드캐스트)
        console.log(`[시즌스케줄러] 경기 #${matchId} 실시간 시뮬레이션 시작`);
        await this.realtimeService.simulateMatchRealtime(matchId);
      } else {
        // 실시간 서비스 없으면 즉시 시뮬레이션
        console.log(`[시즌스케줄러] 경기 #${matchId} 즉시 시뮬레이션`);
        const { simulateMatch } = await import('./matchEngine');
        await simulateMatch(matchId);
      }
      console.log(`[시즌스케줄러] 경기 #${matchId} 완료`);
    } catch (error) {
      console.error(`[시즌스케줄러] 경기 #${matchId} 시뮬레이션 실패:`, error);
      // 실패한 경기는 취소 처리
      await pool.query("UPDATE matches SET status = '취소' WHERE id = $1", [matchId]);
    }
  }

  // =============================================
  // 페이즈 완료 확인
  // =============================================

  private async checkPhaseCompletion(seasonId: number, phase: string) {
    const remaining = phase === '마전국기'
      ? await pool.query(
          `SELECT COUNT(*) as cnt FROM matches m
           JOIN tournaments t ON m.tournament_id = t.id
           WHERE m.season_id = $1 AND t.type = '마전국기' AND m.status = '예정'`,
          [seasonId]
        )
      : await pool.query(
          `SELECT COUNT(*) as cnt FROM matches
           WHERE season_id = $1 AND status = '예정'
           AND stage LIKE $2`,
          [seasonId, `%${this.getStagePattern(phase)}%`]
        );

    const remainingCount = parseInt(remaining.rows[0].cnt);

    if (remainingCount === 0) {
      console.log(`[시즌스케줄러] ${phase} 모든 경기 완료! 다음 페이즈로 진행합니다.`);
      this.stopTimers();

      // 마전국기의 경우 조별리그 후 8강 토너먼트 처리
      if (phase === '마전국기') {
        await this.handleNationalCupKnockout(seasonId);
      } else {
        await this.finishPhaseAndAdvance(seasonId, phase);
      }
    } else {
      console.log(`[시즌스케줄러] ${phase} 잔여 경기: ${remainingCount}개`);
    }
  }

  // =============================================
  // 마전국기 8강 토너먼트 처리
  // =============================================

  private async handleNationalCupKnockout(seasonId: number) {
    // 마전국기 토너먼트 ID 조회
    const tournament = await pool.query(
      `SELECT id FROM tournaments WHERE season_id = $1 AND type = '마전국기' ORDER BY id DESC LIMIT 1`,
      [seasonId]
    );

    if (tournament.rows.length === 0) {
      console.log('[시즌스케줄러] 마전국기 토너먼트를 찾을 수 없습니다.');
      await this.advancePhase(seasonId);
      return;
    }

    const tournamentId = tournament.rows[0].id;

    // 8강 경기가 이미 생성되었는지 확인
    const knockoutMatches = await pool.query(
      `SELECT COUNT(*) as cnt FROM matches WHERE tournament_id = $1 AND stage = '8강'`,
      [tournamentId]
    );

    if (parseInt(knockoutMatches.rows[0].cnt) === 0) {
      // 8강 대진 생성
      console.log('[시즌스케줄러] 마전국기 8강 대진 생성');
      await generateNationalKnockout(tournamentId);

      // 8강 경기 시간 분배
      await this.distributeKnockoutMatches(seasonId, tournamentId, '8강');

      // 8강 경기 스케줄링
      this.startHourlySchedule(seasonId, '마전국기');
      return;
    }

    // 8강이 모두 끝났는지 확인
    const pending8 = await pool.query(
      `SELECT COUNT(*) as cnt FROM matches WHERE tournament_id = $1 AND stage = '8강' AND status = '예정'`,
      [tournamentId]
    );

    if (parseInt(pending8.rows[0].cnt) > 0) {
      // 아직 8강 진행 중
      this.startHourlySchedule(seasonId, '마전국기');
      return;
    }

    // 4강 경기가 있는지 확인
    const semiMatches = await pool.query(
      `SELECT COUNT(*) as cnt FROM matches WHERE tournament_id = $1 AND stage = '4강'`,
      [tournamentId]
    );

    if (parseInt(semiMatches.rows[0].cnt) === 0) {
      // 4강 대진 생성
      await this.generateSemiFinals(seasonId, tournamentId);
      this.startHourlySchedule(seasonId, '마전국기');
      return;
    }

    // 4강 완료 확인
    const pendingSemi = await pool.query(
      `SELECT COUNT(*) as cnt FROM matches WHERE tournament_id = $1 AND stage = '4강' AND status = '예정'`,
      [tournamentId]
    );

    if (parseInt(pendingSemi.rows[0].cnt) > 0) {
      this.startHourlySchedule(seasonId, '마전국기');
      return;
    }

    // 결승전 확인
    const finalMatches = await pool.query(
      `SELECT COUNT(*) as cnt FROM matches WHERE tournament_id = $1 AND stage = '결승'`,
      [tournamentId]
    );

    if (parseInt(finalMatches.rows[0].cnt) === 0) {
      await this.generateFinals(seasonId, tournamentId);
      this.startHourlySchedule(seasonId, '마전국기');
      return;
    }

    // 결승 완료 확인
    const pendingFinal = await pool.query(
      `SELECT COUNT(*) as cnt FROM matches WHERE tournament_id = $1 AND stage = '결승' AND status = '예정'`,
      [tournamentId]
    );

    if (parseInt(pendingFinal.rows[0].cnt) > 0) {
      this.startHourlySchedule(seasonId, '마전국기');
      return;
    }

    // 모든 토너먼트 경기 완료
    console.log('[시즌스케줄러] 마전국기 결승전 완료!');
    await this.finishPhaseAndAdvance(seasonId, '마전국기');
  }

  // =============================================
  // 4강 대진 생성
  // =============================================

  private async generateSemiFinals(seasonId: number, tournamentId: number) {
    console.log('[시즌스케줄러] 마전국기 4강 대진 생성');

    // 8강 승자 조회
    const winners = await pool.query(
      `SELECT
        CASE WHEN home_score > away_score THEN home_team_id ELSE away_team_id END as winner_id
       FROM matches
       WHERE tournament_id = $1 AND stage = '8강' AND status = '완료'
       ORDER BY id`,
      [tournamentId]
    );

    const winnerIds = winners.rows.map((r: any) => r.winner_id);

    if (winnerIds.length < 4) {
      console.error('[시즌스케줄러] 8강 승자가 4팀 미만입니다:', winnerIds.length);
      return;
    }

    // 4강 대진: 1vs4, 2vs3
    const matchups = [
      [winnerIds[0], winnerIds[3]],
      [winnerIds[1], winnerIds[2]],
    ];

    const baseDate = new Date();
    baseDate.setHours(baseDate.getHours() + 1, 0, 0, 0);

    for (let i = 0; i < matchups.length; i++) {
      const matchDate = new Date(baseDate.getTime() + i * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO matches (tournament_id, season_id, home_team_id, away_team_id, match_date, stage)
         VALUES ($1, $2, $3, $4, $5, '4강')`,
        [tournamentId, seasonId, matchups[i][0], matchups[i][1], matchDate]
      );
    }
  }

  // =============================================
  // 결승 대진 생성
  // =============================================

  private async generateFinals(seasonId: number, tournamentId: number) {
    console.log('[시즌스케줄러] 마전국기 결승 대진 생성');

    const winners = await pool.query(
      `SELECT
        CASE WHEN home_score > away_score THEN home_team_id ELSE away_team_id END as winner_id
       FROM matches
       WHERE tournament_id = $1 AND stage = '4강' AND status = '완료'
       ORDER BY id`,
      [tournamentId]
    );

    const winnerIds = winners.rows.map((r: any) => r.winner_id);

    if (winnerIds.length < 2) {
      console.error('[시즌스케줄러] 4강 승자가 2팀 미만입니다:', winnerIds.length);
      return;
    }

    const matchDate = new Date();
    matchDate.setHours(matchDate.getHours() + 1, 0, 0, 0);

    await pool.query(
      `INSERT INTO matches (tournament_id, season_id, home_team_id, away_team_id, match_date, stage)
       VALUES ($1, $2, $3, $4, $5, '결승')`,
      [tournamentId, seasonId, winnerIds[0], winnerIds[1], matchDate]
    );
  }

  // =============================================
  // 녹아웃 경기 시간 분배
  // =============================================

  private async distributeKnockoutMatches(seasonId: number, tournamentId: number, stage: string) {
    const matches = await pool.query(
      `SELECT id FROM matches
       WHERE tournament_id = $1 AND stage = $2 AND status = '예정'
       ORDER BY id`,
      [tournamentId, stage]
    );

    const now = new Date();
    const startTime = new Date(now);
    startTime.setHours(startTime.getHours() + 1, 0, 0, 0);

    for (let i = 0; i < matches.rows.length; i++) {
      const matchDate = new Date(startTime.getTime() + i * 60 * 60 * 1000);
      await pool.query('UPDATE matches SET match_date = $1 WHERE id = $2', [matchDate, matches.rows[i].id]);
    }
  }

  // =============================================
  // 페이즈 종료 및 다음 페이즈 진행
  // =============================================

  private async finishPhaseAndAdvance(seasonId: number, phase: string) {
    // 대회 상금 분배
    const tournaments = await pool.query(
      `SELECT id FROM tournaments WHERE season_id = $1 AND type = $2`,
      [seasonId, phase === '봄리그' || phase === '여름리그' ? '리그' : phase]
    );

    for (const t of tournaments.rows) {
      try {
        await distributePrizes(t.id);
        await pool.query("UPDATE tournaments SET phase = '완료', ended_at = NOW() WHERE id = $1", [t.id]);
      } catch (error) {
        console.error(`[시즌스케줄러] 상금 분배 오류 (대회 #${t.id}):`, error);
      }
    }

    // 뉴스 생성
    await pool.query(
      `INSERT INTO game_news (title, content, category) VALUES ($1, $2, '대회')`,
      [`${phase} 종료!`, `${phase}의 모든 일정이 종료되었습니다.`]
    );

    await this.advancePhase(seasonId);
  }

  // =============================================
  // 다음 페이즈로 이동
  // =============================================

  async advancePhase(seasonId: number) {
    // 페이즈 전환 시 감독 경질 체크
    await this.checkManagerFiring(seasonId);

    const season = await pool.query('SELECT current_phase FROM seasons WHERE id = $1', [seasonId]);
    if (season.rows.length === 0) return;

    const currentPhase = season.rows[0].current_phase;
    const currentIndex = PHASE_ORDER.indexOf(currentPhase);
    const nextIndex = currentIndex + 1;

    if (nextIndex >= PHASE_ORDER.length) {
      // 시즌 종료 → 새 시즌 시작
      console.log(`[시즌스케줄러] 시즌 #${seasonId} 종료! 새 시즌을 시작합니다.`);
      await pool.query('UPDATE seasons SET is_active = FALSE WHERE id = $1', [seasonId]);
      await this.createNewSeason();
      return;
    }

    const nextPhase = PHASE_ORDER[nextIndex];
    console.log(`[시즌스케줄러] 페이즈 전환: ${currentPhase} → ${nextPhase}`);

    await this.startPhase(seasonId, nextPhase);
  }

  // =============================================
  // 오프시즌 처리
  // =============================================

  private async handleOffseason(seasonId: number) {
    console.log(`[시즌스케줄러] 오프시즌 시작 (12시간)`);

    try {
      // 졸업/신입생 처리
      await processOffseason(seasonId);

      // 모든 팀에 신입생 생성
      const teams = await pool.query('SELECT id FROM teams');
      for (const team of teams.rows) {
        await generateFreshmen(team.id, 12);
      }

      // 선수 컨디션/피로도 리셋
      await pool.query('UPDATE players SET fatigue = 0, condition = GREATEST(50, condition)');

      // 뉴스
      await pool.query(
        `INSERT INTO game_news (title, content, category)
         VALUES ('오프시즌 돌입', '모든 대회가 종료되었습니다. 12시간 후 새 시즌이 시작됩니다.', '시즌')`
      );

      console.log('[시즌스케줄러] 오프시즌 처리 완료. 12시간 후 새 시즌 시작 예약.');
    } catch (error) {
      console.error('[시즌스케줄러] 오프시즌 처리 오류:', error);
    }

    // 12시간 후 새 시즌 시작
    const offseasonDuration = PHASE_DURATION['오프시즌'];
    this.phaseTimer = setTimeout(async () => {
      console.log('[시즌스케줄러] 오프시즌 종료. 새 시즌 시작!');
      await pool.query('UPDATE seasons SET is_active = FALSE WHERE id = $1', [seasonId]);
      await this.createNewSeason();
    }, offseasonDuration);
  }

  // =============================================
  // 오프시즌 재개 (서버 재시작 시)
  // =============================================

  private async handleOffseasonResume(seasonId: number) {
    // 시즌 시작 시간 기준으로 오프시즌 남은 시간 계산
    const season = await pool.query('SELECT started_at FROM seasons WHERE id = $1', [seasonId]);
    if (season.rows.length === 0) return;

    // 현재 페이즈가 오프시즌으로 바뀐 시간 추정 (started_at + 전체 페이즈 기간)
    // 간단히 현재 시간 기준으로 12시간 대기
    const remaining = PHASE_DURATION['오프시즌'];
    console.log(`[시즌스케줄러] 오프시즌 재개. ${Math.round(remaining / 1000 / 60)}분 후 새 시즌 시작.`);

    this.phaseTimer = setTimeout(async () => {
      console.log('[시즌스케줄러] 오프시즌 종료. 새 시즌 시작!');
      await pool.query('UPDATE seasons SET is_active = FALSE WHERE id = $1', [seasonId]);
      await this.createNewSeason();
    }, remaining);
  }

  // =============================================
  // 유틸리티
  // =============================================

  private getStagePattern(phase: string): string {
    switch (phase) {
      case '봄리그': return '봄리그';
      case 'AR상단배': return 'AR상단배';
      case '여름리그': return '여름리그';
      case '마전국기': return '마전국기_ALL'; // 마전국기는 별도 처리 (조별/8강/4강/결승)
      default: return phase;
    }
  }

  // =============================================
  // 타이머 정리
  // =============================================

  private stopTimers() {
    if (this.hourlyTimer) {
      clearInterval(this.hourlyTimer);
      this.hourlyTimer = null;
    }
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  // =============================================
  // 서버 종료 시 정리
  // =============================================

  stop() {
    this.isRunning = false;
    this.stopTimers();
    console.log('[시즌스케줄러] 중지됨');
  }

  // =============================================
  // 감독 경질 체크 (페이즈 전환 시)
  // =============================================

  private async checkManagerFiring(seasonId: number) {
    try {
      // 유저가 소유한 팀들의 성적 확인
      const ownedTeams = await pool.query(
        `SELECT t.id as team_id, t.name as team_name, t.owner_id, u.username, u.reputation,
                (SELECT ROUND(AVG(
                  CASE WHEN p.is_pitcher THEN (p.velocity + p.control_stat + p.stamina + p.breaking_ball + p.mental) / 5.0
                       ELSE (p.contact + p.power + p.eye + p.speed + p.fielding) / 5.0 END
                )::numeric, 1) FROM players p WHERE p.team_id = t.id AND p.roster_status = '선발로스터') as team_overall,
                COALESCE(SUM(tt.wins), 0) as wins,
                COALESCE(SUM(tt.losses), 0) as losses
         FROM teams t
         JOIN users u ON t.owner_id = u.id
         LEFT JOIN tournament_teams tt ON t.id = tt.team_id
         LEFT JOIN tournaments tn ON tt.tournament_id = tn.id AND tn.season_id = $1
         WHERE t.owner_id IS NOT NULL AND u.role != 'admin'
         GROUP BY t.id, t.name, t.owner_id, u.username, u.reputation`,
        [seasonId]
      );

      for (const team of ownedTeams.rows) {
        const totalGames = parseInt(team.wins) + parseInt(team.losses);
        if (totalGames < 5) continue; // 최소 5경기 이상이어야 경질 판정

        const winRate = parseInt(team.wins) / totalGames;
        const teamOverall = parseFloat(team.team_overall) || 50;

        // 팀 전력 대비 기대 승률 계산
        // 전력 60 이상이면 기대 승률 0.45+, 전력 70이면 0.5+
        const expectedWinRate = Math.max(0.3, (teamOverall - 30) / 80);
        const underperformance = expectedWinRate - winRate;

        // 기대 승률보다 15% 이상 낮으면 경질 위험
        if (underperformance > 0.15) {
          // 경질 확률: 기대 대비 차이가 클수록 높음
          const fireChance = Math.min(80, Math.round(underperformance * 300));
          const roll = Math.random() * 100;

          console.log(`[경질체크] ${team.team_name} (${team.username}) - 승률: ${(winRate * 100).toFixed(1)}%, 기대: ${(expectedWinRate * 100).toFixed(1)}%, 경질확률: ${fireChance}%`);

          if (roll < fireChance) {
            // 경질!
            console.log(`[경질] ${team.username} 감독이 ${team.team_name}에서 경질되었습니다!`);

            await pool.query('UPDATE teams SET owner_id = NULL WHERE id = $1', [team.team_id]);
            await pool.query('UPDATE users SET team_id = NULL WHERE id = $1', [team.owner_id]);
            await pool.query('UPDATE users SET reputation = GREATEST(reputation - 10, 0) WHERE id = $1', [team.owner_id]);

            await pool.query(
              `INSERT INTO manager_transfers (user_id, from_team_id, to_team_id, reputation_at_transfer, season_id, reason)
               VALUES ($1, $2, NULL, $3, $4, '경질')`,
              [team.owner_id, team.team_id, team.reputation, seasonId]
            );

            await pool.query(
              `INSERT INTO game_news (title, content, category, related_team_id)
               VALUES ($1, $2, '감독이동', $3)`,
              [
                `${team.username} 감독 경질`,
                `${team.team_name}의 ${team.username} 감독이 부진한 성적으로 경질되었습니다. (승률: ${(winRate * 100).toFixed(1)}%)`,
                team.team_id
              ]
            );
          }
        }
      }
    } catch (error) {
      console.error('[시즌스케줄러] 감독 경질 체크 오류:', error);
    }
  }
}
