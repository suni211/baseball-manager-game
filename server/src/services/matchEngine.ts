import pool from '../database/db';

// =============================================
// 타입 정의
// =============================================

interface BatterStats {
  id: number;
  name: string;
  contact: number;
  power: number;
  eye: number;
  speed: number;
  clutch: number;
  fielding: number;
  arm_strength: number;
  arm_accuracy: number;
  reaction: number;
  mental: number;
  condition: number;
  fatigue: number;
  battingOrder: number;
  position: string;
  skills: Skill[];
  bats: string;
  // 경기 중 누적
  gameStats: BatterGameStats;
}

interface BatterGameStats {
  atBats: number; hits: number; doubles: number; triples: number;
  homeRuns: number; rbi: number; runs: number; walks: number;
  strikeouts: number; stolenBases: number; errors: number;
}

interface PitcherStats {
  id: number;
  name: string;
  velocity: number;
  control_stat: number;
  stamina: number;
  breaking_ball: number;
  mental: number;
  condition: number;
  fatigue: number;
  pitcher_role: string;
  skills: Skill[];
  throws: string;
  // 경기 중 누적
  pitchesThrown: number;
  maxPitches: number;
  inningsPitched: number;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  walksAllowed: number;
  strikeoutsPitched: number;
  homeRunsAllowed: number;
  isAvailable: boolean;
}

interface Skill {
  skill_name: string;
  skill_type: string;
  effect_stat: string;
  effect_value: number;
}

interface Tactics {
  steal_tendency: number;
  bunt_tendency: number;
  hit_and_run: number;
  pitcher_change_threshold: number;
  closer_inning: number;
  defensive_shift: boolean;
  intentional_walk_threshold: number;
  pinch_hitter_threshold: number;
  aggression: number;
}

interface TeamLineup {
  teamId: number;
  teamName: string;
  batters: BatterStats[];
  allBatters: BatterStats[];
  pitchers: PitcherStats[];
  currentPitcherIdx: number;
  currentBatterIdx: number;
  morale: number;
  chemistry: number;
  isHome: boolean;
  tactics: Tactics;
  score: number;
  usedPinchHitters: Set<number>;
}

interface Runner {
  playerId: number;
  name: string;
  speed: number;
  base: number; // 1, 2, 3
}

interface PlayLogEntry {
  inning: number;
  half: '초' | '말';
  atBatNumber: number;
  eventType: string;
  description: string;
  batterId: number | null;
  pitcherId: number | null;
  runnersOn: string;
  outs: number;
  scoreHome: number;
  scoreAway: number;
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  inningsData: { inning: number; half: '초' | '말'; runs: number; hits: number; errors: number; teamId: number }[];
  mvpPlayerId: number;
  battingStats: { playerId: number; teamId: number; stats: BatterGameStats; battingOrder: number; position: string }[];
  pitchingStats: { playerId: number; teamId: number; stats: PitcherStats; isWinner: boolean; isLoser: boolean; isSave: boolean }[];
  playLog: PlayLogEntry[];
  events: string[];
  attendance: number;
  weather: string;
}

// =============================================
// 스킬 효과 적용
// =============================================

function getSkillBonus(skills: Skill[], stat: string): number {
  return skills.filter(s => s.effect_stat === stat).reduce((sum, s) => sum + s.effect_value, 0);
}

function hasSkill(skills: Skill[], name: string): boolean {
  return skills.some(s => s.skill_name === name);
}

// =============================================
// 투수 의무 휴식 체크
// =============================================

async function checkPitcherAvailability(pitcherId: number, matchDate: Date): Promise<boolean> {
  const result = await pool.query(
    `SELECT rest_required_until FROM pitcher_pitch_counts
     WHERE player_id = $1 AND rest_required_until > $2
     ORDER BY rest_required_until DESC LIMIT 1`,
    [pitcherId, matchDate]
  );
  return result.rows.length === 0;
}

function calculateRestDays(pitchesThrown: number): number {
  // 105구 제한 기반 의무 휴식
  if (pitchesThrown >= 95) return 4;
  if (pitchesThrown >= 75) return 3;
  if (pitchesThrown >= 50) return 2;
  if (pitchesThrown >= 30) return 1;
  return 0;
}

// =============================================
// 날씨/관중
// =============================================

function generateMatchWeather(month: number): string {
  const base = ['맑음','맑음','맑음','흐림','흐림','바람'];
  if (month >= 6 && month <= 8) base.push('폭염','비','비');
  else if (month >= 11 || month <= 2) base.push('한파','눈','눈');
  else base.push('맑음','흐림');
  return base[Math.floor(Math.random() * base.length)];
}

function getWeatherMods(weather: string) {
  switch (weather) {
    case '비': return { contact: -5, power: -3, speed: -5, fielding: -10, pitchControl: -5 };
    case '바람': return { contact: -3, power: 5, speed: 0, fielding: -3, pitchControl: -3 };
    case '폭염': return { contact: 0, power: 0, speed: -3, fielding: 0, pitchControl: -2 };
    case '한파': return { contact: -3, power: -5, speed: -3, fielding: -5, pitchControl: -5 };
    case '안개': return { contact: -5, power: 0, speed: 0, fielding: -5, pitchControl: -3 };
    case '눈': return { contact: -5, power: -3, speed: -8, fielding: -8, pitchControl: -5 };
    default: return { contact: 0, power: 0, speed: 0, fielding: 0, pitchControl: 0 };
  }
}

function calculateAttendance(homePopularity: number, awayPopularity: number, stadiumCapacity: number, weather: string): number {
  const baseRate = 0.3 + (homePopularity + awayPopularity) / 400;
  const weatherMult = weather === '비' || weather === '눈' ? 0.4 : weather === '폭염' || weather === '한파' ? 0.6 : 1.0;
  return Math.min(stadiumCapacity, Math.floor(stadiumCapacity * baseRate * weatherMult * (0.8 + Math.random() * 0.4)));
}

// =============================================
// 타석 시뮬레이션 (핵심)
// =============================================

