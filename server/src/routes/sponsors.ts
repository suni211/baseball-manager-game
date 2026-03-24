import { Router, Response } from 'express';
import pool from '../database/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// 전체 스폰서 목록
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sponsors ORDER BY tier DESC, money_per_season DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 내 팀 스폰서
router.get('/my', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.user!.teamId;
    if (!teamId) return res.json([]);

    const result = await pool.query(
      `SELECT s.*, ts.signed_at
       FROM sponsors s
       JOIN team_sponsors ts ON s.id = ts.sponsor_id
       WHERE ts.team_id = $1 AND ts.is_active = TRUE`,
      [teamId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 스폰서 계약
router.post('/sign/:sponsorId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.user!.teamId;
    if (!teamId) return res.status(400).json({ error: '팀을 먼저 선택하세요' });

    const sponsor = await pool.query('SELECT * FROM sponsors WHERE id = $1', [req.params.sponsorId]);
    if (sponsor.rows.length === 0) return res.status(404).json({ error: '스폰서 없음' });

    const s = sponsor.rows[0];

    // 자격 확인
    const user = await pool.query('SELECT reputation FROM users WHERE id = $1', [req.user!.id]);
    if (s.requirement_min_reputation && user.rows[0].reputation < s.requirement_min_reputation) {
      return res.status(400).json({ error: `평판 ${s.requirement_min_reputation} 이상 필요합니다` });
    }

    // 이미 계약 중인지 확인
    const existing = await pool.query(
      'SELECT id FROM team_sponsors WHERE team_id = $1 AND sponsor_id = $2 AND is_active = TRUE',
      [teamId, req.params.sponsorId]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: '이미 계약 중인 스폰서입니다' });
    }

    const season = await pool.query('SELECT id FROM seasons WHERE is_active = TRUE LIMIT 1');
    const seasonId = season.rows[0]?.id;

    await pool.query(
      'INSERT INTO team_sponsors (team_id, sponsor_id, season_id) VALUES ($1, $2, $3)',
      [teamId, req.params.sponsorId, seasonId]
    );

    // 스폰서 자금 지급
    await pool.query('UPDATE teams SET budget = budget + $1 WHERE id = $2', [s.money_per_season, teamId]);
    await pool.query(
      `INSERT INTO financial_transactions (team_id, type, amount, description)
       VALUES ($1, '스폰서수입', $2, $3)`,
      [teamId, s.money_per_season, `${s.name} 스폰서 계약금`]
    );

    res.json({ message: `${s.name} 스폰서 계약 완료! +${s.money_per_season.toLocaleString()}원` });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

export default router;
