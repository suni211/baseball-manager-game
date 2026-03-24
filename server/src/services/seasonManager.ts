import pool from '../database/db';

// =============================================
// 봄/여름 리그 일정 생성 (리그 내 라운드 로빈)
// =============================================
export async function generateLeagueSchedule(seasonId: number, phase: string) {
  const leagues = await pool.query('SELECT id, name FROM leagues ORDER BY id');

  // 상금 설정
  const prizePool = phase === '봄리그' ? 1000000000 : 1500000000; // 10억 / 15억
  const prizePerLeague = Math.floor(prizePool / leagues.rows.length);

  for (const league of leagues.rows) {
    const teams = await pool.query('SELECT id FROM teams WHERE league_id = $1 ORDER BY id', [league.id]);
    const teamIds = teams.rows.map((t: any) => t.id);

    const tournament = await pool.query(
      `INSERT INTO tournaments (season_id, name, type, prize_pool, started_at)
       VALUES ($1, $2, '리그', $3, NOW()) RETURNING id`,
      [seasonId, `${league.name} ${phase}`, prizePerLeague]
    );
    const tournamentId = tournament.rows[0].id;

    for (const tid of teamIds) {
      await pool.query('INSERT INTO tournament_teams (tournament_id, team_id) VALUES ($1, $2)', [tournamentId, tid]);
    }

    // 2라운드 (홈1 어웨이1)
    let matchDay = 1;
    const baseDate = new Date();

    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < teamIds.length; j++) {
          const homeTeam = round === 0 ? teamIds[i] : teamIds[j];
          const awayTeam = round === 0 ? teamIds[j] : teamIds[i];
          const matchDate = new Date(baseDate);
          matchDate.setDate(matchDate.getDate() + matchDay);

          await pool.query(
            `INSERT INTO matches (tournament_id, season_id, home_team_id, away_team_id, match_date, round, stage)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [tournamentId, seasonId, homeTeam, awayTeam, matchDate, round + 1, phase]
          );
          matchDay++;
        }
      }
    }
  }
}

// =============================================
// AR상단배 (봄 대회) - 리그별 상위 2팀 = 10팀, 풀리그 + 계단식
// 총 상금 55억
// =============================================
export async function generateARCup(seasonId: number) {
  const qualifiedTeams: number[] = [];

  const leagues = await pool.query('SELECT id FROM leagues ORDER BY id');
  for (const league of leagues.rows) {
    const standings = await pool.query(
      `SELECT tt.team_id,
              CASE WHEN (tt.wins + tt.losses) > 0 THEN tt.wins::float / (tt.wins + tt.losses) ELSE 0 END as win_rate
       FROM tournament_teams tt
       JOIN tournaments t ON tt.tournament_id = t.id
       WHERE t.season_id = $1 AND t.type = '리그'
         AND tt.team_id IN (SELECT id FROM teams WHERE league_id = $2)
       ORDER BY win_rate DESC, tt.wins DESC, (tt.runs_scored - tt.runs_allowed) DESC
       LIMIT 2`,
      [seasonId, league.id]
    );
    qualifiedTeams.push(...standings.rows.map((r: any) => r.team_id));
  }

  const tournament = await pool.query(
    `INSERT INTO tournaments (season_id, name, type, prize_pool, started_at)
     VALUES ($1, 'AR상단배 전국고교야구대회', 'AR상단배', 5500000000, NOW()) RETURNING id`,
    [seasonId]
  );
  const tournamentId = tournament.rows[0].id;

  for (const tid of qualifiedTeams) {
    await pool.query('INSERT INTO tournament_teams (tournament_id, team_id) VALUES ($1, $2)', [tournamentId, tid]);
  }

  // 10팀 풀리그 (홈1 어웨이1 = 총 18경기/팀)
  const baseDate = new Date();
  let matchDay = 1;

  for (let i = 0; i < qualifiedTeams.length; i++) {
    for (let j = i + 1; j < qualifiedTeams.length; j++) {
      const d1 = new Date(baseDate); d1.setDate(d1.getDate() + matchDay);
      await pool.query(
        `INSERT INTO matches (tournament_id, season_id, home_team_id, away_team_id, match_date, stage)
         VALUES ($1, $2, $3, $4, $5, 'AR상단배 풀리그')`,
        [tournamentId, seasonId, qualifiedTeams[i], qualifiedTeams[j], d1]
      );
      matchDay++;

      const d2 = new Date(baseDate); d2.setDate(d2.getDate() + matchDay);
      await pool.query(
        `INSERT INTO matches (tournament_id, season_id, home_team_id, away_team_id, match_date, stage)
         VALUES ($1, $2, $3, $4, $5, 'AR상단배 풀리그')`,
        [tournamentId, seasonId, qualifiedTeams[j], qualifiedTeams[i], d2]
      );
      matchDay++;
    }
  }

  return tournamentId;
}

// =============================================
// 마전국기 (여름 대회) - 리그별 상위 4팀 = 20팀
// 같은 지방끼리 안 붙도록 조편성, 5개조 4팀
// 조 1위 + 2위 중 성적 좋은 3팀 = 8강 토너먼트
// 총 상금 250억
// =============================================
export async function generateNationalCup(seasonId: number) {
  // 리그별 상위 4팀
  const leagueTeams: { leagueId: number; region: string; teamIds: number[] }[] = [];

  const leagues = await pool.query('SELECT id, region FROM leagues ORDER BY id');
  for (const league of leagues.rows) {
    const standings = await pool.query(
      `SELECT tt.team_id,
              CASE WHEN (tt.wins + tt.losses) > 0 THEN tt.wins::float / (tt.wins + tt.losses) ELSE 0 END as win_rate
       FROM tournament_teams tt
       JOIN tournaments t ON tt.tournament_id = t.id
       WHERE t.season_id = $1 AND t.type = '리그'
         AND tt.team_id IN (SELECT id FROM teams WHERE league_id = $2)
       ORDER BY win_rate DESC, tt.wins DESC
       LIMIT 4`,
      [seasonId, league.id]
    );
    leagueTeams.push({
      leagueId: league.id,
      region: league.region,
      teamIds: standings.rows.map((r: any) => r.team_id)
    });
  }

  const tournament = await pool.query(
    `INSERT INTO tournaments (season_id, name, type, prize_pool, started_at)
     VALUES ($1, '마피아 전국대회 (마전국기)', '마전국기', 25000000000, NOW()) RETURNING id`,
    [seasonId]
  );
  const tournamentId = tournament.rows[0].id;

  // 5개 조 편성 (같은 지방끼리 안 붙도록)
  // 각 조에 5개 리그에서 1팀씩 (but 리그당 4팀이므로 조4개가 각 리그1팀씩)
  // 5개 리그 x 4팀 = 20팀, 5개 조 x 4팀
  const groups = ['A', 'B', 'C', 'D', 'E'];
  const groupAssignments: Map<string, number[]> = new Map();
  for (const g of groups) groupAssignments.set(g, []);

  // 각 리그에서 시드 순서대로 조 배정 (같은 리그 = 같은 조 방지)
  for (let seed = 0; seed < 4; seed++) {
    // 리그 순서를 시드마다 다르게 셔플
    const shuffledLeagues = [...leagueTeams];
    for (let i = shuffledLeagues.length - 1; i > 0; i--) {
      const j = (seed + i) % shuffledLeagues.length;
      [shuffledLeagues[i], shuffledLeagues[j]] = [shuffledLeagues[j], shuffledLeagues[i]];
    }

    for (let li = 0; li < shuffledLeagues.length; li++) {
      const league = shuffledLeagues[li];
      if (seed < league.teamIds.length) {
        // 이 팀이 들어갈 조: 같은 지방 팀이 없는 조 찾기
        let assigned = false;
        for (const g of groups) {
          const groupTeams = groupAssignments.get(g)!;
          if (groupTeams.length >= 4) continue;

          // 같은 리그 팀이 이미 있는지 체크
          const sameLeagueInGroup = groupTeams.some(tid => league.teamIds.includes(tid));
          if (!sameLeagueInGroup) {
            groupTeams.push(league.teamIds[seed]);
            assigned = true;
            break;
          }
        }
        // 못 넣으면 아무 빈 조에
        if (!assigned) {
          for (const g of groups) {
            if (groupAssignments.get(g)!.length < 4) {
              groupAssignments.get(g)!.push(league.teamIds[seed]);
              break;
            }
          }
        }
      }
    }
  }

  // 팀 등록
  for (const [groupName, teamIds] of groupAssignments) {
    for (const tid of teamIds) {
      await pool.query(
        'INSERT INTO tournament_teams (tournament_id, team_id, group_name) VALUES ($1, $2, $3)',
        [tournamentId, tid, groupName]
      );
    }
  }

  // 조별 리그전 일정 (조 내 홈1 어웨이1)
  const baseDate = new Date();
  let matchDay = 1;

  for (const [groupName, teamIds] of groupAssignments) {
    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        const d1 = new Date(baseDate); d1.setDate(d1.getDate() + matchDay);
        await pool.query(
          `INSERT INTO matches (tournament_id, season_id, home_team_id, away_team_id, match_date, stage)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [tournamentId, seasonId, teamIds[i], teamIds[j], d1, `${groupName}조`]
        );
        matchDay++;

        const d2 = new Date(baseDate); d2.setDate(d2.getDate() + matchDay);
        await pool.query(
          `INSERT INTO matches (tournament_id, season_id, home_team_id, away_team_id, match_date, stage)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [tournamentId, seasonId, teamIds[j], teamIds[i], d2, `${groupName}조`]
        );
        matchDay++;
      }
    }
  }

  return tournamentId;
}

// =============================================
// 마전국기 8강 토너먼트 생성 (조별리그 이후)
// 조1위 5팀 + 2위중 상위 3팀 = 8팀
// =============================================
export async function generateNationalKnockout(tournamentId: number) {
  const groups = ['A', 'B', 'C', 'D', 'E'];
  const firstPlace: number[] = [];
  const secondPlace: { teamId: number; winRate: number; runDiff: number }[] = [];

  for (const g of groups) {
    const standings = await pool.query(
      `SELECT tt.team_id, tt.wins, tt.losses, tt.runs_scored, tt.runs_allowed,
              CASE WHEN (tt.wins + tt.losses) > 0 THEN tt.wins::float / (tt.wins + tt.losses) ELSE 0 END as win_rate
       FROM tournament_teams tt
       WHERE tt.tournament_id = $1 AND tt.group_name = $2
       ORDER BY win_rate DESC, (tt.runs_scored - tt.runs_allowed) DESC`,
      [tournamentId, g]
    );

    if (standings.rows.length >= 1) firstPlace.push(standings.rows[0].team_id);
    if (standings.rows.length >= 2) {
      const s = standings.rows[1];
      secondPlace.push({
        teamId: s.team_id,
        winRate: parseFloat(s.win_rate),
        runDiff: s.runs_scored - s.runs_allowed
      });
    }
  }

  // 2위 중 상위 3팀
  secondPlace.sort((a, b) => b.winRate - a.winRate || b.runDiff - a.runDiff);
  const wildCard = secondPlace.slice(0, 3).map(s => s.teamId);

  const knockoutTeams = [...firstPlace, ...wildCard]; // 8팀

  const seasonResult = await pool.query('SELECT season_id FROM tournaments WHERE id = $1', [tournamentId]);
  const seasonId = seasonResult.rows[0].season_id;
  const baseDate = new Date();

  // 8강 대진 (1위끼리 안 붙도록: 1위1 vs 와일드3, 1위2 vs 와일드2, ...)
  const matchups = [
    [firstPlace[0], wildCard[2]],
    [firstPlace[1], wildCard[1]],
    [firstPlace[2], wildCard[0]],
    [firstPlace[3], firstPlace[4]],
  ];

  for (let i = 0; i < matchups.length; i++) {
    const d = new Date(baseDate); d.setDate(d.getDate() + i + 1);
    await pool.query(
      `INSERT INTO matches (tournament_id, season_id, home_team_id, away_team_id, match_date, stage)
       VALUES ($1, $2, $3, $4, $5, '8강')`,
      [tournamentId, seasonId, matchups[i][0], matchups[i][1], d]
    );
  }

  return knockoutTeams;
}

// =============================================
// 상금 분배
// =============================================
export async function distributePrizes(tournamentId: number) {
  const tournament = await pool.query('SELECT prize_pool, type FROM tournaments WHERE id = $1', [tournamentId]);
  if (tournament.rows.length === 0) return;

  const total = parseInt(tournament.rows[0].prize_pool);
  const type = tournament.rows[0].type;

  const standings = await pool.query(
    `SELECT tt.team_id, tt.wins, tt.losses,
            CASE WHEN (tt.wins + tt.losses) > 0 THEN tt.wins::float / (tt.wins + tt.losses) ELSE 0 END as win_rate
     FROM tournament_teams tt
     WHERE tt.tournament_id = $1
     ORDER BY win_rate DESC, tt.wins DESC, (tt.runs_scored - tt.runs_allowed) DESC`,
    [tournamentId]
  );

  let prizeRatios: number[];
  if (type === 'AR상단배') {
    // 10팀: 1등 30%, 2등 20%, 3등 12%, 4등 8%, 5-6등 5%, 7-8등 3%, 9-10등 2%
    prizeRatios = [0.30, 0.20, 0.12, 0.08, 0.05, 0.05, 0.03, 0.03, 0.02, 0.02];
  } else if (type === '마전국기') {
    // 20팀: 1등 25%, 2등 15%, 3등 10%, 4등 7%, 5-8등 4%, 9-12등 2%, 13-16등 1%, 나머지 0.5%
    prizeRatios = [0.25, 0.15, 0.10, 0.07, 0.04, 0.04, 0.04, 0.04, 0.02, 0.02, 0.02, 0.02, 0.01, 0.01, 0.01, 0.01, 0.005, 0.005, 0.005, 0.005];
  } else {
    // 리그: 8팀 순위별
    prizeRatios = [0.30, 0.22, 0.15, 0.10, 0.08, 0.06, 0.05, 0.04];
  }

  for (let i = 0; i < standings.rows.length && i < prizeRatios.length; i++) {
    const prize = Math.floor(total * prizeRatios[i]);
    const teamId = standings.rows[i].team_id;

    await pool.query('UPDATE tournament_teams SET prize_earned = $1, rank = $2 WHERE tournament_id = $3 AND team_id = $4',
      [prize, i + 1, tournamentId, teamId]);
    await pool.query('UPDATE teams SET budget = budget + $1 WHERE id = $2', [prize, teamId]);
    await pool.query(
      `INSERT INTO financial_transactions (team_id, type, amount, description) VALUES ($1, '대회상금', $2, $3)`,
      [teamId, prize, `${tournament.rows[0].type} ${i + 1}위 상금`]
    );
  }
}

// =============================================
// 오프시즌
// =============================================
export async function processOffseason(seasonId: number) {
  const graduates = await pool.query('SELECT id, name, team_id FROM players WHERE grade = 3');

  for (const grad of graduates.rows) {
    const draftRound = Math.floor(Math.random() * 5) + 1;
    const proTeams = ['마가단 베어스','캄차카 이글스','재친 타이거즈','미르 자이언츠','동부 라이온즈','서부 히어로즈'];
    const proTeam = proTeams[Math.floor(Math.random() * proTeams.length)];

    await pool.query(
      `INSERT INTO draft_results (player_id, season_id, draft_round, pro_team_name) VALUES ($1,$2,$3,$4)`,
      [grad.id, seasonId, draftRound, proTeam]
    );
    await pool.query(
      `INSERT INTO game_news (title, content, category, related_team_id) VALUES ($1,$2,'이적',$3)`,
      [`${grad.name} 프로 진출`, `${grad.name} → ${proTeam} ${draftRound}라운드`, grad.team_id]
    );
  }

  await pool.query('DELETE FROM players WHERE grade = 3');
  await pool.query('UPDATE players SET grade = grade + 1, age = age + 1');
}

export async function generateFreshmen(teamId: number, count: number = 12) {
  const surnames = ['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황'];
  const names = ['민준','서준','예준','도윤','시우','주원','하준','지호','준서','준우','현우','도현','지훈','건우','우진','선우'];
  const positions = ['투수','포수','1루수','2루수','3루수','유격수','좌익수','중견수','우익수'];

  for (let i = 0; i < count; i++) {
    const name = surnames[Math.floor(Math.random() * surnames.length)] + names[Math.floor(Math.random() * names.length)];
    const position = positions[Math.floor(Math.random() * positions.length)];
    const isPitcher = position === '투수';
    const potential = ['S','A','B','C','D'][Math.floor(Math.random() * 5)];
    const mult = potential === 'S' ? 1.3 : potential === 'A' ? 1.15 : potential === 'B' ? 1.0 : potential === 'C' ? 0.9 : 0.8;
    const stat = () => Math.floor((Math.random() * 20 + 20) * mult);

    await pool.query(
      `INSERT INTO players (team_id, name, grade, age, position, is_pitcher,
       contact, power, eye, speed, clutch, fielding, arm_strength, arm_accuracy, reaction,
       velocity, control_stat, stamina, breaking_ball, mental, potential, growth_rate, roster_status)
       VALUES ($1,$2,1,16,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'등록')`,
      [teamId, name, position, isPitcher,
       stat(), stat(), stat(), stat(), stat(), stat(), stat(), stat(), stat(),
       isPitcher ? stat()+5 : 0, isPitcher ? stat() : 0, isPitcher ? stat() : 0, isPitcher ? stat() : 0,
       stat(), potential, +(Math.random()*0.5+0.8).toFixed(2)]
    );
  }
}
