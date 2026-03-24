import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import requestIp from 'request-ip';
import pool from '../database/db';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// 회원가입 (IP당 1계정)
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const ip = requestIp.getClientIp(req) || req.ip || 'unknown';

    if (!username || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력해주세요' });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: '아이디는 2~20자여야 합니다' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다' });
    }

    // IP 중복 체크
    const ipCheck = await pool.query('SELECT id FROM users WHERE ip_address = $1', [ip]);
    if (ipCheck.rows.length > 0) {
      return res.status(409).json({ error: '이미 이 IP에서 가입된 계정이 있습니다' });
    }

    // 아이디 중복 체크
    const nameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (nameCheck.rows.length > 0) {
      return res.status(409).json({ error: '이미 사용중인 아이디입니다' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, ip_address) VALUES ($1, $2, $3) RETURNING id, username, role',
      [username, passwordHash, ip]
    );

    const user = result.rows[0];
    const token = generateToken({ id: user.id, username: user.username, role: user.role, teamId: null });

    res.json({ token, user: { id: user.id, username: user.username, role: user.role, teamId: null } });
  } catch (error) {
    console.error('회원가입 에러:', error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 로그인
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      'SELECT id, username, password_hash, role, team_id FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });
    }

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      teamId: user.team_id
    });

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, teamId: user.team_id }
    });
  } catch (error) {
    console.error('로그인 에러:', error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 팀 선택
router.post('/select-team', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.body;
    const userId = req.user!.id;

    // 이미 팀이 있는지 확인
    const userCheck = await pool.query('SELECT team_id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows[0].team_id) {
      return res.status(400).json({ error: '이미 팀을 선택했습니다' });
    }

    // 팀이 이미 다른 유저에게 선택되었는지 확인
    const teamCheck = await pool.query('SELECT owner_id FROM teams WHERE id = $1', [teamId]);
    if (teamCheck.rows.length === 0) {
      return res.status(404).json({ error: '존재하지 않는 팀입니다' });
    }
    if (teamCheck.rows[0].owner_id) {
      return res.status(409).json({ error: '이미 다른 감독이 관리하는 팀입니다' });
    }

    await pool.query('UPDATE users SET team_id = $1 WHERE id = $2', [teamId, userId]);
    await pool.query('UPDATE teams SET owner_id = $1 WHERE id = $2', [userId, teamId]);

    const token = generateToken({
      id: req.user!.id,
      username: req.user!.username,
      role: req.user!.role,
      teamId
    });

    res.json({ token, teamId });
  } catch (error) {
    console.error('팀 선택 에러:', error);
    res.status(500).json({ error: '서버 에러' });
  }
});

// 내 정보
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.role, u.team_id, u.reputation, u.created_at,
              t.name as team_name, l.name as league_name
       FROM users u
       LEFT JOIN teams t ON u.team_id = t.id
       LEFT JOIN leagues l ON t.league_id = l.id
       WHERE u.id = $1`,
      [req.user!.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: '서버 에러' });
  }
});

export default router;
