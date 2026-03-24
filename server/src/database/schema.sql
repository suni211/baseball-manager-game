-- =============================================
-- 고교야구 온라인 감독 게임 DB 스키마 v2
-- =============================================

-- 유저 테이블
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) UNIQUE NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  team_id INTEGER,
  reputation INTEGER DEFAULT 50,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP DEFAULT NOW()
);

-- 리그 테이블
CREATE TABLE IF NOT EXISTS leagues (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  region VARCHAR(50) NOT NULL
);

-- 팀(학교) 테이블
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  league_id INTEGER REFERENCES leagues(id),
  owner_id INTEGER REFERENCES users(id),
  budget BIGINT DEFAULT 5000000,
  morale INTEGER DEFAULT 50 CHECK (morale BETWEEN 0 AND 100),
  chemistry INTEGER DEFAULT 50 CHECK (chemistry BETWEEN 0 AND 100),
  popularity INTEGER DEFAULT 10 CHECK (popularity BETWEEN 0 AND 100),
  stadium_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_team') THEN
    ALTER TABLE users ADD CONSTRAINT fk_users_team FOREIGN KEY (team_id) REFERENCES teams(id);
  END IF;
END $$;

-- 구장 테이블
CREATE TABLE IF NOT EXISTS stadiums (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  name VARCHAR(100) NOT NULL,
  capacity INTEGER DEFAULT 500,
  field_condition INTEGER DEFAULT 50 CHECK (field_condition BETWEEN 0 AND 100),
  fence_distance INTEGER DEFAULT 95,
  has_lights BOOLEAN DEFAULT FALSE,
  has_scoreboard BOOLEAN DEFAULT TRUE,
  has_bullpen BOOLEAN DEFAULT FALSE,
  has_batting_cage BOOLEAN DEFAULT FALSE,
  has_video_room BOOLEAN DEFAULT FALSE,
  upgrade_level INTEGER DEFAULT 1 CHECK (upgrade_level BETWEEN 1 AND 5),
  maintenance_cost INTEGER DEFAULT 100000
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_teams_stadium') THEN
    ALTER TABLE teams ADD CONSTRAINT fk_teams_stadium FOREIGN KEY (stadium_id) REFERENCES stadiums(id);
  END IF;
END $$;

-- 구장 업그레이드 옵션
CREATE TABLE IF NOT EXISTS stadium_upgrades (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  target_field VARCHAR(30) NOT NULL,
  cost BIGINT NOT NULL,
  required_level INTEGER DEFAULT 1,
  capacity_bonus INTEGER DEFAULT 0,
  field_condition_bonus INTEGER DEFAULT 0,
  effect_description TEXT
);

-- 선수 테이블
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  name VARCHAR(50) NOT NULL,
  grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 3),
  age INTEGER NOT NULL CHECK (age BETWEEN 16 AND 18),
  position VARCHAR(10) NOT NULL CHECK (position IN ('투수', '포수', '1루수', '2루수', '3루수', '유격수', '좌익수', '중견수', '우익수', '지명타자')),
  secondary_position VARCHAR(10),
  is_pitcher BOOLEAN DEFAULT FALSE,
  pitcher_role VARCHAR(10) CHECK (pitcher_role IN ('선발', '중계', '마무리')),

  -- 기본 정보
  height INTEGER DEFAULT 175,
  weight INTEGER DEFAULT 70,
  throws VARCHAR(5) DEFAULT '우투' CHECK (throws IN ('우투', '좌투', '양투')),
  bats VARCHAR(5) DEFAULT '우타' CHECK (bats IN ('우타', '좌타', '양타')),

  -- 컨디션/상태
  condition INTEGER DEFAULT 70 CHECK (condition BETWEEN 0 AND 100),
  fatigue INTEGER DEFAULT 0 CHECK (fatigue BETWEEN 0 AND 100),
  is_injured BOOLEAN DEFAULT FALSE,
  injury_type VARCHAR(50),
  injury_body_part VARCHAR(30),
  injury_severity VARCHAR(10) CHECK (injury_severity IN ('경미', '보통', '심각', '중상')),
  injury_days_left INTEGER DEFAULT 0,
  injury_history_count INTEGER DEFAULT 0,

  -- 타격 스탯
  contact INTEGER DEFAULT 40 CHECK (contact BETWEEN 1 AND 100),
  power INTEGER DEFAULT 40 CHECK (power BETWEEN 1 AND 100),
  eye INTEGER DEFAULT 40 CHECK (eye BETWEEN 1 AND 100),
  speed INTEGER DEFAULT 40 CHECK (speed BETWEEN 1 AND 100),
  clutch INTEGER DEFAULT 40 CHECK (clutch BETWEEN 1 AND 100),

  -- 수비 스탯
  fielding INTEGER DEFAULT 40 CHECK (fielding BETWEEN 1 AND 100),
  arm_strength INTEGER DEFAULT 40 CHECK (arm_strength BETWEEN 1 AND 100),
  arm_accuracy INTEGER DEFAULT 40 CHECK (arm_accuracy BETWEEN 1 AND 100),
  reaction INTEGER DEFAULT 40 CHECK (reaction BETWEEN 1 AND 100),

  -- 투수 스탯 (투수만)
  velocity INTEGER DEFAULT 0 CHECK (velocity BETWEEN 0 AND 100),
  control_stat INTEGER DEFAULT 0 CHECK (control_stat BETWEEN 0 AND 100),
  stamina INTEGER DEFAULT 0 CHECK (stamina BETWEEN 0 AND 100),
  breaking_ball INTEGER DEFAULT 0 CHECK (breaking_ball BETWEEN 0 AND 100),
  mental INTEGER DEFAULT 40 CHECK (mental BETWEEN 1 AND 100),

  -- 성장 관련
  potential VARCHAR(5) DEFAULT 'C' CHECK (potential IN ('S', 'A', 'B', 'C', 'D')),
  growth_rate FLOAT DEFAULT 1.0,
  experience INTEGER DEFAULT 0,

  -- 로스터 상태
  roster_status VARCHAR(20) DEFAULT '등록' CHECK (roster_status IN ('등록', '선발로스터', '벤치')),
  batting_order INTEGER,
  lineup_position VARCHAR(10),

  created_at TIMESTAMP DEFAULT NOW()
);

