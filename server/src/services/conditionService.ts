import pool from '../database/db';

// 매일 컨디션 변동 처리
export async function dailyConditionUpdate() {
  // 전체 선수 컨디션 변동
  const players = await pool.query('SELECT id, condition, fatigue, is_injured, injury_days_left, mental FROM players');

  for (const p of players.rows) {
    let newCondition = p.condition;
    let newFatigue = p.fatigue;

    // 기본 컨디션 변동 (-5 ~ +5 랜덤)
    const conditionChange = Math.floor(Math.random() * 11) - 5;
    // 멘탈이 높을수록 컨디션 안정적
    const mentalBonus = (p.mental - 50) / 100;
    newCondition = Math.max(10, Math.min(100, newCondition + conditionChange + Math.round(mentalBonus * 3)));

    // 피로도 자연 회복 (-5 ~ -15)
    const fatigueRecovery = Math.floor(Math.random() * 11) + 5;
    newFatigue = Math.max(0, newFatigue - fatigueRecovery);

    // 피로도가 높으면 컨디션 하락
    if (newFatigue > 70) {
      newCondition = Math.max(10, newCondition - 10);
    }

    // 부상 회복
    if (p.is_injured && p.injury_days_left > 0) {
      const newDays = p.injury_days_left - 1;
      if (newDays <= 0) {
        // 부상 이력 업데이트 (recovered_at)
        await pool.query(
          `UPDATE injury_history SET recovered_at = NOW()
           WHERE player_id = $1 AND recovered_at IS NULL`,
          [p.id]
        );
        await pool.query(
          `UPDATE players SET condition = $1, fatigue = $2, is_injured = FALSE,
           injury_type = NULL, injury_days_left = 0, injury_body_part = NULL, injury_severity = NULL WHERE id = $3`,
          [Math.max(40, newCondition), 20, p.id]
        );
        continue;
      } else {
        await pool.query(
          'UPDATE players SET injury_days_left = $1 WHERE id = $2',
          [newDays, p.id]
        );
      }
    }

    // 과로에 의한 부상 발생 확률
    if (!p.is_injured && newFatigue > 85 && Math.random() < 0.05) {
      const injuryTable = [
        { type: '근육 경련', body_part: '허벅지', severity: '경미', days: 3 },
        { type: '근육 경련', body_part: '종아리', severity: '경미', days: 4 },
        { type: '염좌', body_part: '발목', severity: '보통', days: 10 },
        { type: '타박상', body_part: '손목', severity: '경미', days: 5 },
        { type: '근육 파열', body_part: '어깨', severity: '심각', days: 30 },
        { type: '인대 손상', body_part: '무릎', severity: '심각', days: 45 },
        { type: '근육통', body_part: '팔꿈치', severity: '경미', days: 7 },
        { type: '피로골절', body_part: '발', severity: '심각', days: 60 },
      ];
      const injury = injuryTable[Math.floor(Math.random() * injuryTable.length)];
      await pool.query(
        `UPDATE players SET is_injured = TRUE, injury_type = $1, injury_days_left = $2,
         injury_body_part = $3, injury_severity = $4, injury_history_count = injury_history_count + 1
         WHERE id = $5`,
        [injury.type, injury.days, injury.body_part, injury.severity, p.id]
      );
      await pool.query(
        `INSERT INTO injury_history (player_id, injury_type, body_part, severity, days_out, occurred_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [p.id, injury.type, injury.body_part, injury.severity, injury.days]
      );
      continue;
    }

    await pool.query(
      'UPDATE players SET condition = $1, fatigue = $2 WHERE id = $3',
      [newCondition, newFatigue, p.id]
    );
  }
}

// 날씨 생성
export async function generateWeather(matchDate: Date): Promise<string> {
  const weathers = ['맑음', '맑음', '맑음', '흐림', '흐림', '비', '바람', '안개'];
  const month = matchDate.getMonth() + 1;

  // 계절별 날씨 가중치
  if (month >= 6 && month <= 8) {
    // 여름
    weathers.push('폭염', '폭염', '비', '비');
  } else if (month >= 11 || month <= 2) {
    // 겨울
    weathers.push('한파', '한파', '눈', '눈');
  }

  return weathers[Math.floor(Math.random() * weathers.length)];
}

// 날씨가 경기에 미치는 영향
export function getWeatherEffects(weather: string) {
  switch (weather) {
    case '비':
      return { contactMod: -5, powerMod: -3, speedMod: -5, fieldingMod: -10, description: '비로 인해 그라운드가 젖어 수비가 불안정합니다' };
    case '바람':
      return { contactMod: -3, powerMod: +5, speedMod: 0, fieldingMod: -3, description: '강풍이 불어 플라이볼에 영향을 줍니다' };
    case '폭염':
      return { contactMod: 0, powerMod: 0, speedMod: -3, fieldingMod: 0, description: '폭염으로 선수 체력 소모가 빠릅니다' };
    case '한파':
      return { contactMod: -3, powerMod: -5, speedMod: -3, fieldingMod: -5, description: '한파로 전체적인 경기력이 저하됩니다' };
    case '안개':
      return { contactMod: -5, powerMod: 0, speedMod: 0, fieldingMod: -5, description: '안개로 시야가 좁아집니다' };
    case '눈':
      return { contactMod: -5, powerMod: -3, speedMod: -8, fieldingMod: -8, description: '눈으로 그라운드 상태가 최악입니다' };
    default:
      return { contactMod: 0, powerMod: 0, speedMod: 0, fieldingMod: 0, description: '좋은 날씨입니다' };
  }
}

// 선수 성장/퇴화 처리 (시즌 종료 시)
export async function processGrowth() {
  const players = await pool.query(
    'SELECT id, grade, potential, growth_rate, experience FROM players'
  );

  for (const p of players.rows) {
    const growthFactor = p.growth_rate;
    const potentialMult = p.potential === 'S' ? 2.0 : p.potential === 'A' ? 1.5 : p.potential === 'B' ? 1.0 : p.potential === 'C' ? 0.7 : 0.4;
    const expBonus = Math.min(p.experience / 500, 1.0);

    // 학년별 성장 차이
    let gradeGrowth: number;
    if (p.grade === 1) {
      gradeGrowth = 1.3; // 1학년: 성장 빠름
    } else if (p.grade === 2) {
      gradeGrowth = 1.0; // 2학년: 보통
    } else {
      gradeGrowth = 0.7; // 3학년: 성장 둔화, 일부 퇴화
    }

    const totalGrowth = Math.round(growthFactor * potentialMult * gradeGrowth * (1 + expBonus));

    // 랜덤 스탯 성장
    const stats = ['contact', 'power', 'eye', 'speed', 'fielding', 'arm_strength', 'arm_accuracy', 'reaction', 'mental'];
    const growCount = Math.min(totalGrowth, 5);

    for (let i = 0; i < growCount; i++) {
      const stat = stats[Math.floor(Math.random() * stats.length)];
      const gain = Math.floor(Math.random() * 3) + 1;
      await pool.query(
        `UPDATE players SET ${stat} = LEAST(${stat} + $1, 100) WHERE id = $2`,
        [gain, p.id]
      );
    }

    // 3학년 일부 스탯 퇴화 확률
    if (p.grade === 3 && Math.random() < 0.3) {
      const decayStat = stats[Math.floor(Math.random() * stats.length)];
      await pool.query(
        `UPDATE players SET ${decayStat} = GREATEST(${decayStat} - 2, 1) WHERE id = $1`,
        [p.id]
      );
    }

    // 경험치 리셋
    await pool.query('UPDATE players SET experience = 0 WHERE id = $1', [p.id]);
  }
}