function simulateAtBat(
  batter: BatterStats,
  pitcher: PitcherStats,
  runners: Runner[],
  outs: number,
  inning: number,
  scoreDiff: number,
  tactics: Tactics,
  weather: string
): { outcome: string; description: string; isHit: boolean; bases: number; isWalk: boolean; isStrikeout: boolean; isError: boolean; rbi: number; isBunt: boolean; isHitByPitch: boolean; pitchCount: number } {

  const wMod = getWeatherMods(weather);

  // 스킬 보너스 적용
  const bContact = batter.contact + getSkillBonus(batter.skills, 'contact') + wMod.contact;
  const bPower = batter.power + getSkillBonus(batter.skills, 'power') + wMod.power;
  const bEye = batter.eye + getSkillBonus(batter.skills, 'eye');
  const bSpeed = batter.speed + getSkillBonus(batter.skills, 'speed') + wMod.speed;
  const bClutch = batter.clutch + getSkillBonus(batter.skills, 'clutch');
  const bMental = batter.mental + getSkillBonus(batter.skills, 'mental');

  const pVelocity = pitcher.velocity + getSkillBonus(pitcher.skills, 'velocity');
  const pControl = pitcher.control_stat + getSkillBonus(pitcher.skills, 'control_stat') + wMod.pitchControl;
  const pBreaking = pitcher.breaking_ball + getSkillBonus(pitcher.skills, 'breaking_ball');
  const pMental = pitcher.mental + getSkillBonus(pitcher.skills, 'mental');

  // 컨디션 보정
  const batterCondMult = batter.condition / 100;
  const pitcherCondMult = pitcher.condition / 100;

  // 투구수에 따른 피로
  const pitcherTiredness = Math.max(0, (pitcher.pitchesThrown - 50) / pitcher.maxPitches);
  const pitcherFatigueMult = 1 - pitcherTiredness * 0.35;

  // 클러치 상황 보정 (주자 있고, 접전이면)
  const isClutchSituation = runners.length > 0 && Math.abs(scoreDiff) <= 3;
  const clutchMult = isClutchSituation ? (bClutch / 100) * 0.15 + 0.925 : 1.0;
  // 강심장 스킬
  const mentalClutch = isClutchSituation && hasSkill(batter.skills, '강심장') ? 1.1 : 1.0;

  const batterOverall = (bContact * 0.30 + bPower * 0.20 + bEye * 0.25 + bClutch * 0.15 + bMental * 0.10)
    * batterCondMult * clutchMult * mentalClutch;
  const pitcherOverall = (pVelocity * 0.25 + pControl * 0.30 + pBreaking * 0.25 + pMental * 0.20)
    * pitcherCondMult * pitcherFatigueMult;

  const matchup = batterOverall / (batterOverall + pitcherOverall);

  // 투구 수 (타석당 2~7구)
  const pitchCount = Math.floor(Math.random() * 6) + 2;

  const runnersOnBase = runners.length;
  const roll = Math.random();

  // ---- 번트 작전 ----
  const shouldBunt = tactics.bunt_tendency > 50 && runnersOnBase > 0 && outs < 2
    && batter.battingOrder >= 7 && Math.random() * 100 < tactics.bunt_tendency;
  if (shouldBunt) {
    const buntSuccess = Math.random() < (bContact / 150 + 0.4);
    if (buntSuccess) {
      return {
        outcome: '번트 성공', description: `${batter.name} 희생번트 성공! 주자 진루`,
        isHit: false, bases: 0, isWalk: false, isStrikeout: false, isError: false,
        rbi: 0, isBunt: true, isHitByPitch: false, pitchCount: Math.min(pitchCount, 2)
      };
    } else {
      return {
        outcome: '번트 실패', description: `${batter.name} 번트 실패, 파울`,
        isHit: false, bases: 0, isWalk: false, isStrikeout: false, isError: false,
        rbi: 0, isBunt: true, isHitByPitch: false, pitchCount: Math.min(pitchCount, 3)
      };
    }
  }

  // ---- 몸에 맞는 공 (1.5%) ----
  if (roll < 0.015) {
    return {
      outcome: '몸에맞는공', description: `${batter.name} 몸에 맞는 공으로 출루`,
      isHit: false, bases: 0, isWalk: false, isStrikeout: false, isError: false,
      rbi: runnersOnBase >= 3 ? 1 : 0, isBunt: false, isHitByPitch: true, pitchCount
    };
  }

  // ---- 볼넷 ----
  const walkBase = 0.06;
  const walkChance = walkBase + (bEye / 250) * (1 - pControl / 200) + pitcherTiredness * 0.08;
  if (roll < 0.015 + walkChance) {
    return {
      outcome: '볼넷', description: `${batter.name} 볼넷으로 출루`,
      isHit: false, bases: 0, isWalk: true, isStrikeout: false, isError: false,
      rbi: runnersOnBase >= 3 ? 1 : 0, isBunt: false, isHitByPitch: false, pitchCount
    };
  }

  // ---- 삼진 ----
  const kBase = 0.10;
  const kChance = kBase + (pVelocity / 250 + pBreaking / 300) * pitcherFatigueMult - bContact / 350;
  if (roll < 0.015 + walkChance + Math.max(0.02, kChance)) {
    return {
      outcome: '삼진', description: `${batter.name} 삼진 아웃!`,
      isHit: false, bases: 0, isWalk: false, isStrikeout: true, isError: false,
      rbi: 0, isBunt: false, isHitByPitch: false, pitchCount
    };
  }

  // ---- 안타 판정 ----
  const hitChance = matchup * 0.55;
  if (roll < 0.015 + walkChance + kChance + hitChance) {
    const powerRoll = Math.random();
    const hrChance = (bPower / 600) * 0.9;
    const tripleChance = (bSpeed / 500) * 0.35;
    const doubleChance = (bPower / 350) * 0.55;

    if (powerRoll < hrChance) {
      const rbi = runnersOnBase + 1;
      return {
        outcome: '홈런', description: `${batter.name} 홈런!! ${rbi}타점!`,
        isHit: true, bases: 4, isWalk: false, isStrikeout: false, isError: false,
        rbi, isBunt: false, isHitByPitch: false, pitchCount
      };
    }
    if (powerRoll < hrChance + tripleChance) {
      return {
        outcome: '3루타', description: `${batter.name} 3루타! 공이 외야 깊숙이!`,
        isHit: true, bases: 3, isWalk: false, isStrikeout: false, isError: false,
        rbi: runnersOnBase, isBunt: false, isHitByPitch: false, pitchCount
      };
    }
    if (powerRoll < hrChance + tripleChance + doubleChance) {
      const rbi = Math.min(runnersOnBase, 2);
      return {
        outcome: '2루타', description: `${batter.name} 2루타! 갈라진 외야 사이로!`,
        isHit: true, bases: 2, isWalk: false, isStrikeout: false, isError: false,
        rbi, isBunt: false, isHitByPitch: false, pitchCount
      };
    }
    const rbi = runners.some(r => r.base === 3) && outs < 2 ? 1 : 0;
    return {
      outcome: '안타', description: `${batter.name} 안타! ${rbi > 0 ? `${rbi}타점!` : ''}`,
      isHit: true, bases: 1, isWalk: false, isStrikeout: false, isError: false,
      rbi, isBunt: false, isHitByPitch: false, pitchCount
    };
  }

  // ---- 에러 (3%) ----
  if (Math.random() < 0.03) {
    return {
      outcome: '실책', description: `${batter.name} 타구에 수비 실책! 출루`,
      isHit: false, bases: 1, isWalk: false, isStrikeout: false, isError: true,
      rbi: runners.some(r => r.base === 3) ? 1 : 0, isBunt: false, isHitByPitch: false, pitchCount
    };
  }

  // ---- 아웃 ----
  const outRoll = Math.random();
  // 희생플라이
  if (outRoll < 0.12 && outs < 2 && runners.some(r => r.base === 3)) {
    return {
      outcome: '희생플라이', description: `${batter.name} 희생플라이! 3루 주자 홈인!`,
      isHit: false, bases: 0, isWalk: false, isStrikeout: false, isError: false,
      rbi: 1, isBunt: false, isHitByPitch: false, pitchCount
    };
  }
  // 병살
  if (outRoll < 0.20 && outs < 2 && runnersOnBase > 0 && bSpeed < 50) {
    return {
      outcome: '병살', description: `${batter.name} 땅볼 병살!`,
      isHit: false, bases: -1, isWalk: false, isStrikeout: false, isError: false,
      rbi: 0, isBunt: false, isHitByPitch: false, pitchCount
    };
  }

  const outTypes = ['땅볼 아웃','뜬공 아웃','라인드라이브 아웃','플라이 아웃','내야 플라이 아웃'];
  const outType = outTypes[Math.floor(Math.random() * outTypes.length)];
  return {
    outcome: outType, description: `${batter.name} ${outType}`,
    isHit: false, bases: 0, isWalk: false, isStrikeout: false, isError: false,
    rbi: 0, isBunt: false, isHitByPitch: false, pitchCount
  };
}

