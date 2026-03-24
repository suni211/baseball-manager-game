import { Router, Response } from 'express';
import pool from '../database/db';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// 모든 팀 조회
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, l.name as league_name, u.username as owner_name,
              s.name as stadium_name, s.capacity as stadium_capacity
       FROM teams t
       LEFT JOIN leagues l ON t.league_id = l.id
       LEFT JOIN users u ON t.owner_id = u.id
       LEFT JOIN stadiums s ON t.stadium_id = s.id
       ORDER BY l.id, t.name`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 리그별 팀 조회 (현재 시즌 승/패 포함)
router.get('/league/:leagueId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.username as owner_name,
              COALESCE(SUM(tt.wins), 0) as wins,
              COALESCE(SUM(tt.losses), 0) as losses,
              COALESCE(SUM(tt.draws), 0) as draws,
              COALESCE(SUM(tt.runs_scored), 0) as runs_scored,
              COALESCE(SUM(tt.runs_allowed), 0) as runs_allowed
       FROM teams t
       LEFT JOIN users u ON t.owner_id = u.id
       LEFT JOIN tournament_teams tt ON t.id = tt.team_id
       LEFT JOIN tournaments tn ON tt.tournament_id = tn.id
         AND tn.season_id = (SELECT id FROM seasons WHERE is_active = TRUE ORDER BY id DESC LIMIT 1)
       WHERE t.league_id = $1
       GROUP BY t.id, u.username
       ORDER BY t.name`,
      [req.params.leagueId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 팀 상세 정보
router.get('/:id', async (req, res) => {
  try {
    const teamResult = await pool.query(
      `SELECT t.*, l.name as league_name, u.username as owner_name,
              s.name as stadium_name, s.capacity, s.field_condition,
              s.fence_distance, s.has_lights, s.upgrade_level
       FROM teams t
       LEFT JOIN leagues l ON t.league_id = l.id
       LEFT JOIN users u ON t.owner_id = u.id
       LEFT JOIN stadiums s ON t.stadium_id = s.id
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: '팀을 찾을 수 없습니다' });
    }

    // 팀 로스터 요약
    const rosterResult = await pool.query(
      `SELECT roster_status, COUNT(*) as count FROM players WHERE team_id = $1 GROUP BY roster_status`,
      [req.params.id]
    );

    // 팀 스폰서
    const sponsorsResult = await pool.query(
      `SELECT s.* FROM sponsors s
       JOIN team_sponsors ts ON s.id = ts.sponsor_id
       WHERE ts.team_id = $1 AND ts.is_active = TRUE`,
      [req.params.id]
    );

    res.json({
      ...teamResult.rows[0],
      roster_summary: rosterResult.rows,
      sponsors: sponsorsResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 팀 재정 현황
router.get('/:id/finances', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = parseInt(req.params.id);
    if (req.user!.role !== 'admin' && req.user!.teamId !== teamId) {
      return res.status(403).json({ error: '자기 팀만 조회할 수 있습니다' });
    }

    const team = await pool.query('SELECT budget FROM teams WHERE id = $1', [teamId]);
    const transactions = await pool.query(
      'SELECT * FROM financial_transactions WHERE team_id = $1 ORDER BY created_at DESC LIMIT 50',
      [teamId]
    );

    res.json({
      budget: team.rows[0]?.budget || 0,
      transactions: transactions.rows
    });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 장비 구매
router.post('/:id/buy-equipment', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = parseInt(req.params.id);
    const { equipmentId, quantity } = req.body;

    if (req.user!.role !== 'admin' && req.user!.teamId !== teamId) {
      return res.status(403).json({ error: '자기 팀만 관리할 수 있습니다' });
    }

    const equip = await pool.query('SELECT * FROM equipment WHERE id = $1', [equipmentId]);
    if (equip.rows.length === 0) return res.status(404).json({ error: '장비 없음' });

    const totalCost = equip.rows[0].price * (quantity || 1);
    const team = await pool.query('SELECT budget FROM teams WHERE id = $1', [teamId]);

    if (team.rows[0].budget < totalCost) {
      return res.status(400).json({ error: '예산이 부족합니다' });
    }

    await pool.query('UPDATE teams SET budget = budget - $1 WHERE id = $2', [totalCost, teamId]);
    await pool.query(
      'INSERT INTO team_equipment (team_id, equipment_id, quantity) VALUES ($1, $2, $3)',
      [teamId, equipmentId, quantity || 1]
    );
    await pool.query(
      `INSERT INTO financial_transactions (team_id, type, amount, description)
       VALUES ($1, '장비구매', $2, $3)`,
      [teamId, -totalCost, `${equip.rows[0].name} x${quantity || 1} 구매`]
    );

    res.json({ message: '구매 완료', remaining_budget: team.rows[0].budget - totalCost });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

export default router;
