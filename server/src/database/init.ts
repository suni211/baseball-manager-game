import fs from 'fs';
import path from 'path';
import pool from './db';

export async function initDatabase() {
  try {
    // 기존 중복 데이터 정리 (UNIQUE 제약 추가 전)
    await cleanupDuplicates();

    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await pool.query(schema);
    console.log('DB 스키마 초기화 완료');
    await initTeams();
    console.log('초기 팀 데이터 삽입 완료');
  } catch (error) {
    console.error('DB 초기화 실패:', error);
    throw error;
  }
}

async function cleanupDuplicates() {
  // 중복 리그 제거 (가장 낮은 id만 남김)
  const tables = ['leagues', 'training_menus', 'sponsors', 'equipment', 'stadium_upgrades'];
  for (const table of tables) {
    try {
      await pool.query(`
        DELETE FROM ${table} WHERE id NOT IN (
          SELECT MIN(id) FROM ${table} GROUP BY name
        )
      `);
    } catch (e) {
      // 테이블이 없거나 에러 시 무시
    }
  }
}

async function initTeams() {
  // 이미 있는 팀 이름 확인
  const existingTeams = await pool.query('SELECT name FROM teams');
  const existingNames = new Set(existingTeams.rows.map((r: any) => r.name));
  if (existingNames.size >= 40) return; // 모든 팀 존재

  // 리그 ID를 이름으로 조회 (ID가 밀릴 수 있으므로)
  const leagueRows = await pool.query('SELECT id, name FROM leagues ORDER BY id');
  const leagueMap: Record<string, number> = {};
  for (const row of leagueRows.rows) {
    leagueMap[row.name] = row.id;
  }

  const teams = [
    { name: '마가단고등학교', league: '마가단 서부리그 1' },
    { name: '야르노프고등학교', league: '마가단 서부리그 1' },
    { name: '마가단서부고등학교', league: '마가단 서부리그 1' },
    { name: '마가단스포츠고등학교', league: '마가단 서부리그 1' },
    { name: '부르시예프고등학교', league: '마가단 서부리그 1' },
    { name: '마가단2가고등학교', league: '마가단 서부리그 1' },
    { name: '마가단남성고등학교', league: '마가단 서부리그 1' },
    { name: '스튜산업고등학교', league: '마가단 서부리그 1' },
    { name: '마가단서고등학교', league: '마가단 서부리그 2' },
    { name: '마가단인터넷고등학교', league: '마가단 서부리그 2' },
    { name: '마가단예술고등학교', league: '마가단 서부리그 2' },
    { name: '마가단의협고등학교', league: '마가단 서부리그 2' },
    { name: '주양고등학교', league: '마가단 서부리그 2' },
    { name: '황수취중앙고등학교', league: '마가단 서부리그 2' },
    { name: '마가단화산고등학교', league: '마가단 서부리그 2' },
    { name: '미양고등학교', league: '마가단 서부리그 2' },
    { name: '마가단마이스터고', league: '마가단 동부리그 1' },
    { name: '상단재단고등학교', league: '마가단 동부리그 1' },
    { name: '미르고등학교', league: '마가단 동부리그 1' },
    { name: '제바이옌고등학교', league: '마가단 동부리그 1' },
    { name: '다르미고등학교', league: '마가단 동부리그 1' },
    { name: '베르바누스고등학교', league: '마가단 동부리그 1' },
    { name: '마가단상혈고등학교', league: '마가단 동부리그 1' },
    { name: '도우민고등학교', league: '마가단 동부리그 1' },
    { name: '현부고등학교', league: '마가단 동부리그 2' },
    { name: '이도리코고등학교', league: '마가단 동부리그 2' },
    { name: '마가단야마모토고등학교', league: '마가단 동부리그 2' },
    { name: '마가단재일2가고등학교', league: '마가단 동부리그 2' },
    { name: '미지로프고등학교', league: '마가단 동부리그 2' },
    { name: '마가단중앙고등학교', league: '마가단 동부리그 2' },
    { name: '마가단옐로재단산업고등학교', league: '마가단 동부리그 2' },
    { name: '마가단제철고등학교', league: '마가단 동부리그 2' },
    { name: '캄차카고등학교', league: '캄차카-재친 리그' },
    { name: '캄차카1가고등학교', league: '캄차카-재친 리그' },
    { name: '캄차카2가고등학교', league: '캄차카-재친 리그' },
    { name: '캄차카산업고등학교', league: '캄차카-재친 리그' },
    { name: '재친고등학교', league: '캄차카-재친 리그' },
    { name: '재친민송고등학교', league: '캄차카-재친 리그' },
    { name: '베양고등학교', league: '캄차카-재친 리그' },
    { name: '민송고등학교', league: '캄차카-재친 리그' },
  ];

  for (const team of teams) {
    // 이미 있는 팀은 건너뛰기
    if (existingNames.has(team.name)) continue;

    const leagueId = leagueMap[team.league];
    if (!leagueId) {
      console.error(`리그 '${team.league}'를 찾을 수 없습니다`);
      continue;
    }

    const result = await pool.query(
      'INSERT INTO teams (name, league_id) VALUES ($1, $2) RETURNING id',
      [team.name, leagueId]
    );
    const teamId = result.rows[0].id;

    // 구장
    const stadiumResult = await pool.query(
      'INSERT INTO stadiums (team_id, name, capacity) VALUES ($1, $2, $3) RETURNING id',
      [teamId, `${team.name} 야구장`, 500]
    );
    await pool.query('UPDATE teams SET stadium_id = $1 WHERE id = $2', [stadiumResult.rows[0].id, teamId]);

    // 전술 기본값
    await pool.query('INSERT INTO team_tactics (team_id) VALUES ($1) ON CONFLICT DO NOTHING', [teamId]);

    // 선수 36명
    await generateDefaultPlayers(teamId);
  }
}