-- 선수 특성/스킬
CREATE TABLE IF NOT EXISTS player_skills (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  skill_name VARCHAR(50) NOT NULL,
  skill_type VARCHAR(20) CHECK (skill_type IN ('타격', '투구', '수비', '주루', '정신', '특수')),
  description TEXT,
  effect_stat VARCHAR(30),
  effect_value INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  acquired_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(player_id, skill_name)
);

-- 부상 기록 상세
CREATE TABLE IF NOT EXISTS injury_history (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  team_id INTEGER REFERENCES teams(id),
  injury_type VARCHAR(50) NOT NULL,
  body_part VARCHAR(30) NOT NULL,
  severity VARCHAR(10) CHECK (severity IN ('경미', '보통', '심각', '중상')),
  days_missed INTEGER DEFAULT 0,
  cause VARCHAR(50),
  is_recovered BOOLEAN DEFAULT FALSE,
  occurred_at TIMESTAMP DEFAULT NOW(),
  recovered_at TIMESTAMP
);

-- 투수 구종 테이블
CREATE TABLE IF NOT EXISTS pitcher_pitches (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  pitch_type VARCHAR(20) NOT NULL CHECK (pitch_type IN ('직구', '투심', '커터', '슬라이더', '커브', '체인지업', '포크', '너클볼', '싱커')),
  level INTEGER DEFAULT 30 CHECK (level BETWEEN 1 AND 100),
  UNIQUE(player_id, pitch_type)
);

-- 시즌 테이블
CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  current_phase VARCHAR(20) DEFAULT '봄리그' CHECK (current_phase IN ('봄리그', 'AR상단배', '여름리그', '마전국기', '오프시즌')),
  is_active BOOLEAN DEFAULT TRUE,
  started_at TIMESTAMP DEFAULT NOW()
);

-- 대회 테이블
CREATE TABLE IF NOT EXISTS tournaments (
  id SERIAL PRIMARY KEY,
  season_id INTEGER REFERENCES seasons(id),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('리그', 'AR상단배', '마전국기')),
  phase VARCHAR(30) DEFAULT '진행중',
  prize_pool BIGINT DEFAULT 0,
  started_at TIMESTAMP,
  ended_at TIMESTAMP
);

-- 대회 참가 팀
CREATE TABLE IF NOT EXISTS tournament_teams (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER REFERENCES tournaments(id),
  team_id INTEGER REFERENCES teams(id),
  group_name VARCHAR(10),
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  runs_scored INTEGER DEFAULT 0,
  runs_allowed INTEGER DEFAULT 0,
  rank INTEGER,
  prize_earned BIGINT DEFAULT 0,
  UNIQUE(tournament_id, team_id)
);