// =============================================
// 도루 시도
// =============================================

function attemptSteal(runner: Runner, pitcher: PitcherStats, catcher: BatterStats | null, tactics: Tactics): { success: boolean; description: string } {
  if (Math.random() * 100 > tactics.steal_tendency) return { success: false, description: '' };
  if (runner.speed < 45) return { success: false, description: '' };

  const stealChance = runner.speed / 120 + 0.1 - (catcher ? catcher.arm_strength / 300 : 0);
  const success = Math.random() < stealChance;

  if (success) {
    return { success: true, description: `${runner.name} 도루 성공! ${runner.base}루 → ${runner.base + 1}루` };
  }
  return { success: false, description: `${runner.name} 도루 실패! 태그 아웃!` };
}

// =============================================
// 이닝 시뮬레이션
// =============================================

function simulateHalfInning(
  batting: TeamLineup,
  fielding: TeamLineup,
  inning: number,
  half: '초' | '말',
  matchId: number,
  playLog: PlayLogEntry[],
  atBatCounter: { count: number }
): { runs: number; hits: number; errors: number } {

  let outs = 0;
  let runs = 0;
  let hits = 0;
  let errors = 0;
  let runners: Runner[] = [];

  const pitcher = fielding.pitchers[fielding.currentPitcherIdx];

  while (outs < 3) {
    const batter = batting.batters[batting.currentBatterIdx];
    const scoreDiff = batting.score - fielding.score;

    atBatCounter.count++;

    // ---- 히트앤런 작전 ----
    const isHitAndRun = batting.tactics.hit_and_run > 30 && runners.length > 0 && outs < 2
      && Math.random() * 100 < batting.tactics.hit_and_run;

    // ---- 고의사구 ----
    const shouldIBB = fielding.tactics.intentional_walk_threshold < 100
      && batter.power > fielding.tactics.intentional_walk_threshold
      && runners.length < 3 && !runners.some(r => r.base === 1)
      && outs < 2;
    if (shouldIBB) {
      batter.gameStats.walks++;
      pitcher.walksAllowed++;
      pitcher.pitchesThrown += 4;
      runners.push({ playerId: batter.id, name: batter.name, speed: batter.speed, base: 1 });

      // 만루 밀어내기 체크
      if (runners.length > 3) {
        const scored = advanceRunners(runners, 1);
        runs += scored;
        batter.gameStats.rbi += scored;
      }

      playLog.push({
        inning, half, atBatNumber: atBatCounter.count,
        eventType: '고의사구',
        description: `${batter.name}에게 고의사구`,
        batterId: batter.id, pitcherId: pitcher.id,
        runnersOn: runners.map(r => `${r.name}(${r.base}루)`).join(', '),
        outs, scoreHome: half === '말' ? batting.score + runs : fielding.score,
        scoreAway: half === '초' ? batting.score + runs : fielding.score
      });

      batting.currentBatterIdx = (batting.currentBatterIdx + 1) % 9;
      continue;
    }

    // ---- 대타 체크 ----
    const shouldPinchHit = batting.tactics.pinch_hitter_threshold < 100
      && inning >= 7 && Math.abs(scoreDiff) <= 2
      && batter.contact < batting.tactics.pinch_hitter_threshold
      && runners.length > 0 && !batting.usedPinchHitters.has(batting.currentBatterIdx);

    if (shouldPinchHit) {
      const bench = batting.allBatters.filter(b =>
        !batting.batters.includes(b) && !b.skills.length // 벤치에서 가장 좋은 타자
        && b.contact > batter.contact
      );
      if (bench.length > 0) {
        const pinchHitter = bench.sort((a, b) => b.contact + b.power - a.contact - a.power)[0];
        batting.batters[batting.currentBatterIdx] = pinchHitter;
        batting.usedPinchHitters.add(batting.currentBatterIdx);
        playLog.push({
          inning, half, atBatNumber: atBatCounter.count,
          eventType: '대타',
          description: `대타! ${pinchHitter.name}이(가) ${batter.name} 대신 타석에!`,
          batterId: pinchHitter.id, pitcherId: pitcher.id,
          runnersOn: runners.map(r => `${r.name}(${r.base}루)`).join(', '),
          outs, scoreHome: 0, scoreAway: 0
        });
        continue; // 다시 타석 진행
      }
    }

    // ---- 타석 시뮬레이션 ----
    const result = simulateAtBat(
      batter, pitcher, runners, outs, inning, scoreDiff,
      batting.tactics, '맑음'
    );

    pitcher.pitchesThrown += result.pitchCount;

    // ---- 결과 처리 ----
    if (result.isBunt) {
      if (result.outcome === '번트 성공') {
        // 주자 진루, 타자 아웃
        outs++;
        for (const r of runners) r.base = Math.min(r.base + 1, 3);
        const scored = runners.filter(r => r.base > 3).length;
        runners = runners.filter(r => r.base <= 3);
        runs += scored;
        batter.gameStats.atBats++;
      } else {
        // 번트 실패 - 스트라이크 추가, 다시 타석 (간단히 아웃 처리)
        batter.gameStats.atBats++;
        outs++;
      }
    } else if (result.isWalk || result.isHitByPitch) {
      batter.gameStats.walks++;
      pitcher.walksAllowed++;
      // 주자 밀어내기
      runners.push({ playerId: batter.id, name: batter.name, speed: batter.speed, base: 1 });
      const scored = advanceRunnersForWalk(runners);
      runs += scored;
      batter.gameStats.rbi += result.rbi;
    } else if (result.isHit) {
      batter.gameStats.atBats++;
      batter.gameStats.hits++;
      hits++;
      pitcher.hitsAllowed++;

      if (result.bases === 4) {
        // 홈런 - 모든 주자 + 타자 홈인
        runs += runners.length + 1;
        batter.gameStats.homeRuns++;
        batter.gameStats.rbi += result.rbi;
        batter.gameStats.runs++;
        for (const r of runners) {
          const rb = batting.batters.find(b => b.id === r.playerId) || batting.allBatters.find(b => b.id === r.playerId);
          if (rb) rb.gameStats.runs++;
        }
        pitcher.homeRunsAllowed++;
        runners = [];
      } else if (result.bases === 3) {
        batter.gameStats.triples++;
        const scored = runners.length;
        runs += scored;
        batter.gameStats.rbi += result.rbi;
        for (const r of runners) {
          const rb = batting.batters.find(b => b.id === r.playerId) || batting.allBatters.find(b => b.id === r.playerId);
          if (rb) rb.gameStats.runs++;
        }
        runners = [{ playerId: batter.id, name: batter.name, speed: batter.speed, base: 3 }];
      } else if (result.bases === 2) {
        batter.gameStats.doubles++;
        const scored = advanceRunners(runners, 2);
        runs += scored;
        batter.gameStats.rbi += result.rbi;
        runners.push({ playerId: batter.id, name: batter.name, speed: batter.speed, base: 2 });
      } else {
        // 안타
        const scored = advanceRunners(runners, 1);
        runs += scored;
        batter.gameStats.rbi += result.rbi;
        runners.push({ playerId: batter.id, name: batter.name, speed: batter.speed, base: 1 });
      }
    } else if (result.isStrikeout) {
      batter.gameStats.atBats++;
      batter.gameStats.strikeouts++;
      pitcher.strikeoutsPitched++;
      outs++;
    } else if (result.isError) {
      batter.gameStats.atBats++;
      batter.gameStats.errors++;
      errors++;
      const scored = advanceRunners(runners, 1);
      runs += scored;
      batter.gameStats.rbi += result.rbi;
      runners.push({ playerId: batter.id, name: batter.name, speed: batter.speed, base: 1 });
    } else if (result.outcome === '병살') {
      batter.gameStats.atBats++;
      outs += 2;
      if (runners.length > 0) runners.pop(); // 선두 주자 아웃
    } else if (result.outcome === '희생플라이') {
      batter.gameStats.atBats++;
      outs++;
      runs += result.rbi;
      batter.gameStats.rbi += result.rbi;
      runners = runners.filter(r => r.base !== 3);
    } else {
      // 일반 아웃
      batter.gameStats.atBats++;
      outs++;
    }

    pitcher.runsAllowed += result.rbi > 0 ? result.rbi : 0;
    pitcher.earnedRuns += (result.isError ? 0 : (result.rbi > 0 ? result.rbi : 0));

    // 로그 기록
    playLog.push({
      inning, half, atBatNumber: atBatCounter.count,
      eventType: result.outcome,
      description: result.description,
      batterId: batter.id, pitcherId: pitcher.id,
      runnersOn: runners.map(r => `${r.name}(${r.base}루)`).join(', '),
      outs: Math.min(outs, 3),
      scoreHome: half === '말' ? batting.score + runs : fielding.score,
      scoreAway: half === '초' ? batting.score + runs : fielding.score
    });

    // ---- 도루 시도 ----
    if (runners.length > 0 && outs < 3) {
      const stealCandidate = runners.find(r => r.base < 3 && r.speed >= 50);
      if (stealCandidate) {
        const catcher = fielding.batters.find(b => b.position === '포수');
        const steal = attemptSteal(stealCandidate, pitcher, catcher || null, batting.tactics);
        if (steal.description) {
          if (steal.success) {
            stealCandidate.base++;
            const sb = batting.batters.find(b => b.id === stealCandidate.playerId);
            if (sb) sb.gameStats.stolenBases++;
            // 홈 도루
            if (stealCandidate.base > 3) {
              runs++;
              runners = runners.filter(r => r.playerId !== stealCandidate.playerId);
            }
          } else {
            outs++;
            runners = runners.filter(r => r.playerId !== stealCandidate.playerId);
          }
          playLog.push({
            inning, half, atBatNumber: atBatCounter.count,
            eventType: steal.success ? '도루성공' : '도루실패',
            description: steal.description,
            batterId: stealCandidate.playerId, pitcherId: pitcher.id,
            runnersOn: runners.map(r => `${r.name}(${r.base}루)`).join(', '),
            outs: Math.min(outs, 3),
            scoreHome: half === '말' ? batting.score + runs : fielding.score,
            scoreAway: half === '초' ? batting.score + runs : fielding.score
          });
        }
      }
    }

    // 히트앤런 효과: 안타 시 주자 추가 진루
    if (isHitAndRun && result.isHit && result.bases === 1) {
      for (const r of runners) {
        if (r.base < 3) r.base++;
      }
    }

    // 주자 정리 (4루 이상 = 홈인)
    const scoredRunners = runners.filter(r => r.base > 3);
    runs += scoredRunners.length;
    runners = runners.filter(r => r.base <= 3);

    batting.currentBatterIdx = (batting.currentBatterIdx + 1) % 9;

    // ---- 투수 교체 체크 ----
    if (outs < 3) {
      const shouldChangePitcher = checkPitcherChange(fielding, pitcher, inning, runs);
      if (shouldChangePitcher && fielding.currentPitcherIdx < fielding.pitchers.length - 1) {
        pitcher.inningsPitched += (3 - (3 - outs)) / 3; // 대략적 이닝
        fielding.currentPitcherIdx++;
        const newPitcher = fielding.pitchers[fielding.currentPitcherIdx];
        playLog.push({
          inning, half, atBatNumber: atBatCounter.count,
          eventType: '투수교체',
          description: `투수 교체! ${pitcher.name} → ${newPitcher.name}`,
          batterId: null, pitcherId: newPitcher.id,
          runnersOn: runners.map(r => `${r.name}(${r.base}루)`).join(', '),
          outs,
          scoreHome: half === '말' ? batting.score + runs : fielding.score,
          scoreAway: half === '초' ? batting.score + runs : fielding.score
        });
      }
    }
  }

  pitcher.inningsPitched += 1;

  return { runs, hits, errors };
}

