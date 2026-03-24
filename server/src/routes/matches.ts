import { Router, Response } from 'express';
import pool from '../database/db';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';
import { simulateMatch } from '../services/matchEngine';

const router = Router();

// 전체 일정 조회
router.get('/schedule', async (req, res) => {
  try {
    const { seasonId, tournamentId, teamId, status, limit } = req.query;
    let query = `
      SELECT m.*, ht.name as home_name, at.name as away_name,
             t.name as tournament_name, t.type as tournament_type
      FROM matches m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      LEFT JOIN tournaments t ON m.tournament_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (seasonId) { params.push(seasonId); query += ` AND m.season_id = $${params.length}`; }
    if (tournamentId) { params.push(tournamentId); query += ` AND m.tournament_id = $${params.length}`; }
    if (teamId) { params.push(teamId); query += ` AND (m.home_team_id = $${params.length} OR m.away_team_id = $${params.length})`; }
    if (status) { params.push(status); query += ` AND m.status = $${params.length}`; }

    query += ' ORDER BY m.match_date ASC';
    if (limit) { params.push(parseInt(limit as string)); query += ` LIMIT $${params.length}`; }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 경기 상세 결과
router.get('/:id', async (req, res) => {
  try {
    const match = await pool.query(
      `SELECT m.*, ht.name as home_name, at.name as away_name,
              t.name as tournament_name
       FROM matches m
       JOIN teams ht ON m.home_team_id = ht.id
       JOIN teams at ON m.away_team_id = at.id
       LEFT JOIN tournaments t ON m.tournament_id = t.id
       WHERE m.id = $1`,
      [req.params.id]
    );

    if (match.rows.length === 0) return res.status(404).json({ error: '경기 없음' });

    const innings = await pool.query(
      'SELECT * FROM match_innings WHERE match_id = $1 ORDER BY inning, half',
      [req.params.id]
    );

    const battingStats = await pool.query(
      `SELECT mbs.*, p.name as player_name, p.position
       FROM match_batting_stats mbs
       JOIN players p ON mbs.player_id = p.id
       WHERE mbs.match_id = $1
       ORDER BY mbs.team_id, mbs.batting_order`,
      [req.params.id]
    );

    const pitchingStats = await pool.query(
      `SELECT mps.*, p.name as player_name
       FROM match_pitching_stats mps
       JOIN players p ON mps.player_id = p.id
       WHERE mps.match_id = $1`,
      [req.params.id]
    );

    // 실시간 로그
    const playLog = await pool.query(
      'SELECT * FROM match_play_log WHERE match_id = $1 ORDER BY id',
      [req.params.id]
    );

    res.json({
      ...match.rows[0],
      innings: innings.rows,
      batting_stats: battingStats.rows,
      pitching_stats: pitchingStats.rows,
      play_log: playLog.rows
    });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 경기 시뮬레이션 실행 (관리자)
router.post('/:id/simulate', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const matchId = parseInt(req.params.id);

    const match = await pool.query('SELECT status FROM matches WHERE id = $1', [matchId]);
    if (match.rows.length === 0) return res.status(404).json({ error: '경기 없음' });
    if (match.rows[0].status !== '예정') return res.status(400).json({ error: '이미 진행/완료된 경기입니다' });

    await pool.query("UPDATE matches SET status = '진행중' WHERE id = $1", [matchId]);

    const result = await simulateMatch(matchId);

    res.json({
      message: '경기 시뮬레이션 완료',
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      inningsData: result.inningsData,
      events: result.events,
      attendance: result.attendance,
      weather: result.weather,
      playLogCount: result.playLog.length
    });
  } catch (error) {
    console.error('시뮬레이션 에러:', error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 대회 순위표
router.get('/tournament/:tournamentId/standings', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tt.*, t.name as team_name, l.name as league_name,
              CASE WHEN (tt.wins + tt.losses) > 0
                THEN ROUND(tt.wins::numeric / (tt.wins + tt.losses), 3)
                ELSE 0 END as win_rate
       FROM tournament_teams tt
       JOIN teams t ON tt.team_id = t.id
       LEFT JOIN leagues l ON t.league_id = l.id
       WHERE tt.tournament_id = $1
       ORDER BY win_rate DESC, tt.wins DESC, (tt.runs_scored - tt.runs_allowed) DESC`,
      [req.params.tournamentId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 대회 목록
router.get('/tournaments/list', async (req, res) => {
  try {
    const { seasonId } = req.query;
    let query = 'SELECT * FROM tournaments';
    const params: any[] = [];
    if (seasonId) {
      params.push(seasonId);
      query += ' WHERE season_id = $1';
    }
    query += ' ORDER BY started_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

export default router;
