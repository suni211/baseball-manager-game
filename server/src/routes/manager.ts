import { Router, Response } from 'express';
import pool from '../database/db';
import { authMiddleware, AuthRequest, generateToken } from '../middleware/auth';

const router = Router();

// 감독 프로필 (평판, 성적, 경질 여부)
router.get('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const teamId = req.user!.teamId;

    const user = await pool.query('SELECT reputation, team_id FROM users WHERE id = $1', [userId]);
    const rep = user.rows[0].reputation;

    let teamRecord = null;
    let isFired = !user.rows[0].team_id; // 팀이 없으면 경질 상태

    if (teamId) {
      // 현재 시즌 팀 성적 계산
      const season = await pool.query('SELECT id FROM seasons WHERE is_active = TRUE ORDER BY id DESC LIMIT 1');
      if (season.rows.length > 0) {
        const stats = await pool.query(
          `SELECT
            COALESCE(SUM(tt.wins), 0) as wins,
            COALESCE(SUM(tt.losses), 0) as losses,
            COALESCE(SUM(tt.runs_scored), 0) as runs_scored,
            COALESCE(SUM(tt.runs_allowed), 0) as runs_allowed
           FROM tournament_teams tt
           JOIN tournaments tn ON tt.tournament_id = tn.id
           WHERE tt.team_id = $1 AND tn.season_id = $2`,
          [teamId, season.rows[0].id]
        );
        teamRecord = stats.rows[0];
      }

      const team = await pool.query('SELECT name, morale, chemistry, budget FROM teams WHERE id = $1', [teamId]);
      if (team.rows.length > 0) {
        teamRecord = { ...teamRecord, ...team.rows[0] };
      }
    }

    // 이적 기록
    const history = await pool.query(
      `SELECT mt.*, ft.name as from_team_name, tt.name as to_team_name, mt.transferred_at, mt.reason
       FROM manager_transfers mt
       LEFT JOIN teams ft ON mt.from_team_id = ft.id
       LEFT JOIN teams tt ON mt.to_team_id = tt.id
       WHERE mt.user_id = $1
       ORDER BY mt.transferred_at DESC LIMIT 10`,
      [userId]
    );

    res.json({
      reputation: rep,
      isFired,
      teamRecord,
      transferHistory: history.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 이적 가능한 팀 목록 (팀 강도에 따른 협상 난이도 표시)
router.get('/available-teams', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await pool.query('SELECT reputation FROM users WHERE id = $1', [req.user!.id]);
    const rep = user.rows[0].reputation;

    // 빈 팀 (감독 없는 팀) 조회 + 팀 전력 평가
    const teams = await pool.query(
      `SELECT t.id, t.name, t.budget, t.morale, t.chemistry, t.popularity,
              l.name as league_name, l.id as league_id,
              (SELECT ROUND(AVG(
                CASE WHEN p.is_pitcher THEN (p.velocity + p.control_stat + p.stamina + p.breaking_ball + p.mental) / 5.0
                     ELSE (p.contact + p.power + p.eye + p.speed + p.fielding) / 5.0 END
              )::numeric, 1)
               FROM players p WHERE p.team_id = t.id AND p.roster_status = '선발로스터'
              ) as team_overall,
              COALESCE(SUM(tt.wins), 0) as season_wins,
              COALESCE(SUM(tt.losses), 0) as season_losses
       FROM teams t
       LEFT JOIN leagues l ON t.league_id = l.id
       LEFT JOIN tournament_teams tt ON t.id = tt.team_id
       LEFT JOIN tournaments tn ON tt.tournament_id = tn.id
         AND tn.season_id = (SELECT id FROM seasons WHERE is_active = TRUE ORDER BY id DESC LIMIT 1)
       WHERE t.owner_id IS NULL
       GROUP BY t.id, t.name, t.budget, t.morale, t.chemistry, t.popularity, l.name, l.id
       ORDER BY team_overall DESC NULLS LAST`
    );

    // 각 팀에 협상 난이도 계산
    const teamsWithDifficulty = teams.rows.map((t: any) => {
      const overall = parseFloat(t.team_overall) || 40;
      // 팀 전력이 높을수록 요구 평판이 높음
      const requiredRep = Math.max(30, Math.round(overall * 1.2));
      const canNegotiate = rep >= requiredRep;
      // 협상 성공률: 평판이 높을수록 유리
      const successRate = canNegotiate
        ? Math.min(95, Math.max(20, Math.round(50 + (rep - requiredRep) * 2)))
        : 0;

      return {
        ...t,
        required_reputation: requiredRep,
        can_negotiate: canNegotiate,
        success_rate: successRate,
        difficulty: overall >= 70 ? '상' : overall >= 50 ? '중' : '하',
      };
    });

    res.json({
      reputation: rep,
      teams: teamsWithDifficulty,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 감독 이적 협상
router.post('/negotiate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { targetTeamId } = req.body;
    const userId = req.user!.id;
    const currentTeamId = req.user!.teamId;

    const user = await pool.query('SELECT reputation FROM users WHERE id = $1', [userId]);
    const rep = user.rows[0].reputation;

    const targetTeam = await pool.query(
      `SELECT t.*, l.name as league_name,
              (SELECT ROUND(AVG(
                CASE WHEN p.is_pitcher THEN (p.velocity + p.control_stat + p.stamina + p.breaking_ball + p.mental) / 5.0
                     ELSE (p.contact + p.power + p.eye + p.speed + p.fielding) / 5.0 END
              )::numeric, 1)
               FROM players p WHERE p.team_id = t.id AND p.roster_status = '선발로스터'
              ) as team_overall
       FROM teams t
       LEFT JOIN leagues l ON t.league_id = l.id
       WHERE t.id = $1`,
      [targetTeamId]
    );

    if (targetTeam.rows.length === 0) return res.status(404).json({ error: '팀 없음' });
    if (targetTeam.rows[0].owner_id) return res.status(400).json({ error: '이미 감독이 있는 팀입니다' });

    const overall = parseFloat(targetTeam.rows[0].team_overall) || 40;
    const requiredRep = Math.max(30, Math.round(overall * 1.2));

    if (rep < requiredRep) {
      return res.status(400).json({
        error: `평판이 부족합니다 (현재: ${rep}, 필요: ${requiredRep}). 더 약한 팀부터 시작하세요.`
      });
    }

    // 협상 성공률 계산
    const successRate = Math.min(95, Math.max(20, Math.round(50 + (rep - requiredRep) * 2)));
    const roll = Math.random() * 100;

    if (roll > successRate) {
      // 실패 시 평판 소폭 감소
      await pool.query('UPDATE users SET reputation = GREATEST(reputation - 5, 0) WHERE id = $1', [userId]);
      return res.json({
        success: false,
        message: `${targetTeam.rows[0].name}이(가) 협상을 거절했습니다. (성공률: ${successRate}%)`,
        reputationLost: 5,
      });
    }

    // 성공!
    const season = await pool.query('SELECT id FROM seasons WHERE is_active = TRUE LIMIT 1');

    // 기존 팀 해제
    if (currentTeamId) {
      await pool.query('UPDATE teams SET owner_id = NULL WHERE id = $1', [currentTeamId]);
    }

    // 새 팀 배정
    await pool.query('UPDATE users SET team_id = $1 WHERE id = $2', [targetTeamId, userId]);
    await pool.query('UPDATE teams SET owner_id = $1 WHERE id = $2', [userId, targetTeamId]);

    // 평판 소모 (강팀일수록 소모 적음)
    const repCost = Math.max(5, Math.round(20 - (rep - requiredRep) / 3));
    await pool.query('UPDATE users SET reputation = GREATEST(reputation - $1, 0) WHERE id = $2', [repCost, userId]);

    // 이동 기록
    await pool.query(
      `INSERT INTO manager_transfers (user_id, from_team_id, to_team_id, reputation_at_transfer, season_id, reason)
       VALUES ($1, $2, $3, $4, $5, '자진이적')`,
      [userId, currentTeamId, targetTeamId, rep, season.rows[0]?.id]
    );

    await pool.query(
      `INSERT INTO game_news (title, content, category, related_team_id)
       VALUES ($1, $2, '감독이동', $3)`,
      [`${req.user!.username} 감독 부임`, `${req.user!.username} 감독이 ${targetTeam.rows[0].name}의 새 감독으로 부임했습니다.`, targetTeamId]
    );

    const token = generateToken({ id: userId, username: req.user!.username, role: req.user!.role, teamId: targetTeamId });

    res.json({
      success: true,
      message: `${targetTeam.rows[0].name}의 감독으로 부임했습니다!`,
      token,
      teamId: targetTeamId,
      reputationCost: repCost,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 사임 (자진 사임)
router.post('/resign', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const teamId = req.user!.teamId;

    if (!teamId) return res.status(400).json({ error: '이미 팀이 없습니다' });

    const team = await pool.query('SELECT name FROM teams WHERE id = $1', [teamId]);
    const season = await pool.query('SELECT id FROM seasons WHERE is_active = TRUE LIMIT 1');

    // 팀 해제
    await pool.query('UPDATE teams SET owner_id = NULL WHERE id = $1', [teamId]);
    await pool.query('UPDATE users SET team_id = NULL WHERE id = $1', [userId]);

    // 평판 감소
    await pool.query('UPDATE users SET reputation = GREATEST(reputation - 15, 0) WHERE id = $1', [userId]);

    // 이동 기록
    await pool.query(
      `INSERT INTO manager_transfers (user_id, from_team_id, to_team_id, reputation_at_transfer, season_id, reason)
       VALUES ($1, $2, NULL, $3, $4, '자진사임')`,
      [userId, teamId, 0, season.rows[0]?.id]
    );

    await pool.query(
      `INSERT INTO game_news (title, content, category, related_team_id)
       VALUES ($1, $2, '감독이동', $3)`,
      [`${req.user!.username} 감독 사임`, `${req.user!.username} 감독이 ${team.rows[0].name}에서 사임했습니다.`, teamId]
    );

    const token = generateToken({ id: userId, username: req.user!.username, role: req.user!.role, teamId: null });

    res.json({
      message: `${team.rows[0].name}에서 사임했습니다. 새 팀을 찾아보세요.`,
      token,
    });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 이동 기록
router.get('/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT mt.*, ft.name as from_team_name, tt.name as to_team_name
       FROM manager_transfers mt
       LEFT JOIN teams ft ON mt.from_team_id = ft.id
       LEFT JOIN teams tt ON mt.to_team_id = tt.id
       WHERE mt.user_id = $1
       ORDER BY mt.transferred_at DESC`,
      [req.user!.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

export default router;
