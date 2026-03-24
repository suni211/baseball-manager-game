import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import dotenv from 'dotenv';
import { Server as SocketServer } from 'socket.io';
import { initDatabase } from './database/init';
import { SeasonScheduler } from './services/seasonScheduler';
import { RealtimeMatchService } from './services/realtimeMatch';
import authRoutes from './routes/auth';
import teamRoutes from './routes/teams';
import playerRoutes from './routes/players';
import matchRoutes from './routes/matches';
import trainingRoutes from './routes/training';
import adminRoutes from './routes/admin';
import scoutRoutes from './routes/scout';
import sponsorRoutes from './routes/sponsors';
import tacticsRoutes from './routes/tactics';
import stadiumRoutes from './routes/stadium';
import managerRoutes from './routes/manager';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// HTTP 서버 생성 (socket.io 연동용)
const server = http.createServer(app);

// Socket.IO 설정
const io = new SocketServer(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(cors());
app.use(express.json());

// 실시간 경기 서비스 & 시즌 스케줄러 인스턴스
const realtimeMatchService = new RealtimeMatchService(io);
const seasonScheduler = new SeasonScheduler();
seasonScheduler.setRealtimeService(realtimeMatchService);

// app에 서비스 인스턴스 저장 (라우트에서 접근 가능)
app.set('io', io);
app.set('realtimeMatchService', realtimeMatchService);
app.set('seasonScheduler', seasonScheduler);

// 라우트
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/scout', scoutRoutes);
app.use('/api/sponsors', sponsorRoutes);
app.use('/api/tactics', tacticsRoutes);
app.use('/api/stadium', stadiumRoutes);
app.use('/api/manager', managerRoutes);

// 리그 정보
app.get('/api/leagues', async (_req, res) => {
  const pool = (await import('./database/db')).default;
  try {
    const result = await pool.query('SELECT * FROM leagues ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 뉴스
app.get('/api/news', async (req, res) => {
  const pool = (await import('./database/db')).default;
  try {
    const { teamId, limit } = req.query;
    let query = `SELECT gn.*, t.name as team_name FROM game_news gn LEFT JOIN teams t ON gn.related_team_id = t.id`;
    const params: any[] = [];
    if (teamId) { params.push(teamId); query += ` WHERE gn.related_team_id = $1`; }
    query += ` ORDER BY gn.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit || 50);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 장비 목록
app.get('/api/equipment', async (_req, res) => {
  const pool = (await import('./database/db')).default;
  try {
    const result = await pool.query('SELECT * FROM equipment ORDER BY category, price');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 라이브 경기 현황 API
app.get('/api/matches/live', (_req, res) => {
  try {
    const count = realtimeMatchService.getLiveMatchCount();
    res.json({ liveMatchCount: count });
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 시즌 현재 상태 API
app.get('/api/season/current', async (_req, res) => {
  const pool = (await import('./database/db')).default;
  try {
    const result = await pool.query(
      'SELECT id, year, current_phase, is_active, started_at FROM seasons WHERE is_active = TRUE ORDER BY id DESC LIMIT 1'
    );
    if (result.rows.length === 0) {
      res.json({ season: null });
    } else {
      res.json({ season: result.rows[0] });
    }
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

// 예정 경기 재분배 (팀 충돌 제거)
app.post('/api/system/redistribute-matches', async (_req, res) => {
  const pool = (await import('./database/db')).default;
  try {
    // 현재 시즌
    const season = await pool.query('SELECT id FROM seasons WHERE is_active = TRUE ORDER BY id DESC LIMIT 1');
    if (season.rows.length === 0) return res.status(400).json({ error: '활성 시즌 없음' });
    const seasonId = season.rows[0].id;

    // 예정 경기 조회
    const matches = await pool.query(
      `SELECT id, home_team_id, away_team_id FROM matches
       WHERE season_id = $1 AND status = '예정' ORDER BY id`,
      [seasonId]
    );
    if (matches.rows.length === 0) return res.json({ message: '재분배할 경기 없음' });

    // 시간대 생성 (09:00~22:00, 며칠에 걸쳐)
    const now = new Date();
    const startTime = new Date(now);
    startTime.setMinutes(0, 0, 0);
    if (startTime <= now) startTime.setHours(startTime.getHours() + 1);
    if (startTime.getHours() < 9) startTime.setHours(9, 0, 0, 0);

    const timeSlots: Date[] = [];
    let slotTime = new Date(startTime);
    for (let h = 0; h < 56; h++) { // 4일치
      if (slotTime.getHours() >= 23) {
        slotTime.setDate(slotTime.getDate() + 1);
        slotTime.setHours(9, 0, 0, 0);
      }
      timeSlots.push(new Date(slotTime));
      slotTime = new Date(slotTime.getTime() + 60 * 60 * 1000);
    }

    // 팀 충돌 없이 경기 배정
    const slotTeams: Map<number, Set<number>> = new Map();
    timeSlots.forEach((_, i) => slotTeams.set(i, new Set()));

    const unassigned = [...matches.rows];
    const assignments: { matchId: number; slotIndex: number }[] = [];

    let slotIdx = 0;
    let retries = 0;
    const maxRetries = unassigned.length * timeSlots.length;

    while (unassigned.length > 0 && retries < maxRetries) {
      const match = unassigned[0];
      const teams = slotTeams.get(slotIdx)!;

      if (!teams.has(match.home_team_id) && !teams.has(match.away_team_id)) {
        teams.add(match.home_team_id);
        teams.add(match.away_team_id);
        assignments.push({ matchId: match.id, slotIndex: slotIdx });
        unassigned.shift();
        retries = 0;
      } else {
        retries++;
      }
      slotIdx = (slotIdx + 1) % timeSlots.length;
    }

    // 남은 경기 강제 배정
    for (const match of unassigned) {
      assignments.push({ matchId: match.id, slotIndex: slotIdx % timeSlots.length });
      slotIdx++;
    }

    // DB 업데이트
    for (const { matchId, slotIndex } of assignments) {
      await pool.query('UPDATE matches SET match_date = $1 WHERE id = $2', [timeSlots[slotIndex], matchId]);
    }

    res.json({ message: `${assignments.length}경기 재분배 완료`, forced: unassigned.length });
  } catch (error) {
    console.error('재분배 에러:', error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 프로덕션: 클라이언트 정적 파일 서빙
const clientPath = path.join(__dirname, 'public');
app.use(express.static(clientPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

async function start() {
  // 서버를 먼저 띄워서 Fly.io 헬스체크 통과
  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`서버 실행중: http://0.0.0.0:${PORT}`);
    console.log(`Socket.IO 활성화됨`);
  });

  // DB 초기화는 서버 시작 후 백그라운드에서
  setTimeout(async () => {
    try {
      await initDatabase();
      console.log('DB 초기화 완료');
    } catch (error) {
      console.error('DB 초기화 실패:', error);
    }

    // 시즌 스케줄러 시작
    try {
      await seasonScheduler.start();
      console.log('[시즌스케줄러] 자동 시즌 스케줄러가 시작되었습니다.');
    } catch (error) {
      console.error('[시즌스케줄러] 스케줄러 시작 실패:', error);
    }
  }, 2000);
}

// 서버 종료 시 정리
process.on('SIGINT', () => {
  console.log('서버 종료 중...');
  seasonScheduler.stop();
  realtimeMatchService.cleanup();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('서버 종료 중...');
  seasonScheduler.stop();
  realtimeMatchService.cleanup();
  server.close();
  process.exit(0);
});

start();
