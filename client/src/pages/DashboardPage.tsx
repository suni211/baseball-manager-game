import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

interface Props {
  user: { id: number; username: string; role: string; teamId: number | null };
}

function StatBarInline({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const cls = value >= 70 ? 'stat-high' : value >= 45 ? 'stat-mid' : 'stat-low';
  return (
    <div className="stat-bar" style={{ height: 6, marginTop: 6 }}>
      <div className={`stat-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function DashboardPage({ user }: Props) {
  const [team, setTeam] = useState<any>(null);
  const [news, setNews] = useState<any[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<any[]>([]);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [topBatters, setTopBatters] = useState<any[]>([]);
  const [topPitchers, setTopPitchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [teamRes, newsRes, scheduleRes, playersRes] = await Promise.all([
        api.get(`/teams/${user.teamId}`),
        api.get(`/news?teamId=${user.teamId}&limit=10`),
        api.get(`/matches/schedule?teamId=${user.teamId}`),
        api.get(`/players/team/${user.teamId}`)
      ]);

      const teamData = teamRes.data;
      setTeam(teamData);
      setNews(newsRes.data || []);

      const matches = scheduleRes.data || [];
      setUpcomingMatches(matches.filter((m: any) => m.status === '예정').slice(0, 5));
      setRecentMatches(matches.filter((m: any) => m.status === '완료').slice(-5).reverse());

      // Top players
      const players = playersRes.data || [];
      const batters = players.filter((p: any) => !p.is_pitcher).sort((a: any, b: any) => {
        const aOvr = (a.contact + a.power + a.eye + a.speed) / 4;
        const bOvr = (b.contact + b.power + b.eye + b.speed) / 4;
        return bOvr - aOvr;
      });
      setTopBatters(batters.slice(0, 5));

      const pitchers = players.filter((p: any) => p.is_pitcher).sort((a: any, b: any) => {
        const aOvr = (a.velocity + a.control_stat + a.stamina + a.breaking_ball) / 4;
        const bOvr = (b.velocity + b.control_stat + b.stamina + b.breaking_ball) / 4;
        return bOvr - aOvr;
      });
      setTopPitchers(pitchers.slice(0, 5));

      // Load standings for the team's tournament
      try {
        const tourRes = await api.get('/matches/tournaments/list');
        const tournaments = tourRes.data || [];
        if (tournaments.length > 0) {
          const standingsRes = await api.get(`/matches/tournament/${tournaments[0].id}/standings`);
          setStandings(standingsRes.data || []);
        }
      } catch { /* ignore */ }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">데이터 불러오는 중...</div>;
  if (!team) return <div className="empty-state"><p>팀 정보를 불러올 수 없습니다</p></div>;

  const wins = team.wins || 0;
  const losses = team.losses || 0;
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)).toFixed(3) : '.000';

  const myRank = standings.findIndex((s: any) => s.team_id === user.teamId) + 1;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>{team.name}</h1>
          <p className="text-secondary text-sm" style={{ marginTop: 4 }}>
            {team.league_name || '리그 미배정'} &middot; 감독 {user.username}
          </p>
        </div>
        <div className="flex gap-2">
          {myRank > 0 && (
            <span className="badge blue" style={{ fontSize: 13, padding: '6px 14px' }}>
              현재 순위 {myRank}위
            </span>
          )}
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid-5 mb-4">
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="text-muted text-xs" style={{ marginBottom: 4 }}>전적</p>
          <p className="text-lg font-black">
            <span className="text-green">{wins}</span>
            <span className="text-muted"> / </span>
            <span className="text-red">{losses}</span>
          </p>
          <p className="text-muted text-xs" style={{ marginTop: 4 }}>승률 {winRate}</p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="text-muted text-xs" style={{ marginBottom: 4 }}>예산</p>
          <p className="text-lg font-bold text-green">{Number(team.budget || 0).toLocaleString()}<span className="text-sm text-muted">원</span></p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="text-muted text-xs" style={{ marginBottom: 4 }}>팀 사기</p>
          <p className="text-lg font-bold">{team.morale ?? '-'}</p>
          <StatBarInline value={team.morale || 0} />
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="text-muted text-xs" style={{ marginBottom: 4 }}>팀 화학</p>
          <p className="text-lg font-bold">{team.chemistry ?? '-'}</p>
          <StatBarInline value={team.chemistry || 0} />
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="text-muted text-xs" style={{ marginBottom: 4 }}>인기도</p>
          <p className="text-lg font-bold">{team.popularity ?? '-'}</p>
          <StatBarInline value={team.popularity || 0} />
        </div>
      </div>

      <div className="grid-2 mb-4">
        {/* Next Match */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: 15 }}>다가오는 경기</h3>
            <Link to="/schedule" className="text-sm">전체 보기 &rarr;</Link>
          </div>
          {upcomingMatches.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <p className="text-sm">예정된 경기가 없습니다</p>
            </div>
          ) : (
            <div className="flex-col gap-2">
              {upcomingMatches.map(m => {
                const isHome = m.home_team_id === user.teamId;
                return (
                  <div key={m.id} className="match-card" style={{ marginBottom: 0, padding: '12px 16px' }}>
                    <div style={{ flex: 1 }}>
                      <div className="flex gap-2" style={{ alignItems: 'center' }}>
                        <span className={`badge ${isHome ? 'blue' : 'silver'}`} style={{ fontSize: 10 }}>
                          {isHome ? '홈' : '원정'}
                        </span>
                        <span className="font-bold text-sm">
                          vs {isHome ? m.away_name : m.home_name}
                        </span>
                      </div>
                      <p className="text-muted text-xs" style={{ marginTop: 4 }}>
                        {m.tournament_name} &middot; {m.stage || ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p className="text-sm font-bold">
                        {new Date(m.match_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-xs text-muted">
                        {new Date(m.match_date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Results */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: 15 }}>최근 경기 결과</h3>
            <Link to="/schedule" className="text-sm">전체 보기 &rarr;</Link>
          </div>
          {recentMatches.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <p className="text-sm">경기 결과가 없습니다</p>
            </div>
          ) : (
            <div className="flex-col gap-2">
              {recentMatches.map(m => {
                const isHome = m.home_team_id === user.teamId;
                const myScore = isHome ? m.home_score : m.away_score;
                const theirScore = isHome ? m.away_score : m.home_score;
                const won = myScore > theirScore;
                const draw = myScore === theirScore;
                return (
                  <Link to={`/match/${m.id}`} key={m.id} className="match-card" style={{ marginBottom: 0, padding: '12px 16px', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ flex: 1 }}>
                      <span className="font-bold text-sm">
                        vs {isHome ? m.away_name : m.home_name}
                      </span>
                      <p className="text-xs text-muted" style={{ marginTop: 2 }}>
                        {new Date(m.match_date).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    <div className="flex gap-3" style={{ alignItems: 'center' }}>
                      <span className="score-display" style={{ fontSize: 18 }}>
                        {myScore} - {theirScore}
                      </span>
                      <span className={`badge ${won ? 'green' : draw ? 'silver' : 'red'}`}>
                        {won ? '승' : draw ? '무' : '패'}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2 mb-4">
        {/* Top Batters */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: 15 }}>주요 타자 (능력치 TOP 5)</h3>
            <Link to="/roster" className="text-sm">전체 로스터 &rarr;</Link>
          </div>
          {topBatters.length === 0 ? (
            <p className="text-muted text-sm">타자 데이터 없음</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>포지션</th>
                  <th>컨택</th>
                  <th>파워</th>
                  <th>선구안</th>
                  <th>스피드</th>
                  <th>종합</th>
                </tr>
              </thead>
              <tbody>
                {topBatters.map((p: any) => {
                  const ovr = Math.round((p.contact + p.power + p.eye + p.speed) / 4);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/player/${p.id}`} style={{ fontWeight: 700 }}>{p.name}</Link>
                      </td>
                      <td className="text-sm">{p.position}</td>
                      <td className={p.contact >= 70 ? 'stat-val-high' : p.contact >= 50 ? 'stat-val-mid' : 'stat-val-low'}>{p.contact}</td>
                      <td className={p.power >= 70 ? 'stat-val-high' : p.power >= 50 ? 'stat-val-mid' : 'stat-val-low'}>{p.power}</td>
                      <td className={p.eye >= 70 ? 'stat-val-high' : p.eye >= 50 ? 'stat-val-mid' : 'stat-val-low'}>{p.eye}</td>
                      <td className={p.speed >= 70 ? 'stat-val-high' : p.speed >= 50 ? 'stat-val-mid' : 'stat-val-low'}>{p.speed}</td>
                      <td className="font-black">{ovr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Top Pitchers */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: 15 }}>주요 투수 (능력치 TOP 5)</h3>
            <Link to="/roster" className="text-sm">전체 로스터 &rarr;</Link>
          </div>
          {topPitchers.length === 0 ? (
            <p className="text-muted text-sm">투수 데이터 없음</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>역할</th>
                  <th>구속</th>
                  <th>제구</th>
                  <th>체력</th>
                  <th>변화구</th>
                  <th>종합</th>
                </tr>
              </thead>
              <tbody>
                {topPitchers.map((p: any) => {
                  const ovr = Math.round((p.velocity + p.control_stat + p.stamina + p.breaking_ball) / 4);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/player/${p.id}`} style={{ fontWeight: 700 }}>{p.name}</Link>
                      </td>
                      <td className="text-sm text-muted">{p.pitcher_role || '-'}</td>
                      <td className={p.velocity >= 70 ? 'stat-val-high' : p.velocity >= 50 ? 'stat-val-mid' : 'stat-val-low'}>{p.velocity}</td>
                      <td className={p.control_stat >= 70 ? 'stat-val-high' : p.control_stat >= 50 ? 'stat-val-mid' : 'stat-val-low'}>{p.control_stat}</td>
                      <td className={p.stamina >= 70 ? 'stat-val-high' : p.stamina >= 50 ? 'stat-val-mid' : 'stat-val-low'}>{p.stamina}</td>
                      <td className={p.breaking_ball >= 70 ? 'stat-val-high' : p.breaking_ball >= 50 ? 'stat-val-mid' : 'stat-val-low'}>{p.breaking_ball}</td>
                      <td className="font-black">{ovr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid-4 mb-4">
        <Link to="/tactics" className="quick-link">
          <div className="icon">&#9881;</div>
          <div><div className="label">전술 설정</div><p className="text-xs text-muted">팀 전략 변경</p></div>
        </Link>
        <Link to="/lineup" className="quick-link">
          <div className="icon">&#9776;</div>
          <div><div className="label">타순 편집</div><p className="text-xs text-muted">라인업 구성</p></div>
        </Link>
        <Link to="/training" className="quick-link">
          <div className="icon">&#9889;</div>
          <div><div className="label">훈련</div><p className="text-xs text-muted">선수 능력 향상</p></div>
        </Link>
        <Link to="/scout" className="quick-link">
          <div className="icon">&#128270;</div>
          <div><div className="label">스카우트</div><p className="text-xs text-muted">신인 발굴</p></div>
        </Link>
      </div>

      {/* News Feed */}
      <div className="card">
        <div className="card-header">
          <h3 style={{ fontSize: 15 }}>최근 뉴스</h3>
        </div>
        {news.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <p className="text-sm">뉴스가 없습니다</p>
          </div>
        ) : (
          <div className="flex-col">
            {news.map(n => (
              <div key={n.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-primary)' }}>
                <div className="flex-between">
                  <span className="text-sm font-bold">{n.title}</span>
                  <div className="flex gap-2" style={{ alignItems: 'center' }}>
                    <span className="badge blue">{n.category}</span>
                    <span className="text-xs text-muted">
                      {new Date(n.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-secondary" style={{ marginTop: 4 }}>{n.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sponsors */}
      {team.sponsors && team.sponsors.length > 0 && (
        <div className="card mt-4">
          <div className="card-header">
            <h3 style={{ fontSize: 15 }}>현재 스폰서</h3>
          </div>
          <div className="grid-3">
            {team.sponsors.map((s: any) => (
              <div key={s.id} style={{
                padding: 14,
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-primary)'
              }}>
                <div className="flex-between">
                  <span className="font-bold">{s.name}</span>
                  <span className={`badge ${s.tier === '골드' ? 'gold' : s.tier === '실버' ? 'silver' : 'bronze'}`}>{s.tier}</span>
                </div>
                <p className="text-sm text-green" style={{ marginTop: 8 }}>
                  +{Number(s.money_per_season).toLocaleString()}원/시즌
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
