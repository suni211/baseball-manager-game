import { Router, Response } from 'express';
import pool from '../database/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// 스카우트 가능한 유망주 목록
router.get('/prospects', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const seasonResult = await pool.query('SELECT id FROM seasons WHERE is_active = TRUE LIMIT 1');
    if (seasonResult.rows.length === 0) return res.json([]);

    const result = await pool.query(
      `SELECT sp.*, t.name as committed_team_name
       FROM scout_prospects sp
       LEFT JOIN teams t ON sp.committed_team_id = t.id
       WHERE sp.season_id = $1 AND sp.is_committed = FALSE
       ORDER BY sp.overall_rating DESC`,
      [seasonResult.rows[0].id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 유망주 스카우트 (비용 발생)
router.post('/scout/:prospectId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.user!.teamId;
    if (!teamId) return res.status(400).json({ error: '팀을 먼저 선택하세요' });

    const scoutCost = 200000;
    const team = await pool.query('SELECT budget FROM teams WHERE id = $1', [teamId]);
    if (team.rows[0].budget < scoutCost) {
      return res.status(400).json({ error: '스카우트 비용이 부족합니다 (200,000원 필요)' });
    }

    const prospect = await pool.query(
      'SELECT * FROM scout_prospects WHERE id = $1 AND is_committed = FALSE',
      [req.params.prospectId]
    );
    if (prospect.rows.length === 0) {
      return res.status(404).json({ error: '이미 영입된 유망주이거나 존재하지 않습니다' });
    }

    // 비용 차감
    await pool.query('UPDATE teams SET budget = budget - $1 WHERE id = $2', [scoutCost, teamId]);
    await pool.query(
      `INSERT INTO financial_transactions (team_id, type, amount, description)
       VALUES ($1, '스카우트비용', $2, $3)`,
      [teamId, -scoutCost, `${prospect.rows[0].name} 스카우트`]
    );

    // 스카우트 정보 공개 (실제 스탯의 ±10% 오차)
    await pool.query(
      'UPDATE scout_prospects SET scouted_by = $1 WHERE id = $2',
      [teamId, req.params.prospectId]
    );

    res.json({
      message: `${prospect.rows[0].name} 스카우트 완료`,
      prospect: prospect.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 유망주 영입 확정
router.post('/commit/:prospectId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.user!.teamId;
    if (!teamId) return res.status(400).json({ error: '팀을 먼저 선택하세요' });

    const prospect = await pool.query(
      'SELECT * FROM scout_prospects WHERE id = $1 AND is_committed = FALSE',
      [req.params.prospectId]
    );
    if (prospect.rows.length === 0) {
      return res.status(404).json({ error: '유망주를 찾을 수 없습니다' });
    }

    const p = prospect.rows[0];

    // 로스터 36명 제한 확인
    const rosterCount = await pool.query(
      'SELECT COUNT(*) FROM players WHERE team_id = $1',
      [teamId]
    );
    if (parseInt(rosterCount.rows[0].count) >= 36) {
      return res.status(400).json({ error: '로스터가 가득 찼습니다 (최대 36명)' });
    }

    // 영입 확정
    await pool.query(
      'UPDATE scout_prospects SET is_committed = TRUE, committed_team_id = $1 WHERE id = $2',
      [teamId, req.params.prospectId]
    );

    // 실제 선수로 등록 (스카우트 시 본 스탯에서 약간 변동)
    const variance = () => Math.floor(Math.random() * 6) - 3;
    await pool.query(
      `INSERT INTO players (team_id, name, grade, age, position, is_pitcher,
       contact, power, eye, speed, clutch, fielding, arm_strength, arm_accuracy, reaction,
       velocity, control_stat, stamina, breaking_ball, mental, potential, roster_status)
       VALUES ($1,$2,1,16,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'등록')`,
      [
        teamId, p.name, p.position, p.is_pitcher,
        Math.max(1, (p.preview_contact || 30) + variance()),
        Math.max(1, (p.preview_power || 30) + variance()),
        30 + variance(), // eye
        Math.max(1, (p.preview_speed || 30) + variance()),
        30 + variance(), // clutch
        Math.max(1, (p.preview_fielding || 30) + variance()),
        30 + variance(), 30 + variance(), 30 + variance(),
        p.is_pitcher ? Math.max(1, (p.preview_velocity || 30) + variance()) : 0,
        p.is_pitcher ? Math.max(1, (p.preview_control || 30) + variance()) : 0,
        p.is_pitcher ? 30 + variance() : 0,
        p.is_pitcher ? 30 + variance() : 0,
        30 + variance(),
        p.potential
      ]
    );

    res.json({ message: `${p.name} 영입 완료!` });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

export default router;
