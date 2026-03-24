import { Router, Response } from 'express';
import pool from '../database/db';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';
import { generateLeagueSchedule, generateARCup, generateNationalCup, generateNationalKnockout, distributePrizes, processOffseason, generateFreshmen } from '../services/seasonManager';
import { dailyConditionUpdate, processGrowth } from '../services/conditionService';
import { simulateMatch } from '../services/matchEngine';

const router = Router();

router.use(authMiddleware);
router.use(adminMiddleware);

// 새 시즌 생성
router.post('/season/create', async (req: AuthRequest, res: Response) => {
  try {
    const { year } = req.body;
    const result = await pool.query(
      "INSERT INTO seasons (year, current_phase, is_active) VALUES ($1, '봄리그', TRUE) RETURNING *",
      [year]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 봄/가을 리그 일정 생성
router.post('/season/:id/generate-league', async (req: AuthRequest, res: Response) => {
  try {
    const seasonId = parseInt(req.params.id);
    const { phase } = req.body; // '봄리그' or '가을리그'
    await generateLeagueSchedule(seasonId, phase);
    res.json({ message: `${phase} 일정 생성 완료` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// AR상단배 대회 생성
router.post('/season/:id/generate-ar-cup', async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = await generateARCup(parseInt(req.params.id));
    res.json({ message: 'AR상단배 대회 생성 완료', tournamentId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 마전국기 생성
router.post('/season/:id/generate-national', async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = await generateNationalCup(parseInt(req.params.id));
    res.json({ message: '마전국기 생성 완료', tournamentId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 마전국기 8강 토너먼트 생성
router.post('/tournament/:id/knockout', async (req: AuthRequest, res: Response) => {
  try {
    const teams = await generateNationalKnockout(parseInt(req.params.id));
    res.json({ message: '8강 토너먼트 생성 완료', teams });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 상금 분배
router.post('/tournament/:id/distribute-prizes', async (req: AuthRequest, res: Response) => {
  try {
    await distributePrizes(parseInt(req.params.id));
    res.json({ message: '상금 분배 완료' });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 시즌 페이즈 변경
router.post('/season/:id/change-phase', async (req: AuthRequest, res: Response) => {
  try {
    const { phase } = req.body;
    await pool.query('UPDATE seasons SET current_phase = $1 WHERE id = $2', [phase, req.params.id]);
    res.json({ message: `시즌 페이즈 변경: ${phase}` });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 일일 처리 (컨디션 변동)
router.post('/daily-update', async (req: AuthRequest, res: Response) => {
  try {
    await dailyConditionUpdate();
    res.json({ message: '일일 컨디션 업데이트 완료' });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 전체 경기 일괄 시뮬 (특정 날짜)
router.post('/simulate-day', async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.body;
    const matches = await pool.query(
      "SELECT id FROM matches WHERE DATE(match_date) = $1 AND status = '예정'",
      [date]
    );

    const results = [];
    for (const match of matches.rows) {
      await pool.query("UPDATE matches SET status = '진행중' WHERE id = $1", [match.id]);
      const result = await simulateMatch(match.id);
      results.push({ matchId: match.id, homeScore: result.homeScore, awayScore: result.awayScore });
    }

    // 대회 순위 업데이트
    await updateTournamentStandings();

    res.json({ message: `${results.length}경기 시뮬레이션 완료`, results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 오프시즌 처리
router.post('/season/:id/offseason', async (req: AuthRequest, res: Response) => {
  try {
    await processOffseason(parseInt(req.params.id));
    await processGrowth();

    // 신입생 생성
    const teams = await pool.query('SELECT id FROM teams');
    for (const team of teams.rows) {
      await generateFreshmen(team.id, 12);
    }

    res.json({ message: '오프시즌 처리 완료 (졸업, 성장, 신입생)' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 대회 순위 업데이트
async function updateTournamentStandings() {
  const tournaments = await pool.query(
    "SELECT id FROM tournaments WHERE phase = '진행중'"
  );

  for (const t of tournaments.rows) {
    const teams = await pool.query(
      'SELECT team_id FROM tournament_teams WHERE tournament_id = $1',
      [t.id]
    );

    for (const team of teams.rows) {
      const stats = await pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE (home_team_id = $1 AND home_score > away_score) OR (away_team_id = $1 AND away_score > home_score)) as wins,
          COUNT(*) FILTER (WHERE (home_team_id = $1 AND home_score < away_score) OR (away_team_id = $1 AND away_score < home_score)) as losses,
          COALESCE(SUM(CASE WHEN home_team_id = $1 THEN home_score WHEN away_team_id = $1 THEN away_score ELSE 0 END), 0) as runs_scored,
          COALESCE(SUM(CASE WHEN home_team_id = $1 THEN away_score WHEN away_team_id = $1 THEN home_score ELSE 0 END), 0) as runs_allowed
         FROM matches
         WHERE tournament_id = $2 AND status = '완료' AND (home_team_id = $1 OR away_team_id = $1)`,
        [team.team_id, t.id]
      );

      const s = stats.rows[0];
      await pool.query(
        `UPDATE tournament_teams SET wins = $1, losses = $2, runs_scored = $3, runs_allowed = $4
         WHERE tournament_id = $5 AND team_id = $6`,
        [s.wins, s.losses, s.runs_scored, s.runs_allowed, t.id, team.team_id]
      );
    }
  }
}

// 시즌 & 스케줄 완전 초기화 (깨진 시즌 리셋)
router.post('/season/reset', async (req: AuthRequest, res: Response) => {
  try {
    // 경기 관련 데이터 삭제 (CASCADE로 FK 제약 무시)
    await pool.query('TRUNCATE match_play_log, match_batting_stats, match_pitching_stats, match_innings, pitcher_pitch_counts, tournament_teams, matches, tournaments, seasons, season_batting_stats, season_pitching_stats CASCADE');

    // 팀 사기/화학 리셋
    await pool.query('UPDATE teams SET morale = 50, chemistry = 50');

    // 선수 피로도/컨디션 리셋
    await pool.query('UPDATE players SET fatigue = 0, condition = 70');

    // 시즌 스케줄러 재시작 (app에 저장된 인스턴스 사용)
    const seasonScheduler = req.app.get('seasonScheduler');
    if (seasonScheduler) {
      seasonScheduler.stop();
      await seasonScheduler.start();
    }

    res.json({ message: '시즌 완전 초기화 완료. 새 시즌이 자동 시작됩니다.' });
  } catch (error) {
    console.error('시즌 리셋 오류:', error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 선수 직접 수정 (어드민)
router.put('/player/:id', async (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.params.id;
    const updates = req.body;
    const allowed = ['name', 'position', 'contact', 'power', 'eye', 'speed', 'clutch',
      'fielding', 'arm_strength', 'arm_accuracy', 'reaction', 'velocity', 'control_stat',
      'stamina', 'breaking_ball', 'mental', 'condition', 'fatigue', 'potential',
      'is_injured', 'injury_type', 'injury_days_left', 'roster_status', 'batting_order'];

    const setClauses: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        values.push(value);
        setClauses.push(`${key} = $${values.length}`);
      }
    }

    if (setClauses.length === 0) return res.status(400).json({ error: '수정할 항목 없음' });

    values.push(playerId);
    await pool.query(
      `UPDATE players SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
      values
    );

    res.json({ message: '선수 정보 수정 완료' });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 팀 예산 조정
router.post('/team/:id/budget', async (req: AuthRequest, res: Response) => {
  try {
    const { amount, description } = req.body;
    const teamId = req.params.id;

    await pool.query('UPDATE teams SET budget = budget + $1 WHERE id = $2', [amount, teamId]);
    await pool.query(
      `INSERT INTO financial_transactions (team_id, type, amount, description)
       VALUES ($1, $2, $3, $4)`,
      [teamId, amount > 0 ? '기타수입' : '기타지출', amount, description || '관리자 조정']
    );

    res.json({ message: '예산 조정 완료' });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 전체 유저 조회
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.role, u.team_id, u.reputation, u.created_at, u.last_login, u.ip_address,
              t.name as team_name
       FROM users u
       LEFT JOIN teams t ON u.team_id = t.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 연습경기 생성 및 즉시 시뮬레이션
router.post('/friendly-match', async (req: AuthRequest, res: Response) => {
  try {
    const { homeTeamId, awayTeamId } = req.body;
    if (!homeTeamId || !awayTeamId) return res.status(400).json({ error: '홈/원정 팀을 선택하세요' });
    if (homeTeamId === awayTeamId) return res.status(400).json({ error: '같은 팀끼리는 불가' });

    // 현재 활성 시즌 가져오기
    const season = await pool.query('SELECT id FROM seasons WHERE is_active = TRUE ORDER BY id DESC LIMIT 1');
    const seasonId = season.rows.length > 0 ? season.rows[0].id : null;

    // 연습경기 생성 (tournament_id 없이)
    const match = await pool.query(
      `INSERT INTO matches (season_id, home_team_id, away_team_id, match_date, status, round, phase)
       VALUES ($1, $2, $3, NOW(), '진행중', '연습경기', '연습경기') RETURNING id`,
      [seasonId, homeTeamId, awayTeamId]
    );
    const matchId = match.rows[0].id;

    // 즉시 시뮬레이션
    const result = await simulateMatch(matchId);

    const homeTeam = await pool.query('SELECT name FROM teams WHERE id = $1', [homeTeamId]);
    const awayTeam = await pool.query('SELECT name FROM teams WHERE id = $1', [awayTeamId]);

    res.json({
      message: `연습경기 완료! ${homeTeam.rows[0].name} ${result.homeScore} - ${result.awayScore} ${awayTeam.rows[0].name}`,
      matchId,
      homeScore: result.homeScore,
      awayScore: result.awayScore
    });
  } catch (error) {
    console.error('연습경기 에러:', error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 전체 팀 목록 (연습경기 팀 선택용)
router.get('/teams-list', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT id, name, league_id FROM teams ORDER BY league_id, name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 뉴스 조회
router.get('/news', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT gn.*, t.name as team_name
       FROM game_news gn
       LEFT JOIN teams t ON gn.related_team_id = t.id
       ORDER BY gn.created_at DESC
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

export default router;