-- 경기 일정 테이블
CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER REFERENCES tournaments(id),
  season_id INTEGER REFERENCES seasons(id),
  home_team_id INTEGER REFERENCES teams(id),
  away_team_id INTEGER REFERENCES teams(id),
  match_date TIMESTAMP,
  status VARCHAR(20) DEFAULT '예정' CHECK (status IN ('예정', '진행중', '완료', '취소')),
  round INTEGER,
  stage VARCHAR(50),

  -- 결과
  home_score INTEGER DEFAULT 0,
  away_score INTEGER DEFAULT 0,
  innings_played INTEGER DEFAULT 9,
  weather VARCHAR(20) DEFAULT '맑음',
  attendance INTEGER DEFAULT 0,

  -- MVP
  mvp_player_id INTEGER REFERENCES players(id),

  completed_at TIMESTAMP
);

-- 경기 이닝 상세
CREATE TABLE IF NOT EXISTS match_innings (
  id SERIAL PRIMARY KEY,
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  inning INTEGER NOT NULL,
  half VARCHAR(5) NOT NULL CHECK (half IN ('초', '말')),
  runs INTEGER DEFAULT 0,
  hits INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  team_id INTEGER REFERENCES teams(id)
);

-- 경기 실시간 로그 (텍스트 중계)
CREATE TABLE IF NOT EXISTS match_play_log (
  id SERIAL PRIMARY KEY,
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  inning INTEGER NOT NULL,
  half VARCHAR(5) NOT NULL,
  at_bat_number INTEGER DEFAULT 0,
  event_type VARCHAR(30),
  description TEXT NOT NULL,
  batter_id INTEGER REFERENCES players(id),
  pitcher_id INTEGER REFERENCES players(id),
  runners_on TEXT,
  outs INTEGER DEFAULT 0,
  score_home INTEGER DEFAULT 0,
  score_away INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 경기 타자 기록
CREATE TABLE IF NOT EXISTS match_batting_stats (
  id SERIAL PRIMARY KEY,
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  team_id INTEGER REFERENCES teams(id),
  batting_order INTEGER,
  position VARCHAR(10),

  at_bats INTEGER DEFAULT 0,
  hits INTEGER DEFAULT 0,
  doubles INTEGER DEFAULT 0,
  triples INTEGER DEFAULT 0,
  home_runs INTEGER DEFAULT 0,
  rbi INTEGER DEFAULT 0,
  runs INTEGER DEFAULT 0,
  walks INTEGER DEFAULT 0,
  strikeouts INTEGER DEFAULT 0,
  stolen_bases INTEGER DEFAULT 0,
  errors_committed INTEGER DEFAULT 0
);

-- 경기 투수 기록
CREATE TABLE IF NOT EXISTS match_pitching_stats (
  id SERIAL PRIMARY KEY,
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  team_id INTEGER REFERENCES teams(id),

  innings_pitched FLOAT DEFAULT 0,
  pitches_thrown INTEGER DEFAULT 0,
  hits_allowed INTEGER DEFAULT 0,
  runs_allowed INTEGER DEFAULT 0,
  earned_runs INTEGER DEFAULT 0,
  walks_allowed INTEGER DEFAULT 0,
  strikeouts_pitched INTEGER DEFAULT 0,
  home_runs_allowed INTEGER DEFAULT 0,
  is_winner BOOLEAN DEFAULT FALSE,
  is_loser BOOLEAN DEFAULT FALSE,
  is_save BOOLEAN DEFAULT FALSE
);

-- 투수 투구수 추적 (의무 휴식일)
CREATE TABLE IF NOT EXISTS pitcher_pitch_counts (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  match_id INTEGER REFERENCES matches(id),
  tournament_id INTEGER REFERENCES tournaments(id),
  pitches_thrown INTEGER DEFAULT 0,
  match_date TIMESTAMP,
  rest_required_until TIMESTAMP
);

-- 감독 전술 설정
CREATE TABLE IF NOT EXISTS team_tactics (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id) UNIQUE,
  steal_tendency INTEGER DEFAULT 50 CHECK (steal_tendency BETWEEN 0 AND 100),
  bunt_tendency INTEGER DEFAULT 30 CHECK (bunt_tendency BETWEEN 0 AND 100),
  hit_and_run INTEGER DEFAULT 20 CHECK (hit_and_run BETWEEN 0 AND 100),
  pitcher_change_threshold INTEGER DEFAULT 80,
  closer_inning INTEGER DEFAULT 9,
  defensive_shift BOOLEAN DEFAULT FALSE,
  intentional_walk_threshold INTEGER DEFAULT 80,
  pinch_hitter_threshold INTEGER DEFAULT 70,
  aggression INTEGER DEFAULT 50 CHECK (aggression BETWEEN 0 AND 100),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 누적 시즌 타격 스탯
CREATE TABLE IF NOT EXISTS season_batting_stats (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  season_id INTEGER REFERENCES seasons(id),
  team_id INTEGER REFERENCES teams(id),
  games INTEGER DEFAULT 0,
  at_bats INTEGER DEFAULT 0,
  hits INTEGER DEFAULT 0,
  doubles INTEGER DEFAULT 0,
  triples INTEGER DEFAULT 0,
  home_runs INTEGER DEFAULT 0,
  rbi INTEGER DEFAULT 0,
  runs INTEGER DEFAULT 0,
  walks INTEGER DEFAULT 0,
  strikeouts INTEGER DEFAULT 0,
  stolen_bases INTEGER DEFAULT 0,
  batting_avg FLOAT DEFAULT 0,
  obp FLOAT DEFAULT 0,
  slg FLOAT DEFAULT 0,
  ops FLOAT DEFAULT 0,
  UNIQUE(player_id, season_id)
);

-- 누적 시즌 투수 스탯
CREATE TABLE IF NOT EXISTS season_pitching_stats (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  season_id INTEGER REFERENCES seasons(id),
  team_id INTEGER REFERENCES teams(id),
  games INTEGER DEFAULT 0,
  games_started INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  innings_pitched FLOAT DEFAULT 0,
  pitches_total INTEGER DEFAULT 0,
  hits_allowed INTEGER DEFAULT 0,
  runs_allowed INTEGER DEFAULT 0,
  earned_runs INTEGER DEFAULT 0,
  walks_allowed INTEGER DEFAULT 0,
  strikeouts_pitched INTEGER DEFAULT 0,
  home_runs_allowed INTEGER DEFAULT 0,
  era FLOAT DEFAULT 0,
  whip FLOAT DEFAULT 0,
  UNIQUE(player_id, season_id)
);

-- 스폰서 테이블
CREATE TABLE IF NOT EXISTS sponsors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  tier VARCHAR(10) CHECK (tier IN ('골드', '실버', '브론즈')),
  money_per_season BIGINT NOT NULL,
  requirement_min_rank INTEGER,
  requirement_min_reputation INTEGER,
  bonus_description TEXT
);

