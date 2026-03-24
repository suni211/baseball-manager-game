import { Router, Response } from 'express';
import pool from '../database/db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// 훈련 메뉴 조회
router.get('/menus', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM training_menus ORDER BY category, name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 선수 훈련
router.post('/train', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { playerId, menuId } = req.body;
    const teamId = req.user!.teamId;

    if (!teamId) return res.status(400).json({ error: '팀을 먼저 선택하세요' });

    // 선수 확인
    const player = await pool.query(
      'SELECT * FROM players WHERE id = $1 AND team_id = $2',
      [playerId, teamId]
    );
    if (player.rows.length === 0) {
      return res.status(404).json({ error: '선수를 찾을 수 없습니다' });
    }

    const p = player.rows[0];
    if (p.is_injured) {
      return res.status(400).json({ error: '부상 중인 선수는 훈련할 수 없습니다' });
    }

    // 훈련 메뉴 확인
    const menu = await pool.query('SELECT * FROM training_menus WHERE id = $1', [menuId]);
    if (menu.rows.length === 0) {
      return res.status(404).json({ error: '훈련 메뉴를 찾을 수 없습니다' });
    }

    const m = menu.rows[0];

    // 하루 1회 훈련 제한 체크
    const todayTraining = await pool.query(
      `SELECT COUNT(*) as cnt FROM training_logs
       WHERE player_id = $1 AND created_at >= CURRENT_DATE`,
      [playerId]
    );
    if (parseInt(todayTraining.rows[0].cnt) > 0) {
      return res.status(400).json({ error: '이 선수는 오늘 이미 훈련했습니다. 내일 다시 시도하세요.' });
    }

    // 피로도 체크
    if (p.fatigue + m.fatigue_cost > 100) {
      return res.status(400).json({ error: '피로도가 너무 높습니다. 휴식이 필요합니다' });
    }

    // 부상 확률 체크
    const injuryRoll = Math.random();
    const adjustedRisk = m.injury_risk * (1 + p.fatigue / 100);

    if (injuryRoll < adjustedRisk) {
      // 부상 발생
      const injuryTypes = ['근육 경련', '타박상', '염좌', '근육 파열', '인대 손상'];
      const injuryDays = [3, 5, 7, 14, 21];
      const idx = Math.floor(Math.random() * injuryTypes.length);

      await pool.query(
        `UPDATE players SET is_injured = TRUE, injury_type = $1, injury_days_left = $2,
         condition = GREATEST(condition - 20, 0) WHERE id = $3`,
        [injuryTypes[idx], injuryDays[idx], playerId]
      );

      await pool.query(
        `INSERT INTO game_news (title, content, category, related_team_id)
         VALUES ($1, $2, '부상', $3)`,
        [
          `${p.name} 훈련 중 부상`,
          `${p.name} 선수가 ${m.name} 훈련 중 ${injuryTypes[idx]}으로 ${injuryDays[idx]}일 결장`,
          teamId
        ]
      );

      return res.json({
        success: false,
        injury: true,
        message: `${p.name}이(가) 훈련 중 ${injuryTypes[idx]}! ${injuryDays[idx]}일 결장`
      });
    }

    // 스탯 성장 계산
    const baseGain = Math.floor(Math.random() * (m.stat_gain_max - m.stat_gain_min + 1)) + m.stat_gain_min;
    const growthMultiplier = p.growth_rate;
    const conditionMultiplier = p.condition / 100;
    const potentialMultiplier = p.potential === 'S' ? 1.5 : p.potential === 'A' ? 1.25 : p.potential === 'B' ? 1.0 : p.potential === 'C' ? 0.8 : 0.6;

    const finalGain = Math.max(1, Math.round(baseGain * growthMultiplier * conditionMultiplier * potentialMultiplier));

    // 스탯 적용
    const statTarget = m.stat_target;
    if (statTarget === 'chemistry') {
      await pool.query(
        'UPDATE teams SET chemistry = LEAST(chemistry + $1, 100) WHERE id = $2',
        [finalGain, teamId]
      );
    } else {
      await pool.query(
        `UPDATE players SET ${statTarget} = LEAST(${statTarget} + $1, 100),
         fatigue = LEAST(fatigue + $2, 100),
         experience = experience + $3
         WHERE id = $4`,
        [finalGain, m.fatigue_cost, finalGain * 10, playerId]
      );
    }

    // 훈련 기록
    await pool.query(
      'INSERT INTO training_logs (player_id, team_id, training_menu_id, stat_gained) VALUES ($1, $2, $3, $4)',
      [playerId, teamId, menuId, finalGain]
    );

    res.json({
      success: true,
      message: `${p.name}의 ${statTarget} +${finalGain}`,
      stat_target: statTarget,
      stat_gained: finalGain,
      new_fatigue: Math.min(p.fatigue + m.fatigue_cost, 100)
    });
  } catch (error) {
    console.error('훈련 에러:', error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 선수 휴식
router.post('/rest', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.body;
    const teamId = req.user!.teamId;

    await pool.query(
      `UPDATE players SET fatigue = GREATEST(fatigue - 30, 0),
       condition = LEAST(condition + 10, 100)
       WHERE id = $1 AND team_id = $2`,
      [playerId, teamId]
    );

    res.json({ message: '휴식 완료' });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

export default router;
