import { Router, Response } from 'express';
import pool from '../database/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// 내 구장 정보
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.user!.teamId;
    if (!teamId) return res.status(400).json({ error: '팀 먼저 선택' });
    const result = await pool.query('SELECT * FROM stadiums WHERE team_id = $1', [teamId]);
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 업그레이드 옵션 목록
router.get('/upgrades', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stadium_upgrades ORDER BY required_level, cost');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 구장 업그레이드
router.post('/upgrade', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.user!.teamId;
    if (!teamId) return res.status(400).json({ error: '팀 먼저 선택' });

    const { upgradeId } = req.body;
    const upgrade = await pool.query('SELECT * FROM stadium_upgrades WHERE id = $1', [upgradeId]);
    if (upgrade.rows.length === 0) return res.status(404).json({ error: '업그레이드 없음' });

    const u = upgrade.rows[0];
    const team = await pool.query('SELECT budget FROM teams WHERE id = $1', [teamId]);
    const stadium = await pool.query('SELECT * FROM stadiums WHERE team_id = $1', [teamId]);

    if (!stadium.rows[0]) return res.status(400).json({ error: '구장 없음' });
    if (stadium.rows[0].upgrade_level < u.required_level) {
      return res.status(400).json({ error: `구장 레벨 ${u.required_level} 이상 필요` });
    }
    if (team.rows[0].budget < u.cost) {
      return res.status(400).json({ error: '예산 부족' });
    }

    // 비용 차감
    await pool.query('UPDATE teams SET budget = budget - $1 WHERE id = $2', [u.cost, teamId]);

    // 구장 업데이트
    const field = u.target_field;
    if (field === 'capacity') {
      await pool.query('UPDATE stadiums SET capacity = capacity + $1 WHERE team_id = $2', [u.capacity_bonus, teamId]);
    } else if (field === 'field_condition') {
      await pool.query('UPDATE stadiums SET field_condition = LEAST(field_condition + $1, 100) WHERE team_id = $2', [u.field_condition_bonus, teamId]);
    } else if (['has_lights', 'has_scoreboard', 'has_bullpen', 'has_batting_cage', 'has_video_room'].includes(field)) {
      await pool.query(`UPDATE stadiums SET ${field} = TRUE WHERE team_id = $1`, [teamId]);
    }

    // 불펜 설치 시 구장 레벨 업
    if (u.field_condition_bonus > 0) {
      await pool.query('UPDATE stadiums SET upgrade_level = LEAST(upgrade_level + 1, 5) WHERE team_id = $1', [teamId]);
    }

    await pool.query(
      `INSERT INTO financial_transactions (team_id, type, amount, description) VALUES ($1, '구장업그레이드', $2, $3)`,
      [teamId, -u.cost, `${u.name} 설치`]
    );

    res.json({ message: `${u.name} 업그레이드 완료!` });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

export default router;