// =============================================
// 투수 교체 판단
// =============================================

function checkPitcherChange(team: TeamLineup, pitcher: PitcherStats, inning: number, runsThisInning: number): boolean {
  // 105구 제한 도달
  if (pitcher.pitchesThrown >= 105) return true;
  // 전술 설정 기반
  if (pitcher.pitchesThrown >= team.tactics.pitcher_change_threshold) return true;
  // 마무리 등판 이닝
  if (inning >= team.tactics.closer_inning && pitcher.pitcher_role !== '마무리') {
    const closer = team.pitchers.find(p => p.pitcher_role === '마무리' && p.isAvailable && team.pitchers.indexOf(p) > team.currentPitcherIdx);
    if (closer) return true;
  }
  // 이닝 폭발 (3실점 이상)
  if (runsThisInning >= 3) return true;
  // 체력 소진
  if (pitcher.pitchesThrown > pitcher.stamina * 1.2) return true;

  return false;
}

// =============================================
// 주자 진루 헬퍼
// =============================================

function advanceRunners(runners: Runner[], bases: number): number {
  let scored = 0;
  for (const r of runners) {
    r.base += bases;
    if (r.base > 3) scored++;
  }
  runners.splice(0, runners.length, ...runners.filter(r => r.base <= 3));
  return scored;
}

