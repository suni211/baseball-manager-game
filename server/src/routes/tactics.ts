import { Router, Response } from 'express';
import pool from '../database/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// 전술 조회
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.user!.teamId;
    if (!teamId) return res.status(400).json({ error: '팀 먼저 선택' });
    const result = await pool.query('SELECT * FROM team_tactics WHERE team_id = $1', [teamId]);
    if (result.rows.length === 0) {
      await pool.query('INSERT INTO team_tactics (team_id) VALUES ($1)', [teamId]);
      const newResult = await pool.query('SELECT * FROM team_tactics WHERE team_id = $1', [teamId]);
      return res.json(newResult.rows[0]);
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 전술 저장
router.put('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.user!.teamId;
    if (!teamId) return res.status(400).json({ error: '팀 먼저 선택' });

    const {
      steal_tendency, bunt_tendency, hit_and_run,
      pitcher_change_threshold, closer_inning, defensive_shift,
      intentional_walk_threshold, pinch_hitter_threshold, aggression
    } = req.body;

    await pool.query(
      `INSERT INTO team_tactics (team_id, steal_tendency, bunt_tendency, hit_and_run,
       pitcher_change_threshold, closer_inning, defensive_shift,
       intentional_walk_threshold, pinch_hitter_threshold, aggression, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (team_id) DO UPDATE SET
         steal_tendency = $2, bunt_tendency = $3, hit_and_run = $4,
         pitcher_change_threshold = $5, closer_inning = $6, defensive_shift = $7,
         intentional_walk_threshold = $8, pinch_hitter_threshold = $9, aggression = $10,
         updated_at = NOW()`,
      [teamId, steal_tendency, bunt_tendency, hit_and_run,
       pitcher_change_threshold, closer_inning, defensive_shift,
       intentional_walk_threshold, pinch_hitter_threshold, aggression]
    );

    res.json({ message: '전술 저장 완료' });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

export default router;
