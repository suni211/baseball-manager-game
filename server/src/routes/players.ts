import { Router, Response } from 'express';
import pool from '../database/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// 팀 로스터 조회
router.get('/team/:teamId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*,
        COALESCE(
          (SELECT json_agg(json_build_object('skill_name', ps.skill_name, 'skill_type', ps.skill_type, 'description', ps.description, 'effect_stat', ps.effect_stat, 'effect_value', ps.effect_value))
           FROM player_skills ps WHERE ps.player_id = p.id AND ps.is_active = TRUE), '[]'
        ) as skills,
        COALESCE(
          (SELECT json_agg(json_build_object('pitch_type', pp.pitch_type, 'level', pp.level))
           FROM pitcher_pitches pp WHERE pp.player_id = p.id), '[]'
        ) as pitches
       FROM players p
       WHERE p.team_id = $1
       ORDER BY p.roster_status DESC, p.position, p.grade DESC`,
      [req.params.teamId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 선수 상세
router.get('/:id', async (req, res) => {
  try {
    const player = await pool.query(
      `SELECT p.*, t.name as team_name FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.id = $1`,
      [req.params.id]
    );
    if (player.rows.length === 0) return res.status(404).json({ error: '선수 없음' });

    const [pitches, skills, battingStats, pitchingStats, injuries, pitchCounts] = await Promise.all([
      pool.query('SELECT pitch_type, level FROM pitcher_pitches WHERE player_id = $1', [req.params.id]),
      pool.query('SELECT * FROM player_skills WHERE player_id = $1', [req.params.id]),
      pool.query(`SELECT sbs.*, s.year FROM season_batting_stats sbs JOIN seasons s ON sbs.season_id = s.id WHERE sbs.player_id = $1 ORDER BY s.year DESC`, [req.params.id]),
      pool.query(`SELECT sps.*, s.year FROM season_pitching_stats sps JOIN seasons s ON sps.season_id = s.id WHERE sps.player_id = $1 ORDER BY s.year DESC`, [req.params.id]),
      pool.query('SELECT * FROM injury_history WHERE player_id = $1 ORDER BY occurred_at DESC LIMIT 10', [req.params.id]),
      pool.query('SELECT pitches_thrown, match_date, rest_required_until FROM pitcher_pitch_counts WHERE player_id = $1 ORDER BY match_date DESC LIMIT 5', [req.params.id])
    ]);

    res.json({
      ...player.rows[0], pitches: pitches.rows, skills: skills.rows,
      batting_stats: battingStats.rows, pitching_stats: pitchingStats.rows,
      injury_history: injuries.rows, recent_pitch_counts: pitchCounts.rows
    });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 리그 종합 타격 랭킹
router.get('/stats/batting-leaders', async (req, res) => {
  try {
    const { seasonId, sort = 'batting_avg', limit = '20' } = req.query;

    const allowedSorts: Record<string, string> = {
      batting_avg: 'sbs.batting_avg', home_runs: 'sbs.home_runs', rbi: 'sbs.rbi',
      hits: 'sbs.hits', runs: 'sbs.runs', stolen_bases: 'sbs.stolen_bases',
      obp: 'sbs.obp', slg: 'sbs.slg', ops: 'sbs.ops', doubles: 'sbs.doubles',
      triples: 'sbs.triples', walks: 'sbs.walks', strikeouts: 'sbs.strikeouts'
    };
    const orderCol = allowedSorts[sort as string] || 'sbs.batting_avg';

    let query = `
      SELECT sbs.*, p.name as player_name, p.position, p.grade,
             t.name as team_name, s.year
      FROM season_batting_stats sbs
      JOIN players p ON sbs.player_id = p.id
      JOIN teams t ON sbs.team_id = t.id
      JOIN seasons s ON sbs.season_id = s.id
      WHERE sbs.at_bats >= 10
    `;
    const params: any[] = [];
    if (seasonId) {
      params.push(seasonId);
      query += ` AND sbs.season_id = $${params.length}`;
    } else {
      query += ` AND s.is_active = TRUE`;
    }
    query += ` ORDER BY ${orderCol} DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit as string));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 리그 종합 투구 랭킹