function advanceRunnersForWalk(runners: Runner[]): number {
  let scored = 0;
  // 볼넷: 뒤에서부터 밀어내기
  const bases = [false, false, false, false]; // 0~3
  for (const r of runners) bases[r.base] = true;

  if (bases[1] && bases[2] && bases[3]) {
    scored = 1; // 만루 밀어내기
    runners.forEach(r => {
      if (r.base === 3) r.base = 4;
      else r.base++;
    });
  } else if (bases[1] && bases[2]) {
    runners.forEach(r => { if (r.base >= 1) r.base++; });
  } else if (bases[1]) {
    runners.forEach(r => { if (r.base === 1) r.base = 2; });
  }

  const scoredRunners = runners.filter(r => r.base > 3);
  scored += scoredRunners.length;
  runners.splice(0, runners.length, ...runners.filter(r => r.base <= 3));
  return scored;
}

// =============================================
// 메인 경기 시뮬레이션
// =============================================

export async function simulateMatch(matchId: number): Promise<MatchResult> {
  const match = await pool.query(
    `SELECT m.*, ht.name as home_name, at.name as away_name,
            ht.morale as home_morale, ht.chemistry as home_chemistry,
            ht.popularity as home_pop, at.popularity as away_pop,
            at.morale as away_morale, at.chemistry as away_chemistry,
            s.capacity as stadium_capacity
     FROM matches m
     JOIN teams ht ON m.home_team_id = ht.id
     JOIN teams at ON m.away_team_id = at.id
     LEFT JOIN stadiums s ON ht.stadium_id = s.id
     WHERE m.id = $1`,
    [matchId]
  );
  if (match.rows.length === 0) throw new Error('경기를 찾을 수 없습니다');
  const m = match.rows[0];

  const matchDate = new Date(m.match_date || Date.now());
  const weather = generateMatchWeather(matchDate.getMonth() + 1);
  const attendance = calculateAttendance(m.home_pop || 10, m.away_pop || 10, m.stadium_capacity || 500, weather);

  // 양 팀 로드
  const homeLineup = await loadTeamLineup(m.home_team_id, m.home_name, m.home_morale, m.home_chemistry, true, matchDate);
  const awayLineup = await loadTeamLineup(m.away_team_id, m.away_name, m.away_morale, m.away_chemistry, false, matchDate);

  const playLog: PlayLogEntry[] = [];
  const inningsData: MatchResult['inningsData'] = [];
  const allEvents: string[] = [];
  const atBatCounter = { count: 0 };

  playLog.push({
    inning: 0, half: '초', atBatNumber: 0, eventType: '경기시작',
    description: `${m.away_name} vs ${m.home_name} | 날씨: ${weather} | 관중: ${attendance}명`,
    batterId: null, pitcherId: null, runnersOn: '', outs: 0,
    scoreHome: 0, scoreAway: 0
  });

  // ---- 9이닝 진행 ----
  let maxInnings = 12; // 연장 최대 12회

  for (let inning = 1; inning <= maxInnings; inning++) {
    // --- 초 (원정 공격) ---
    playLog.push({
      inning, half: '초', atBatNumber: atBatCounter.count, eventType: '이닝시작',
      description: `━━━ ${inning}회 초 ━━━ ${m.away_name} 공격`,
      batterId: null, pitcherId: homeLineup.pitchers[homeLineup.currentPitcherIdx].id,
      runnersOn: '', outs: 0,
      scoreHome: homeLineup.score, scoreAway: awayLineup.score
    });

    const topResult = simulateHalfInning(awayLineup, homeLineup, inning, '초', matchId, playLog, atBatCounter);
    awayLineup.score += topResult.runs;
    inningsData.push({ inning, half: '초', runs: topResult.runs, hits: topResult.hits, errors: topResult.errors, teamId: m.away_team_id });
    allEvents.push(`${inning}회초: ${m.away_name} ${topResult.runs}점`);

    // --- 말 (홈 공격) ---
    // 9회말 이후, 홈팀 리드면 생략
    if (inning >= 9 && homeLineup.score > awayLineup.score) {
      inningsData.push({ inning, half: '말', runs: 0, hits: 0, errors: 0, teamId: m.home_team_id });
      break;
    }

    playLog.push({
      inning, half: '말', atBatNumber: atBatCounter.count, eventType: '이닝시작',
      description: `━━━ ${inning}회 말 ━━━ ${m.home_name} 공격`,
      batterId: null, pitcherId: awayLineup.pitchers[awayLineup.currentPitcherIdx].id,
      runnersOn: '', outs: 0,
      scoreHome: homeLineup.score, scoreAway: awayLineup.score
    });

    const bottomResult = simulateHalfInning(homeLineup, awayLineup, inning, '말', matchId, playLog, atBatCounter);
    homeLineup.score += bottomResult.runs;
    inningsData.push({ inning, half: '말', runs: bottomResult.runs, hits: bottomResult.hits, errors: bottomResult.errors, teamId: m.home_team_id });
    allEvents.push(`${inning}회말: ${m.home_name} ${bottomResult.runs}점`);

    // 끝내기 체크
    if (inning >= 9 && homeLineup.score > awayLineup.score) {
      playLog.push({
        inning, half: '말', atBatNumber: atBatCounter.count, eventType: '끝내기',
        description: `${m.home_name} 끝내기 승리!`,
        batterId: null, pitcherId: null, runnersOn: '', outs: 3,
        scoreHome: homeLineup.score, scoreAway: awayLineup.score
      });
      break;
    }

    // 9회 이후 동점이 아니면 종료
    if (inning >= 9 && homeLineup.score !== awayLineup.score) break;
    // 동점이면 연장
    if (inning === 9 && homeLineup.score === awayLineup.score) {
      playLog.push({
        inning, half: '말', atBatNumber: atBatCounter.count, eventType: '연장',
        description: `${homeLineup.score} - ${awayLineup.score} 동점! 연장전 돌입!`,
        batterId: null, pitcherId: null, runnersOn: '', outs: 3,
        scoreHome: homeLineup.score, scoreAway: awayLineup.score
      });
      maxInnings = 12;
    }
  }

  // ---- 경기 종료 처리 ----
  const homeScore = homeLineup.score;
  const awayScore = awayLineup.score;

  playLog.push({
    inning: 0, half: '말', atBatNumber: atBatCounter.count, eventType: '경기종료',
    description: `경기 종료! ${m.away_name} ${awayScore} - ${homeScore} ${m.home_name}`,
    batterId: null, pitcherId: null, runnersOn: '', outs: 0,
    scoreHome: homeScore, scoreAway: awayScore
  });

  // 승/패 투수 결정
  const winTeamPitchers = homeScore > awayScore ? homeLineup.pitchers : awayLineup.pitchers;
  const loseTeamPitchers = homeScore > awayScore ? awayLineup.pitchers : homeLineup.pitchers;
  const winnerPitcher = winTeamPitchers.find(p => p.inningsPitched > 0) || winTeamPitchers[0];
  const loserPitcher = loseTeamPitchers.find(p => p.runsAllowed > 0) || loseTeamPitchers[0];
  // 세이브: 마지막 투수가 3이닝 이내 리드 지킴
  const lastWinPitcher = winTeamPitchers[winTeamPitchers.filter(p => p.inningsPitched > 0).length - 1];
  const isSave = lastWinPitcher && lastWinPitcher !== winnerPitcher && lastWinPitcher.inningsPitched <= 3;

  // 타격 스탯 수집
  const allBatters = [...homeLineup.batters, ...homeLineup.allBatters, ...awayLineup.batters, ...awayLineup.allBatters];
  const uniqueBatters = new Map<number, { player: BatterStats; teamId: number }>();
  for (const b of [...homeLineup.batters, ...homeLineup.allBatters]) {
    if (!uniqueBatters.has(b.id) && (b.gameStats.atBats > 0 || b.gameStats.walks > 0)) {
      uniqueBatters.set(b.id, { player: b, teamId: homeLineup.teamId });
    }
  }
  for (const b of [...awayLineup.batters, ...awayLineup.allBatters]) {
    if (!uniqueBatters.has(b.id) && (b.gameStats.atBats > 0 || b.gameStats.walks > 0)) {
      uniqueBatters.set(b.id, { player: b, teamId: awayLineup.teamId });
    }
  }

  const battingStats = Array.from(uniqueBatters.values()).map(({ player, teamId }) => ({
    playerId: player.id, teamId, stats: player.gameStats, battingOrder: player.battingOrder, position: player.position
  }));

  const allPitchers = [
    ...homeLineup.pitchers.filter(p => p.pitchesThrown > 0).map(p => ({ ...p, teamId: homeLineup.teamId })),
    ...awayLineup.pitchers.filter(p => p.pitchesThrown > 0).map(p => ({ ...p, teamId: awayLineup.teamId }))
  ];

  const pitchingStats = allPitchers.map(p => ({
    playerId: p.id, teamId: p.teamId, stats: p,
    isWinner: p.id === winnerPitcher?.id && homeScore !== awayScore,
    isLoser: p.id === loserPitcher?.id && homeScore !== awayScore,
    isSave: isSave && p.id === lastWinPitcher?.id
  }));

  // MVP: 가장 높은 rbi + hits
  let mvpId = battingStats.length > 0
    ? battingStats.sort((a, b) => (b.stats.rbi + b.stats.hits * 2 + b.stats.homeRuns * 3) - (a.stats.rbi + a.stats.hits * 2 + a.stats.homeRuns * 3))[0]?.playerId
    : homeLineup.batters[0]?.id || 0;

  // ---- DB 저장 ----
  await saveMatchResult(matchId, m, homeScore, awayScore, weather, attendance, mvpId, inningsData, battingStats, pitchingStats, playLog);

  // ---- 시즌 스탯 누적 ----
  await updateSeasonStats(m.season_id, battingStats, pitchingStats);

  // ---- 투수 의무 휴식 기록 ----
  for (const p of [...homeLineup.pitchers, ...awayLineup.pitchers]) {
    if (p.pitchesThrown > 0) {
      const restDays = calculateRestDays(p.pitchesThrown);
      const restUntil = new Date(matchDate);
      restUntil.setDate(restUntil.getDate() + restDays);
      await pool.query(
        `INSERT INTO pitcher_pitch_counts (player_id, match_id, tournament_id, pitches_thrown, match_date, rest_required_until)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [p.id, matchId, m.tournament_id, p.pitchesThrown, matchDate, restUntil]
      );
    }
  }

  // ---- 대회 순위(tournament_teams) 업데이트 ----
  if (m.tournament_id) {
    if (homeScore > awayScore) {
      await pool.query(
        `UPDATE tournament_teams SET wins = wins + 1, runs_scored = runs_scored + $1, runs_allowed = runs_allowed + $2
         WHERE tournament_id = $3 AND team_id = $4`,
        [homeScore, awayScore, m.tournament_id, m.home_team_id]
      );
      await pool.query(
        `UPDATE tournament_teams SET losses = losses + 1, runs_scored = runs_scored + $1, runs_allowed = runs_allowed + $2
         WHERE tournament_id = $3 AND team_id = $4`,
        [awayScore, homeScore, m.tournament_id, m.away_team_id]
      );
    } else if (awayScore > homeScore) {
      await pool.query(
        `UPDATE tournament_teams SET wins = wins + 1, runs_scored = runs_scored + $1, runs_allowed = runs_allowed + $2
         WHERE tournament_id = $3 AND team_id = $4`,
        [awayScore, homeScore, m.tournament_id, m.away_team_id]
      );
      await pool.query(
        `UPDATE tournament_teams SET losses = losses + 1, runs_scored = runs_scored + $1, runs_allowed = runs_allowed + $2
         WHERE tournament_id = $3 AND team_id = $4`,
        [homeScore, awayScore, m.tournament_id, m.home_team_id]
      );
    } else {
      // 무승부
      await pool.query(
        `UPDATE tournament_teams SET draws = draws + 1, runs_scored = runs_scored + $1, runs_allowed = runs_allowed + $2
         WHERE tournament_id = $3 AND team_id = $4`,
        [homeScore, awayScore, m.tournament_id, m.home_team_id]
      );
      await pool.query(
        `UPDATE tournament_teams SET draws = draws + 1, runs_scored = runs_scored + $1, runs_allowed = runs_allowed + $2
         WHERE tournament_id = $3 AND team_id = $4`,
        [awayScore, homeScore, m.tournament_id, m.away_team_id]
      );
    }
  }

  // ---- 팀 사기/인기도 업데이트 ----
  await updateTeamMorale(m.home_team_id, m.away_team_id, homeScore, awayScore, attendance);

  // ---- 선수 피로도/컨디션 ----
  await pool.query(
    `UPDATE players SET fatigue = LEAST(fatigue + 15, 100), condition = GREATEST(condition - 5, 10)
     WHERE team_id IN ($1, $2) AND roster_status = '선발로스터'`,
    [m.home_team_id, m.away_team_id]
  );

  // 관중 수입
  const ticketIncome = attendance * 500; // 500원/명
  await pool.query('UPDATE teams SET budget = budget + $1 WHERE id = $2', [ticketIncome, m.home_team_id]);
  await pool.query(
    `INSERT INTO financial_transactions (team_id, type, amount, description) VALUES ($1, '관중수입', $2, $3)`,
    [m.home_team_id, ticketIncome, `vs ${m.away_name} 관중 ${attendance}명`]
  );

  return {
    homeScore, awayScore, inningsData, mvpPlayerId: mvpId,
    battingStats, pitchingStats, playLog, events: allEvents,
    attendance, weather
  };
}

// =============================================
// DB 저장
// =============================================

async function saveMatchResult(
  matchId: number, m: any, homeScore: number, awayScore: number,
  weather: string, attendance: number, mvpId: number,
  inningsData: any[], battingStats: any[], pitchingStats: any[],
  playLog: PlayLogEntry[]
) {
  // 경기 결과
  await pool.query(
    `UPDATE matches SET status = '완료', home_score = $1, away_score = $2,
     innings_played = $3, weather = $4, attendance = $5, mvp_player_id = $6, completed_at = NOW()
     WHERE id = $7`,
    [homeScore, awayScore, Math.ceil(inningsData.length / 2), weather, attendance, mvpId, matchId]
  );

  // 이닝 기록
  for (const inn of inningsData) {
    await pool.query(
      `INSERT INTO match_innings (match_id, inning, half, runs, hits, errors, team_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [matchId, inn.inning, inn.half, inn.runs, inn.hits, inn.errors, inn.teamId]
    );
  }

  // 타자 기록
  for (const bs of battingStats) {
    await pool.query(
      `INSERT INTO match_batting_stats (match_id, player_id, team_id, batting_order, position,
       at_bats, hits, doubles, triples, home_runs, rbi, runs, walks, strikeouts, stolen_bases, errors_committed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [matchId, bs.playerId, bs.teamId, bs.battingOrder, bs.position,
       bs.stats.atBats, bs.stats.hits, bs.stats.doubles, bs.stats.triples,
       bs.stats.homeRuns, bs.stats.rbi, bs.stats.runs, bs.stats.walks,
       bs.stats.strikeouts, bs.stats.stolenBases, bs.stats.errors]
    );
  }

  // 투수 기록
  for (const ps of pitchingStats) {
    await pool.query(
      `INSERT INTO match_pitching_stats (match_id, player_id, team_id,
       innings_pitched, pitches_thrown, hits_allowed, runs_allowed, earned_runs,
       walks_allowed, strikeouts_pitched, home_runs_allowed, is_winner, is_loser, is_save)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [matchId, ps.playerId, ps.teamId,
       ps.stats.inningsPitched, ps.stats.pitchesThrown, ps.stats.hitsAllowed,
       ps.stats.runsAllowed, ps.stats.earnedRuns, ps.stats.walksAllowed,
       ps.stats.strikeoutsPitched, ps.stats.homeRunsAllowed,
       ps.isWinner, ps.isLoser, ps.isSave]
    );
  }

  // 실시간 로그
  for (const log of playLog) {
    await pool.query(
      `INSERT INTO match_play_log (match_id, inning, half, at_bat_number, event_type,
       description, batter_id, pitcher_id, runners_on, outs, score_home, score_away)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [matchId, log.inning, log.half, log.atBatNumber, log.eventType,
       log.description, log.batterId, log.pitcherId, log.runnersOn,
       log.outs, log.scoreHome, log.scoreAway]
    );
  }
}

// =============================================
// 시즌 스탯 누적
// =============================================

async function updateSeasonStats(seasonId: number, battingStats: any[], pitchingStats: any[]) {
  if (!seasonId) return;

  for (const bs of battingStats) {
    // UPSERT 시즌 타격 스탯
    await pool.query(
      `INSERT INTO season_batting_stats (player_id, season_id, team_id, games, at_bats, hits, doubles, triples, home_runs, rbi, runs, walks, strikeouts, stolen_bases)
       VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (player_id, season_id) DO UPDATE SET
         games = season_batting_stats.games + 1,
         at_bats = season_batting_stats.at_bats + $4,
         hits = season_batting_stats.hits + $5,
         doubles = season_batting_stats.doubles + $6,
         triples = season_batting_stats.triples + $7,
         home_runs = season_batting_stats.home_runs + $8,
         rbi = season_batting_stats.rbi + $9,
         runs = season_batting_stats.runs + $10,
         walks = season_batting_stats.walks + $11,
         strikeouts = season_batting_stats.strikeouts + $12,
         stolen_bases = season_batting_stats.stolen_bases + $13`,
      [bs.playerId, seasonId, bs.teamId,
       bs.stats.atBats, bs.stats.hits, bs.stats.doubles, bs.stats.triples,
       bs.stats.homeRuns, bs.stats.rbi, bs.stats.runs, bs.stats.walks,
       bs.stats.strikeouts, bs.stats.stolenBases]
    );

    // 타율/출루율/장타율/OPS 재계산
    await pool.query(
      `UPDATE season_batting_stats SET
         batting_avg = CASE WHEN at_bats > 0 THEN ROUND(hits::numeric / at_bats, 3) ELSE 0 END,
         obp = CASE WHEN (at_bats + walks) > 0 THEN ROUND((hits + walks)::numeric / (at_bats + walks), 3) ELSE 0 END,
         slg = CASE WHEN at_bats > 0 THEN ROUND(
           ((hits - doubles - triples - home_runs) + doubles * 2 + triples * 3 + home_runs * 4)::numeric / at_bats, 3
         ) ELSE 0 END,
         ops = CASE WHEN at_bats > 0 THEN ROUND(
           (CASE WHEN (at_bats + walks) > 0 THEN (hits + walks)::numeric / (at_bats + walks) ELSE 0 END) +
           (((hits - doubles - triples - home_runs) + doubles * 2 + triples * 3 + home_runs * 4)::numeric / at_bats), 3
         ) ELSE 0 END
       WHERE player_id = $1 AND season_id = $2`,
      [bs.playerId, seasonId]
    );
  }

  for (const ps of pitchingStats) {
    await pool.query(
      `INSERT INTO season_pitching_stats (player_id, season_id, team_id, games, games_started, wins, losses, saves,
       innings_pitched, pitches_total, hits_allowed, runs_allowed, earned_runs, walks_allowed, strikeouts_pitched, home_runs_allowed)
       VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (player_id, season_id) DO UPDATE SET
         games = season_pitching_stats.games + 1,
         games_started = season_pitching_stats.games_started + $4,
         wins = season_pitching_stats.wins + $5,
         losses = season_pitching_stats.losses + $6,
         saves = season_pitching_stats.saves + $7,
         innings_pitched = season_pitching_stats.innings_pitched + $8,
         pitches_total = season_pitching_stats.pitches_total + $9,
         hits_allowed = season_pitching_stats.hits_allowed + $10,
         runs_allowed = season_pitching_stats.runs_allowed + $11,
         earned_runs = season_pitching_stats.earned_runs + $12,
         walks_allowed = season_pitching_stats.walks_allowed + $13,
         strikeouts_pitched = season_pitching_stats.strikeouts_pitched + $14,
         home_runs_allowed = season_pitching_stats.home_runs_allowed + $15`,
      [ps.playerId, seasonId, ps.teamId,
       ps.stats.pitcher_role === '선발' ? 1 : 0,
       ps.isWinner ? 1 : 0, ps.isLoser ? 1 : 0, ps.isSave ? 1 : 0,
       ps.stats.inningsPitched, ps.stats.pitchesThrown,
       ps.stats.hitsAllowed, ps.stats.runsAllowed, ps.stats.earnedRuns,
       ps.stats.walksAllowed, ps.stats.strikeoutsPitched, ps.stats.homeRunsAllowed]
    );

    // ERA / WHIP 재계산
    await pool.query(
      `UPDATE season_pitching_stats SET
         era = CASE WHEN innings_pitched > 0 THEN ROUND(earned_runs::numeric / innings_pitched * 9, 2) ELSE 0 END,
         whip = CASE WHEN innings_pitched > 0 THEN ROUND((walks_allowed + hits_allowed)::numeric / innings_pitched, 2) ELSE 0 END
       WHERE player_id = $1 AND season_id = $2`,
      [ps.playerId, seasonId]
    );
  }
}

// =============================================
// 팀 사기/인기도 업데이트
// =============================================

async function updateTeamMorale(homeTeamId: number, awayTeamId: number, homeScore: number, awayScore: number, attendance: number) {
  if (homeScore > awayScore) {
    await pool.query('UPDATE teams SET morale = LEAST(morale + 5, 100), popularity = LEAST(popularity + 1, 100) WHERE id = $1', [homeTeamId]);
    await pool.query('UPDATE teams SET morale = GREATEST(morale - 3, 0) WHERE id = $1', [awayTeamId]);
  } else if (awayScore > homeScore) {
    await pool.query('UPDATE teams SET morale = LEAST(morale + 5, 100), popularity = LEAST(popularity + 1, 100) WHERE id = $1', [awayTeamId]);
    await pool.query('UPDATE teams SET morale = GREATEST(morale - 3, 0) WHERE id = $1', [homeTeamId]);
  }
  // 관중 많으면 인기도 추가
  if (attendance > 300) {
    await pool.query('UPDATE teams SET popularity = LEAST(popularity + 1, 100) WHERE id IN ($1, $2)', [homeTeamId, awayTeamId]);
  }
}

// =============================================
// 라인업 로드
// =============================================

async function loadTeamLineup(teamId: number, teamName: string, morale: number, chemistry: number, isHome: boolean, matchDate: Date): Promise<TeamLineup> {
  // 전술 로드
  const tacticsResult = await pool.query('SELECT * FROM team_tactics WHERE team_id = $1', [teamId]);
  const tactics: Tactics = tacticsResult.rows[0] || {
    steal_tendency: 50, bunt_tendency: 30, hit_and_run: 20,
    pitcher_change_threshold: 80, closer_inning: 9, defensive_shift: false,
    intentional_walk_threshold: 80, pinch_hitter_threshold: 70, aggression: 50
  };

  // 야수 (타순이 있는 9명)
  const battersResult = await pool.query(
    `SELECT p.*, COALESCE(
       (SELECT json_agg(json_build_object('skill_name', ps.skill_name, 'skill_type', ps.skill_type, 'effect_stat', ps.effect_stat, 'effect_value', ps.effect_value))
        FROM player_skills ps WHERE ps.player_id = p.id AND ps.is_active = TRUE), '[]'
     ) as skills
     FROM players p
     WHERE p.team_id = $1 AND p.roster_status = '선발로스터' AND p.is_pitcher = FALSE AND p.batting_order IS NOT NULL AND p.is_injured = FALSE
     ORDER BY p.batting_order`,
    [teamId]
  );

  // 전체 벤치 포함 야수
  const allBattersResult = await pool.query(
    `SELECT p.*, COALESCE(
       (SELECT json_agg(json_build_object('skill_name', ps.skill_name, 'skill_type', ps.skill_type, 'effect_stat', ps.effect_stat, 'effect_value', ps.effect_value))
        FROM player_skills ps WHERE ps.player_id = p.id AND ps.is_active = TRUE), '[]'
     ) as skills
     FROM players p
     WHERE p.team_id = $1 AND p.is_pitcher = FALSE AND p.is_injured = FALSE
     ORDER BY (p.contact + p.power) DESC`,
    [teamId]
  );

  // 투수 (의무 휴식 체크 포함)
  const pitchersResult = await pool.query(
    `SELECT p.*, COALESCE(
       (SELECT json_agg(json_build_object('skill_name', ps.skill_name, 'skill_type', ps.skill_type, 'effect_stat', ps.effect_stat, 'effect_value', ps.effect_value))
        FROM player_skills ps WHERE ps.player_id = p.id AND ps.is_active = TRUE), '[]'
     ) as skills
     FROM players p
     WHERE p.team_id = $1 AND p.roster_status = '선발로스터' AND p.is_pitcher = TRUE AND p.is_injured = FALSE
     ORDER BY CASE p.pitcher_role WHEN '선발' THEN 1 WHEN '중계' THEN 2 WHEN '마무리' THEN 3 END`,
    [teamId]
  );

  // 홈 어드밴티지
  const homeBonus = isHome ? 1.02 : 1.0;

  const makeBatter = (b: any): BatterStats => ({
    id: b.id, name: b.name,
    contact: Math.round(b.contact * homeBonus), power: Math.round(b.power * homeBonus),
    eye: b.eye, speed: b.speed, clutch: b.clutch,
    fielding: b.fielding, arm_strength: b.arm_strength, arm_accuracy: b.arm_accuracy,
    reaction: b.reaction, mental: b.mental,
    condition: b.condition, fatigue: b.fatigue,
    battingOrder: b.batting_order || 0, position: b.lineup_position || b.position,
    skills: Array.isArray(b.skills) ? b.skills : JSON.parse(b.skills || '[]'),
    bats: b.bats,
    gameStats: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0, runs: 0, walks: 0, strikeouts: 0, stolenBases: 0, errors: 0 }
  });

  const pitchers: PitcherStats[] = [];
  for (const p of pitchersResult.rows) {
    const available = await checkPitcherAvailability(p.id, matchDate);
    pitchers.push({
      id: p.id, name: p.name,
      velocity: p.velocity, control_stat: p.control_stat, stamina: p.stamina,
      breaking_ball: p.breaking_ball, mental: p.mental,
      condition: p.condition, fatigue: p.fatigue,
      pitcher_role: p.pitcher_role, throws: p.throws,
      skills: Array.isArray(p.skills) ? p.skills : JSON.parse(p.skills || '[]'),
      pitchesThrown: 0, maxPitches: 105,
      inningsPitched: 0, hitsAllowed: 0, runsAllowed: 0, earnedRuns: 0,
      walksAllowed: 0, strikeoutsPitched: 0, homeRunsAllowed: 0,
      isAvailable: available
    });
  }

  // 사용 가능한 투수만 앞으로
  const availablePitchers = pitchers.filter(p => p.isAvailable);
  const unavailablePitchers = pitchers.filter(p => !p.isAvailable);

  return {
    teamId, teamName,
    batters: battersResult.rows.map(makeBatter),
    allBatters: allBattersResult.rows.map(makeBatter),
    pitchers: availablePitchers.length > 0 ? availablePitchers : pitchers, // 전원 휴식이면 어쩔 수 없이 투입
    currentPitcherIdx: 0,
    currentBatterIdx: 0,
    morale, chemistry, isHome, tactics,
    score: 0,
    usedPinchHitters: new Set()
  };
}