async function generateDefaultPlayers(teamId: number) {
  const positions = ['투수','투수','투수','투수','투수','포수','포수','1루수','1루수','2루수','2루수','3루수','3루수','유격수','유격수','좌익수','좌익수','중견수','중견수','우익수','우익수'];
  const surnames = ['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황','안','송','류','홍','전','고','문','양','손','배','백','허','남','심','유','노','하','곽','성','차'];
  const names = ['민준','서준','예준','도윤','시우','주원','하준','지호','지후','준서','준우','현우','도현','지훈','건우','우진','선우','서진','민재','현준','연우','유준','정우','승현','승우','시윤','진우','태윤','준혁','은우','지원','수호','재윤','시후','민성','윤호'];
  const pitcherRoles = ['선발','선발','중계','중계','마무리'];
  const grades = [1,2,3];
  const skillPool: {name:string; type:string; desc:string; stat:string; val:number}[] = [
    {name:'클러치 히터',type:'타격',desc:'결정적 순간에 강하다',stat:'clutch',val:8},
    {name:'파워 히터',type:'타격',desc:'장타력이 뛰어나다',stat:'power',val:7},
    {name:'선구안의 달인',type:'타격',desc:'볼 판별이 뛰어나다',stat:'eye',val:6},
    {name:'번트 장인',type:'타격',desc:'번트 성공률이 높다',stat:'contact',val:5},
    {name:'주루의 신',type:'주루',desc:'도루 능력이 뛰어나다',stat:'speed',val:8},
    {name:'철벽 수비',type:'수비',desc:'수비가 완벽하다',stat:'fielding',val:7},
    {name:'강속구',type:'투구',desc:'직구가 빠르다',stat:'velocity',val:8},
    {name:'마구 마스터',type:'투구',desc:'변화구가 날카롭다',stat:'breaking_ball',val:7},
    {name:'정밀 제구',type:'투구',desc:'코너를 정확히 찌른다',stat:'control_stat',val:6},
    {name:'강심장',type:'정신',desc:'중요한 경기에서 흔들리지 않는다',stat:'mental',val:8},
    {name:'빠른 회복',type:'특수',desc:'피로 회복이 빠르다',stat:'stamina',val:5},
    {name:'승부사',type:'정신',desc:'접전에서 강하다',stat:'clutch',val:6},
  ];

  for (let i = 0; i < 36; i++) {
    const position = positions[i % positions.length];
    const isPitcher = position === '투수';
    const grade = grades[i % 3];
    const age = grade + 15;
    const surname = surnames[Math.floor(Math.random() * surnames.length)];
    const givenName = names[Math.floor(Math.random() * names.length)];
    const playerName = surname + givenName;
    const potential = ['S','A','B','C','D'][Math.floor(Math.random() * 5)];
    const mult = potential === 'S' ? 1.3 : potential === 'A' ? 1.15 : potential === 'B' ? 1.0 : potential === 'C' ? 0.9 : 0.8;
    const gradeBonus = (grade - 1) * 5;
    const baseStat = () => Math.floor((Math.random() * 25 + 25 + gradeBonus) * mult);
    const pitcherRole = isPitcher ? pitcherRoles[i % pitcherRoles.length] : null;

    const playerResult = await pool.query(
      `INSERT INTO players (
        team_id, name, grade, age, position, is_pitcher, pitcher_role,
        height, weight, throws, bats,
        contact, power, eye, speed, clutch,
        fielding, arm_strength, arm_accuracy, reaction,
        velocity, control_stat, stamina, breaking_ball, mental,
        potential, growth_rate, roster_status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28
      ) RETURNING id`,
      [
        teamId, playerName, grade, age, position, isPitcher, pitcherRole,
        Math.floor(Math.random()*20+168), Math.floor(Math.random()*20+60),
        Math.random()>0.7?'좌투':'우투', Math.random()>0.7?'좌타':'우타',
        baseStat(), baseStat(), baseStat(), baseStat(), baseStat(),
        baseStat(), baseStat(), baseStat(), baseStat(),
        isPitcher ? baseStat()+10 : 0, isPitcher ? baseStat() : 0,
        isPitcher ? baseStat() : 0, isPitcher ? baseStat() : 0, baseStat(),
        potential, +(Math.random()*0.5+0.8).toFixed(2),
        i < 23 ? '선발로스터' : '등록'
      ]
    );
    const playerId = playerResult.rows[0].id;

    // 투수 구종
    if (isPitcher) {
      const allPitches = ['직구','투심','커터','슬라이더','커브','체인지업','포크','싱커'];
      const pitchCount = Math.floor(Math.random()*3)+2;
      const selected = ['직구',...allPitches.sort(()=>Math.random()-0.5).slice(0,pitchCount)];
      const unique = [...new Set(selected)];
      for (const pitch of unique) {
        await pool.query(
          'INSERT INTO pitcher_pitches (player_id, pitch_type, level) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [playerId, pitch, Math.floor(Math.random()*30+20+gradeBonus)]
        );
      }
    }

    // 15% 확률로 특성 부여
    if (Math.random() < 0.15) {
      const skill = skillPool[Math.floor(Math.random() * skillPool.length)];
      await pool.query(
        'INSERT INTO player_skills (player_id, skill_name, skill_type, description, effect_stat, effect_value) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
        [playerId, skill.name, skill.type, skill.desc, skill.stat, skill.val]
      );
    }
  }
}

export default initDatabase;
