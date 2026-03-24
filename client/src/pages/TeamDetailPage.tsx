import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';

export default function TeamDetailPage() {
  const { id } = useParams();
  const [team, setTeam] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [tab, setTab] = useState('로스터');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [teamRes, playersRes, matchesRes] = await Promise.all([
        api.get(`/teams/${id}`),
        api.get(`/players/team/${id}`),
        api.get(`/matches/schedule?teamId=${id}`)
      ]);
      setTeam(teamRes.data);
      setPlayers(playersRes.data || []);
      const allMatches = matchesRes.data || [];
      setMatches(allMatches.filter((m: any) => m.status === '완료').slice(-15).reverse());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">팀 정보 불러오는 중...</div>;
  if (!team) return <div className="empty-state"><p>팀을 찾을 수 없습니다</p></div>;

  const pitchers = players.filter(p => p.is_pitcher);
  const batters = players.filter(p => !p.is_pitcher);
  const lineup = batters.filter(p => p.batting_order).sort((a, b) => a.batting_order - b.batting_order);
  const wins = team.wins || 0;
  const losses = team.losses || 0;
  const wr = (wins + losses) > 0 ? (wins / (wins + losses)).toFixed(3) : '.000';

  const statColor = (val: number) => val >= 70 ? 'stat-val-high' : val >= 50 ? 'stat-val-mid' : 'stat-val-low';

  return (
    <div>
      {/* 팀 헤더 */}
      <div style={{ marginBottom: 4 }}>
        <Link to="/league" className="text-sm text-muted">&larr; 리그 목록</Link>
      </div>
      <div className="card mb-4">
        <div className="flex-between">
          <div>
            <h1 className="text-xl font-black">{team.name}</h1>
            <p className="text-sm text-muted mt-1">
              {team.league_name || '리그 미배정'}
              {team.owner_name && <> &middot; {team.owner_name} 감독</>}
            </p>
          </div>
          <div className="flex gap-4" style={{ alignItems: 'center' }}>
            <div className="text-center">
              <p className="text-xs text-muted">전적</p>
              <p className="font-black" style={{ fontSize: 18 }}>
                <span className="text-green">{wins}</span>
                <span className="text-muted"> - </span>
                <span className="text-red">{losses}</span>
              </p>
              <p className="text-xs text-muted">승률 {wr}</p>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border-primary)' }}></div>
            <div className="text-center">
              <p className="text-xs text-muted">사기</p>
              <p className={`text-lg font-bold ${statColor(team.morale || 0)}`}>{team.morale ?? '-'}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted">화학</p>
              <p className={`text-lg font-bold ${statColor(team.chemistry || 0)}`}>{team.chemistry ?? '-'}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted">인기</p>
              <p className={`text-lg font-bold ${statColor(team.popularity || 0)}`}>{team.popularity ?? '-'}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted">예산</p>
              <p className="text-lg font-bold text-yellow">{((team.budget || 0) / 10000).toFixed(0)}만</p>
            </div>
          </div>
        </div>
      </div>

      {/* 구장 정보 */}
      {team.stadium_name && (
        <div className="card mb-4">
          <div className="flex-between">
            <h3 className="font-bold">구장: {team.stadium_name}</h3>
            <div className="flex gap-4">
              <span className="text-sm text-secondary">수용: {(team.capacity || 0).toLocaleString()}석</span>
              {team.field_condition && <span className="text-sm text-secondary">필드: {team.field_condition}</span>}
              {team.fence_distance && <span className="text-sm text-secondary">외야: {team.fence_distance}m</span>}
              {team.has_lights && <span className="badge green" style={{ fontSize: 10 }}>조명 있음</span>}
              {team.upgrade_level > 0 && <span className="badge blue" style={{ fontSize: 10 }}>업그레이드 Lv.{team.upgrade_level}</span>}
            </div>
          </div>
        </div>
      )}

      {/* 탭 */}
      <div className="tabs">
        {['로스터', '타순', '투수진', '최근경기'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* 로스터 탭 */}
      {tab === '로스터' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-primary)' }}>
            <h3 className="font-bold">전체 로스터 ({players.length}명)
              <span className="text-muted text-sm" style={{ fontWeight: 400, marginLeft: 8 }}>
                투수 {pitchers.length} / 야수 {batters.length}
              </span>
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>이름</th><th>포지션</th><th>학년</th><th>잠재력</th>
                  <th style={{ textAlign: 'center' }}>컨택</th>
                  <th style={{ textAlign: 'center' }}>파워</th>
                  <th style={{ textAlign: 'center' }}>스피드</th>
                  <th style={{ textAlign: 'center' }}>수비</th>
                  <th style={{ textAlign: 'center' }}>컨디션</th>
                </tr>
              </thead>
              <tbody>
                {batters.sort((a, b) => (b.contact + b.power) - (a.contact + a.power)).map(p => (
                  <tr key={p.id} style={{ opacity: p.is_injured ? 0.5 : 1 }}>
                    <td>
                      <Link to={`/player/${p.id}`} className="font-bold">{p.name}</Link>
                      {p.roster_status === '선발로스터' && <span className="badge green" style={{ marginLeft: 4, fontSize: 9 }}>선발</span>}
                      {p.is_injured && <span className="badge red" style={{ marginLeft: 4, fontSize: 9 }}>부상</span>}
                    </td>
                    <td className="text-sm">{p.position}</td>
                    <td className="text-sm">{p.grade}학년</td>
                    <td>
                      <span className={`badge ${p.potential === 'S' ? 'gold' : p.potential === 'A' ? 'blue' : p.potential === 'B' ? 'green' : 'silver'}`}>
                        {p.potential}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.contact)}>{p.contact}</td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.power)}>{p.power}</td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.speed)}>{p.speed}</td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.fielding)}>{p.fielding}</td>
                    <td style={{ textAlign: 'center', color: p.condition > 70 ? '#4ade80' : p.condition > 40 ? '#fbbf24' : '#f87171' }}>{p.condition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 타순 탭 */}
      {tab === '타순' && (
        <div className="card">
          <h3 className="font-bold mb-3">현재 타순</h3>
          {lineup.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>타순</th>
                  <th>이름</th><th>포지션</th>
                  <th style={{ textAlign: 'center' }}>컨택</th>
                  <th style={{ textAlign: 'center' }}>파워</th>
                  <th style={{ textAlign: 'center' }}>선구안</th>
                  <th style={{ textAlign: 'center' }}>스피드</th>
                </tr>
              </thead>
              <tbody>
                {lineup.map(p => (
                  <tr key={p.id}>
                    <td className="font-bold text-blue" style={{ fontSize: 16 }}>{p.batting_order}번</td>
                    <td><Link to={`/player/${p.id}`} className="font-bold">{p.name}</Link></td>
                    <td className="text-sm">{p.lineup_position || p.position}</td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.contact)}>{p.contact}</td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.power)}>{p.power}</td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.eye)}>{p.eye}</td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.speed)}>{p.speed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state"><p>타순이 설정되지 않았습니다</p></div>
          )}
        </div>
      )}

      {/* 투수진 탭 */}
      {tab === '투수진' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-primary)' }}>
            <h3 className="font-bold">투수진 ({pitchers.length}명)</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>이름</th><th>역할</th><th>학년</th>
                  <th style={{ textAlign: 'center' }}>구속</th>
                  <th style={{ textAlign: 'center' }}>제구</th>
                  <th style={{ textAlign: 'center' }}>체력</th>
                  <th style={{ textAlign: 'center' }}>변화구</th>
                  <th style={{ textAlign: 'center' }}>멘탈</th>
                  <th style={{ textAlign: 'center' }}>컨디션</th>
                </tr>
              </thead>
              <tbody>
                {pitchers.sort((a, b) => {
                  const roleOrder: Record<string, number> = { '선발': 0, '중계': 1, '마무리': 2 };
                  return (roleOrder[a.pitcher_role] || 9) - (roleOrder[b.pitcher_role] || 9);
                }).map(p => (
                  <tr key={p.id} style={{ opacity: p.is_injured ? 0.5 : 1 }}>
                    <td>
                      <Link to={`/player/${p.id}`} className="font-bold">{p.name}</Link>
                      {p.is_injured && <span className="badge red" style={{ marginLeft: 4, fontSize: 9 }}>부상</span>}
                    </td>
                    <td>
                      <span className={`badge ${p.pitcher_role === '선발' ? 'blue' : p.pitcher_role === '마무리' ? 'red' : 'silver'}`}>
                        {p.pitcher_role || '미정'}
                      </span>
                    </td>
                    <td className="text-sm">{p.grade}학년</td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.velocity)}>{p.velocity}</td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.control_stat)}>{p.control_stat}</td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.stamina)}>{p.stamina}</td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.breaking_ball)}>{p.breaking_ball}</td>
                    <td style={{ textAlign: 'center' }} className={statColor(p.mental)}>{p.mental}</td>
                    <td style={{ textAlign: 'center', color: p.condition > 70 ? '#4ade80' : p.condition > 40 ? '#fbbf24' : '#f87171' }}>{p.condition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 최근경기 탭 */}
      {tab === '최근경기' && (
        <div className="card">
          <h3 className="font-bold mb-3">최근 경기</h3>
          {matches.length > 0 ? (
            <div className="flex-col gap-2">
              {matches.map((m: any) => {
                const teamId = Number(id);
                const isHome = m.home_team_id === teamId;
                const myScore = isHome ? m.home_score : m.away_score;
                const theirScore = isHome ? m.away_score : m.home_score;
                const won = myScore > theirScore;
                const draw = myScore === theirScore;
                return (
                  <Link key={m.id} to={`/match/${m.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="match-card">
                      <div style={{ minWidth: 50 }}>
                        <span className={`badge ${isHome ? 'blue' : 'silver'}`} style={{ fontSize: 10 }}>
                          {isHome ? '홈' : '원정'}
                        </span>
                      </div>
                      <span className="team-name text-right" style={{ flex: 1 }}>{m.home_name}</span>
                      <div className="score-display" style={{ minWidth: 80, textAlign: 'center' }}>
                        <span className={m.home_score > m.away_score ? 'text-green' : ''}>{m.home_score}</span>
                        <span className="text-muted"> - </span>
                        <span className={m.away_score > m.home_score ? 'text-green' : ''}>{m.away_score}</span>
                      </div>
                      <span className="team-name" style={{ flex: 1 }}>{m.away_name}</span>
                      <div style={{ minWidth: 40 }}>
                        <span className={`badge ${won ? 'green' : draw ? 'silver' : 'red'}`}>
                          {won ? '승' : draw ? '무' : '패'}
                        </span>
                      </div>
                      <span className="text-xs text-muted">{new Date(m.match_date).toLocaleDateString('ko-KR')}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="empty-state"><p>경기 기록이 없습니다</p></div>
          )}
        </div>
      )}

      {/* 스폰서 */}
      {team.sponsors && team.sponsors.length > 0 && (
        <div className="card mt-4">
          <div className="card-header">
            <h3>스폰서</h3>
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