-- 팀-스폰서 계약
CREATE TABLE IF NOT EXISTS team_sponsors (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  sponsor_id INTEGER REFERENCES sponsors(id),
  season_id INTEGER REFERENCES seasons(id),
  is_active BOOLEAN DEFAULT TRUE,
  signed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, sponsor_id, season_id)
);

-- 훈련 메뉴 테이블
CREATE TABLE IF NOT EXISTS training_menus (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  category VARCHAR(20) CHECK (category IN ('타격', '수비', '투구', '체력', '정신', '팀워크')),
  description TEXT,
  fatigue_cost INTEGER DEFAULT 10,
  stat_target VARCHAR(30),
  stat_gain_min INTEGER DEFAULT 1,
  stat_gain_max INTEGER DEFAULT 3,
  injury_risk FLOAT DEFAULT 0.02
);

-- 훈련 기록
CREATE TABLE IF NOT EXISTS training_logs (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  team_id INTEGER REFERENCES teams(id),
  training_menu_id INTEGER REFERENCES training_menus(id),
  stat_gained INTEGER DEFAULT 0,
  trained_at TIMESTAMP DEFAULT NOW()
);

-- 스카우트 대상 (중학생)
CREATE TABLE IF NOT EXISTS scout_prospects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  school_name VARCHAR(100),
  position VARCHAR(10) NOT NULL,
  is_pitcher BOOLEAN DEFAULT FALSE,
  potential VARCHAR(5) DEFAULT 'C',
  overall_rating INTEGER DEFAULT 30,
  scouted_by INTEGER REFERENCES teams(id),
  is_committed BOOLEAN DEFAULT FALSE,
  committed_team_id INTEGER REFERENCES teams(id),
  season_id INTEGER REFERENCES seasons(id),
  preview_contact INTEGER,
  preview_power INTEGER,
  preview_speed INTEGER,
  preview_fielding INTEGER,
  preview_velocity INTEGER,
  preview_control INTEGER
);

