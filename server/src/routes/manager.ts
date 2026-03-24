import { Router, Response } from 'express';
import pool from '../database/db';
import { authMiddleware, AuthRequest, generateToken } from '../middleware/auth';

const router = Router();

// 감독 이동 가능 팀 조회
router.get('/available-teams', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await pool.query('SELECT reputation FROM users WHERE id = $1', [req.user!.id]);
    const rep = user.rows[0].reputation;

    // 현재 팀보다 높은 평판 요구 팀만 표시
    const teams = await pool.query(
      `SELECT t.*, l.name as league_name
       FROM teams t
       LEFT JOIN leagues l ON t.league_id = l.id
       WHERE t.owner_id IS NULL
       ORDER BY t.name`
    );

    res.json({
      reputation: rep,
      available_teams: teams.rows,
      min_reputation_to_move: 70
    });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 감독 이동
router.post('/transfer', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { targetTeamId } = req.body;
    const userId = req.user!.id;
    const currentTeamId = req.user!.teamId;

    const user = await pool.query('SELECT reputation FROM users WHERE id = $1', [userId]);
    if (user.rows[0].reputation < 70) {
      return res.status(400).json({ error: '감독 이동에는 평판 70 이상이 필요합니다' });
    }

    const targetTeam = await pool.query('SELECT owner_id, name FROM teams WHERE id = $1', [targetTeamId]);
    if (targetTeam.rows.length === 0) return res.status(404).json({ error: '팀 없음' });
    if (targetTeam.rows[0].owner_id) return res.status(400).json({ error: '이미 감독이 있는 팀입니다' });

    const season = await pool.query('SELECT id FROM seasons WHERE is_active = TRUE LIMIT 1');

    // 기존 팀 해제
    if (currentTeamId) {
      await pool.query('UPDATE teams SET owner_id = NULL WHERE id = $1', [currentTeamId]);
    }

    // 새 팀 배정
    await pool.query('UPDATE users SET team_id = $1 WHERE id = $2', [targetTeamId, userId]);
    await pool.query('UPDATE teams SET owner_id = $1 WHERE id = $2', [userId, targetTeamId]);

    // 평판 소모
    await pool.query('UPDATE users SET reputation = GREATEST(reputation - 20, 0) WHERE id = $1', [userId]);

    // 이동 기록
    await pool.query(
      `INSERT INTO manager_transfers (user_id, from_team_id, to_team_id, reputation_at_transfer, season_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, currentTeamId, targetTeamId, user.rows[0].reputation, season.rows[0]?.id]
    );

    await pool.query(
      `INSERT INTO game_news (title, content, category, related_team_id)
       VALUES ($1, $2, '감독이동', $3)`,
      [`${req.user!.username} 감독 이동`, `${req.user!.username} 감독이 ${targetTeam.rows[0].name}으로 부임`, targetTeamId]
    );

    const token = generateToken({ id: userId, username: req.user!.username, role: req.user!.role, teamId: targetTeamId });

    res.json({ message: `${targetTeam.rows[0].name}으로 이동 완료!`, token, teamId: targetTeamId });
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