router.get('/stats/pitching-leaders', async (req, res) => {
  try {
    const { seasonId, sort = 'era', limit = '20' } = req.query;

    const allowedSorts: Record<string, string> = {
      era: 'sps.era', wins: 'sps.wins', saves: 'sps.saves',
      strikeouts_pitched: 'sps.strikeouts_pitched', whip: 'sps.whip',
      innings_pitched: 'sps.innings_pitched'
    };
    const orderCol = allowedSorts[sort as string] || 'sps.era';
    const orderDir = sort === 'era' || sort === 'whip' ? 'ASC' : 'DESC';

    let query = `
      SELECT sps.*, p.name as player_name, p.position, p.pitcher_role, p.grade,
             t.name as team_name, s.year
      FROM season_pitching_stats sps
      JOIN players p ON sps.player_id = p.id
      JOIN teams t ON sps.team_id = t.id
      JOIN seasons s ON sps.season_id = s.id
      WHERE sps.innings_pitched >= 3
    `;
    const params: any[] = [];
    if (seasonId) {
      params.push(seasonId);
      query += ` AND sps.season_id = $${params.length}`;
    } else {
      query += ` AND s.is_active = TRUE`;
    }
    query += ` ORDER BY ${orderCol} ${orderDir} LIMIT $${params.length + 1}`;
    params.push(parseInt(limit as string));

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 선발 로스터 설정 (23명)
router.post('/roster', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { playerIds } = req.body;
    const teamId = req.user!.teamId;
    if (!teamId) return res.status(400).json({ error: '팀을 먼저 선택하세요' });
    if (!Array.isArray(playerIds) || playerIds.length !== 23) return res.status(400).json({ error: '선발 로스터는 정확히 23명' });

    const pitcherCheck = await pool.query('SELECT COUNT(*) FROM players WHERE id = ANY($1) AND is_pitcher = TRUE', [playerIds]);
    if (parseInt(pitcherCheck.rows[0].count) < 3) return res.status(400).json({ error: '투수 최소 3명 필요' });

    const teamCheck = await pool.query('SELECT COUNT(*) FROM players WHERE id = ANY($1) AND team_id = $2', [playerIds, teamId]);
    if (parseInt(teamCheck.rows[0].count) !== 23) return res.status(400).json({ error: '다른 팀 선수 포함' });

    const injuredCheck = await pool.query('SELECT name FROM players WHERE id = ANY($1) AND is_injured = TRUE', [playerIds]);
    if (injuredCheck.rows.length > 0) return res.status(400).json({ error: `부상 선수 포함: ${injuredCheck.rows.map(r => r.name).join(', ')}` });

    await pool.query("UPDATE players SET roster_status = '등록' WHERE team_id = $1", [teamId]);
    await pool.query("UPDATE players SET roster_status = '선발로스터' WHERE id = ANY($1)", [playerIds]);

    res.json({ message: '선발 로스터 설정 완료' });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 타순/포지션 설정 (9명)
router.post('/lineup', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { lineup } = req.body; // [{ playerId, battingOrder, position }]
    const teamId = req.user!.teamId;
    if (!teamId) return res.status(400).json({ error: '팀 먼저 선택' });
    if (!Array.isArray(lineup) || lineup.length !== 9) return res.status(400).json({ error: '타순은 9명' });

    const positions = lineup.map((l: any) => l.position);
    const required = ['포수','1루수','2루수','3루수','유격수','좌익수','중견수','우익수'];
    // 투수 제외 8포지션 + 지명타자 가능
    const fieldPositions = positions.filter((p: string) => p !== '지명타자');
    for (const rp of required) {
      if (!fieldPositions.includes(rp)) return res.status(400).json({ error: `${rp} 포지션이 없습니다` });
    }

    const orders = lineup.map((l: any) => l.battingOrder);
    if (new Set(orders).size !== 9) return res.status(400).json({ error: '타순 중복' });

    // 투수가 타순에 있는지 체크
    const playerIds = lineup.map((l: any) => l.playerId);
    const pitcherInLineup = await pool.query('SELECT id, name FROM players WHERE id = ANY($1) AND is_pitcher = TRUE', [playerIds]);
    if (pitcherInLineup.rows.length > 0) return res.status(400).json({ error: `투수(${pitcherInLineup.rows[0].name})는 타순에 넣을 수 없습니다` });

    await pool.query('UPDATE players SET batting_order = NULL, lineup_position = NULL WHERE team_id = $1', [teamId]);
    for (const entry of lineup) {
      await pool.query(
        'UPDATE players SET batting_order = $1, lineup_position = $2 WHERE id = $3 AND team_id = $4',
        [entry.battingOrder, entry.position, entry.playerId, teamId]
      );
    }

    res.json({ message: '타순 설정 완료' });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 투수 역할 설정 (선발/중계/마무리)
router.post('/pitching-rotation', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rotation } = req.body; // [{ playerId, pitcher_role }]
    const teamId = req.user!.teamId;
    if (!teamId) return res.status(400).json({ error: '팀 먼저 선택' });
    if (!Array.isArray(rotation)) return res.status(400).json({ error: '투수 로테이션 배열 필요' });

    // 모든 투수가 이 팀 소속인지 확인
    const playerIds = rotation.map((r: any) => r.playerId);
    const check = await pool.query(
      'SELECT COUNT(*) FROM players WHERE id = ANY($1) AND team_id = $2 AND is_pitcher = TRUE',
      [playerIds, teamId]
    );
    if (parseInt(check.rows[0].count) !== playerIds.length) {
      return res.status(400).json({ error: '팀 소속 투수가 아닌 선수가 포함되어 있습니다' });
    }

    // 역할별 수 검증
    const starters = rotation.filter((r: any) => r.pitcher_role === '선발');
    const relievers = rotation.filter((r: any) => r.pitcher_role === '중계');
    const closers = rotation.filter((r: any) => r.pitcher_role === '마무리');

    if (starters.length < 1) return res.status(400).json({ error: '선발 투수 최소 1명 필요' });
    if (closers.length > 1) return res.status(400).json({ error: '마무리 투수는 최대 1명' });

    // DB 업데이트
    for (const entry of rotation) {
      await pool.query(
        'UPDATE players SET pitcher_role = $1 WHERE id = $2 AND team_id = $3',
        [entry.pitcher_role, entry.playerId, teamId]
      );
    }

    res.json({ message: '투수 로테이션 설정 완료' });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 선수 방출
router.post('/release/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.user!.teamId;
    const playerId = parseInt(req.params.id);

    const player = await pool.query('SELECT name, team_id FROM players WHERE id = $1', [playerId]);
    if (player.rows.length === 0) return res.status(404).json({ error: '선수 없음' });
    if (player.rows[0].team_id !== teamId && req.user!.role !== 'admin') {
      return res.status(403).json({ error: '자기 팀 선수만 방출 가능' });
    }

    const rosterCount = await pool.query('SELECT COUNT(*) FROM players WHERE team_id = $1', [teamId]);
    if (parseInt(rosterCount.rows[0].count) <= 23) {
      return res.status(400).json({ error: '최소 23명은 유지해야 합니다' });
    }

    await pool.query('DELETE FROM player_skills WHERE player_id = $1', [playerId]);
    await pool.query('DELETE FROM pitcher_pitches WHERE player_id = $1', [playerId]);
    await pool.query('DELETE FROM players WHERE id = $1', [playerId]);

    await pool.query(
      `INSERT INTO game_news (title, content, category, related_team_id) VALUES ($1, $2, '방출', $3)`,
      [`${player.rows[0].name} 방출`, `${player.rows[0].name} 선수가 팀에서 방출되었습니다`, teamId]
    );

    res.json({ message: `${player.rows[0].name} 방출 완료` });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

export default router;