-- 재정 거래 내역
CREATE TABLE IF NOT EXISTS financial_transactions (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  type VARCHAR(30) CHECK (type IN ('스폰서수입', '대회상금', '시설유지비', '장비구매', '스카우트비용', '훈련비용', '구장업그레이드', '관중수입', '기타수입', '기타지출')),
  amount BIGINT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 장비 테이블
CREATE TABLE IF NOT EXISTS equipment (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  category VARCHAR(20) CHECK (category IN ('배트', '글러브', '헬멧', '스파이크', '유니폼', '훈련장비')),
  stat_bonus_target VARCHAR(30),
  stat_bonus_amount INTEGER DEFAULT 1,
  price INTEGER NOT NULL,
  durability INTEGER DEFAULT 100
);

-- 팀 장비
CREATE TABLE IF NOT EXISTS team_equipment (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  equipment_id INTEGER REFERENCES equipment(id),
  quantity INTEGER DEFAULT 1,
  current_durability INTEGER DEFAULT 100,
  purchased_at TIMESTAMP DEFAULT NOW()
);

-- 감독 평판/업적
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title VARCHAR(100) NOT NULL,
  description TEXT,
  earned_at TIMESTAMP DEFAULT NOW()
);

-- 감독 이동 기록
CREATE TABLE IF NOT EXISTS manager_transfers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  from_team_id INTEGER REFERENCES teams(id),
  to_team_id INTEGER REFERENCES teams(id),
  reputation_at_transfer INTEGER,
  season_id INTEGER REFERENCES seasons(id),
  reason VARCHAR(50) DEFAULT '자진이적',
  transferred_at TIMESTAMP DEFAULT NOW()
);

-- 뉴스/이벤트 로그
CREATE TABLE IF NOT EXISTS game_news (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  category VARCHAR(20) CHECK (category IN ('경기결과', '부상', '이적', '대회', '스폰서', '방출', '감독이동', '기타')),
  related_team_id INTEGER REFERENCES teams(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 드래프트 결과 (졸업생 프로 진출)
CREATE TABLE IF NOT EXISTS draft_results (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  season_id INTEGER REFERENCES seasons(id),
  draft_round INTEGER,
  draft_pick INTEGER,
  pro_team_name VARCHAR(100),
  drafted_at TIMESTAMP DEFAULT NOW()
);

-- 날씨 설정
CREATE TABLE IF NOT EXISTS weather_schedule (
  id SERIAL PRIMARY KEY,
  match_date DATE NOT NULL,
  weather VARCHAR(20) DEFAULT '맑음' CHECK (weather IN ('맑음', '흐림', '비', '눈', '바람', '안개', '폭염', '한파')),
  temperature INTEGER DEFAULT 22,
  wind_speed INTEGER DEFAULT 0
);

-- =============================================
-- UNIQUE 제약 보장 (기존 테이블에도 적용)
-- =============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leagues_name_key') THEN
    ALTER TABLE leagues ADD CONSTRAINT leagues_name_key UNIQUE (name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_menus_name_key') THEN
    ALTER TABLE training_menus ADD CONSTRAINT training_menus_name_key UNIQUE (name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sponsors_name_key') THEN
    ALTER TABLE sponsors ADD CONSTRAINT sponsors_name_key UNIQUE (name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_name_key') THEN
    ALTER TABLE equipment ADD CONSTRAINT equipment_name_key UNIQUE (name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stadium_upgrades_name_key') THEN
    ALTER TABLE stadium_upgrades ADD CONSTRAINT stadium_upgrades_name_key UNIQUE (name);
  END IF;
END $$;

-- =============================================
-- 초기 데이터
-- =============================================

-- 5개 리그
INSERT INTO leagues (name, region) VALUES
  ('마가단 서부리그 1', '마가단 서부'),
  ('마가단 서부리그 2', '마가단 서부'),
  ('마가단 동부리그 1', '마가단 동부'),
  ('마가단 동부리그 2', '마가단 동부'),
  ('캄차카-재친 리그', '캄차카-재친')
ON CONFLICT (name) DO NOTHING;

-- 훈련 메뉴
INSERT INTO training_menus (name, category, description, fatigue_cost, stat_target, stat_gain_min, stat_gain_max, injury_risk) VALUES
  ('배팅 연습', '타격', '기본 배팅 연습', 10, 'contact', 1, 3, 0.02),
  ('파워 스윙', '타격', '장타력 훈련', 15, 'power', 1, 3, 0.03),
  ('선구안 훈련', '타격', '볼 판별 훈련', 8, 'eye', 1, 2, 0.01),
  ('주루 훈련', '체력', '베이스 러닝 연습', 12, 'speed', 1, 2, 0.04),
  ('노크 훈련', '수비', '수비 위치별 노크', 10, 'fielding', 1, 3, 0.02),
  ('송구 훈련', '수비', '정확한 송구 연습', 10, 'arm_accuracy', 1, 2, 0.03),
  ('불펜 투구', '투구', '투수 불펜 피칭', 20, 'velocity', 1, 2, 0.05),
  ('제구 훈련', '투구', '코너 타겟 연습', 15, 'control_stat', 1, 3, 0.02),
  ('변화구 연습', '투구', '변화구 반복 투구', 18, 'breaking_ball', 1, 2, 0.04),
  ('체력 훈련', '체력', '러닝 및 웨이트', 20, 'stamina', 1, 3, 0.02),
  ('멘탈 훈련', '정신', '집중력 및 정신력 강화', 5, 'mental', 1, 2, 0.0),
  ('팀 빌딩', '팀워크', '단합 활동', 5, 'chemistry', 2, 5, 0.0)
ON CONFLICT (name) DO NOTHING;

-- 스폰서
INSERT INTO sponsors (name, tier, money_per_season, requirement_min_rank, requirement_min_reputation, bonus_description) VALUES
  ('마가단 스포츠', '브론즈', 500000, NULL, 0, '기본 장비 지원'),
  ('캄차카 슈퍼마켓', '브론즈', 700000, NULL, 20, '음료 지원'),
  ('AR상단 주식회사', '실버', 1500000, 6, 40, '유니폼 지원 + 원정비'),
  ('마피아 그룹', '골드', 3000000, 3, 60, '전면 스폰서 + 시설 지원'),
  ('재친 건설', '실버', 1200000, 5, 35, '구장 보수 지원'),
  ('동부 전자', '골드', 2500000, 2, 70, '전자 장비 + 분석 시스템')
ON CONFLICT (name) DO NOTHING;

-- 장비
INSERT INTO equipment (name, category, stat_bonus_target, stat_bonus_amount, price) VALUES
  ('기본 알루미늄 배트', '배트', 'contact', 1, 50000),
  ('고급 합금 배트', '배트', 'power', 2, 200000),
  ('프로급 목재 배트', '배트', 'contact', 3, 500000),
  ('기본 글러브', '글러브', 'fielding', 1, 30000),
  ('고급 가죽 글러브', '글러브', 'fielding', 2, 150000),
  ('기본 스파이크', '스파이크', 'speed', 1, 40000),
  ('경량 스파이크', '스파이크', 'speed', 2, 180000),
  ('보호 헬멧', '헬멧', NULL, 0, 20000),
  ('피칭 머신', '훈련장비', 'contact', 2, 800000),
  ('스피드건', '훈련장비', 'velocity', 1, 300000)
ON CONFLICT (name) DO NOTHING;

-- 구장 업그레이드 옵션
INSERT INTO stadium_upgrades (name, description, target_field, cost, required_level, capacity_bonus, field_condition_bonus, effect_description) VALUES
  ('관중석 확장', '관중석 500석 추가', 'capacity', 5000000, 1, 500, 0, '관중 수입 증가'),
  ('조명 시설', '야간 경기 가능', 'has_lights', 8000000, 1, 0, 0, '야간 경기 개최 가능'),
  ('전광판 업그레이드', '대형 전광판 설치', 'has_scoreboard', 3000000, 1, 100, 0, '관중 만족도 증가'),
  ('불펜 설치', '투수 전용 불펜', 'has_bullpen', 6000000, 2, 0, 10, '투수 워밍업 효과 향상'),
  ('배팅 케이지', '실내 배팅 연습장', 'has_batting_cage', 7000000, 2, 0, 5, '타격 훈련 효율 +20%'),
  ('비디오 분석실', '경기 영상 분석실', 'has_video_room', 10000000, 3, 0, 0, '전술 분석 능력 향상'),
  ('잔디 교체', '인조잔디→천연잔디', 'field_condition', 15000000, 3, 0, 30, '수비력 향상, 부상 감소'),
  ('외야 펜스 조정', '외야 펜스 거리 변경', 'fence_distance', 4000000, 2, 0, 0, '구장 특성 변경')
ON CONFLICT (name) DO NOTHING;
