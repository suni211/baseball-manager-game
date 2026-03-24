import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

interface Props {
  user?: { teamId: number | null };
}

export default function StandingsPage({ user }: Props) {
  const [leagues, setLeagues] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selectedTab, setSelectedTab] = useState<string>('leagues');
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<number | null>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const tabRef = useRef(selectedTab);
  const leagueRef = useRef(selectedLeague);
  const tournamentRef = useRef(selectedTournament);
  tabRef.current = selectedTab;
  leagueRef.current = selectedLeague;
  tournamentRef.current = selectedTournament;

  useEffect(() => {
    loadInitialData();

    // 30초마다 자동 갱신
    const interval = setInterval(() => {
      if (tabRef.current === 'leagues' && leagueRef.current) {
        loadLeagueTeams(leagueRef.current);
      } else if (tabRef.current === 'tournaments' && tournamentRef.current) {
        loadTournamentStandings(tournamentRef.current);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadInitialData = async () => {
    try {
      const [leaguesRes, tournamentsRes] = await Promise.all([
        api.get('/leagues'),
        api.get('/matches/tournaments/list')
      ]);
      setLeagues(leaguesRes.data || []);
      setTournaments(tournamentsRes.data || []);

      // Load league teams first
      if (leaguesRes.data && leaguesRes.data.length > 0) {
        setSelectedLeague(leaguesRes.data[0].id);
        await loadLeagueTeams(leaguesRes.data[0].id);
      }

      // Also check tournaments
      if (tournamentsRes.data && tournamentsRes.data.length > 0) {
        setSelectedTournament(tournamentsRes.data[0].id);
      }
    } catch (err) {
      console.error('데이터 로딩 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLeagueTeams = async (leagueId: number) => {
    try {
      const res = await api.get(`/teams/league/${leagueId}`);
      setTeams(res.data || []);
    } catch (err) {
      console.error(err);
      setTeams([]);
    }
  };

  const loadTournamentStandings = async (tournamentId: number) => {
    try {
      const res = await api.get(`/matches/tournament/${tournamentId}/standings`);
      setStandings(res.data || []);
    } catch (err) {
      console.error(err);
      setStandings([]);
    }
  };

  useEffect(() => {
    if (selectedLeague && selectedTab === 'leagues') {
      loadLeagueTeams(selectedLeague);
    }
  }, [selectedLeague]);

  useEffect(() => {
    if (selectedTournament && selectedTab === 'tournaments') {
      loadTournamentStandings(selectedTournament);
    }
  }, [selectedTournament, selectedTab]);

  if (loading) return <div className="loading">순위 데이터 불러오는 중...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>순위표</h1>
      </div>

      {/* Main Tabs: Leagues vs Tournaments */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button
          className={`tab ${selectedTab === 'leagues' ? 'active' : ''}`}
          onClick={() => setSelectedTab('leagues')}
        >
          리그 순위
        </button>
        <button
          className={`tab ${selectedTab === 'tournaments' ? 'active' : ''}`}
          onClick={() => setSelectedTab('tournaments')}
        >
          대회 순위
        </button>
      </div>

      {/* League Tab */}
      {selectedTab === 'leagues' && (
        <>
          {leagues.length === 0 ? (
            <div className="empty-state">
              <p>등록된 리그가 없습니다</p>
            </div>
          ) : (
            <>
              <div className="tabs">
                {leagues.map(l => (
                  <button
                    key={l.id}
                    className={`tab ${selectedLeague === l.id ? 'active' : ''}`}
                    onClick={() => setSelectedLeague(l.id)}
                  >
                    {l.name}
                  </button>
                ))}
              </div>

              {teams.length === 0 ? (
                <div className="empty-state">
                  <p>이 리그에 소속된 팀이 없습니다</p>
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 50 }}>순위</th>
                          <th>팀명</th>
                          <th>감독</th>
                          <th style={{ textAlign: 'center' }}>승</th>
                          <th style={{ textAlign: 'center' }}>패</th>
                          <th style={{ textAlign: 'center' }}>승률</th>
                          <th style={{ textAlign: 'center' }}>예산</th>
                          <th style={{ textAlign: 'center' }}>사기</th>
                          <th style={{ textAlign: 'center' }}>화학</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teams
                          .sort((a, b) => {
                            const aWR = (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0;
                            const bWR = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : 0;
                            return bWR - aWR || (b.wins - b.losses) - (a.wins - a.losses);
                          })
                          .map((t, idx) => {
                            const wr = (t.wins + t.losses) > 0
                              ? (t.wins / (t.wins + t.losses)).toFixed(3)
                              : '.000';
                            const isMyTeam = user?.teamId === t.id;
                            return (
                              <tr key={t.id} className={isMyTeam ? 'highlight-row' : ''}>
                                <td style={{ textAlign: 'center' }}>
                                  <span style={{
                                    fontWeight: 800,
                                    color: idx === 0 ? 'var(--yellow-light)' : idx < 3 ? 'var(--blue-light)' : 'var(--text-muted)',
                                    fontSize: 16
                                  }}>
                                    {idx + 1}
                                  </span>
                                </td>
                                <td>
                                  <Link to={`/team/${t.id}`} style={{ fontWeight: 700 }}>
                                    {t.name}
                                    {isMyTeam && <span className="badge blue" style={{ marginLeft: 8 }}>내 팀</span>}
                                  </Link>
                                </td>
                                <td className="text-sm text-secondary">{t.owner_name || 'CPU'}</td>
                                <td style={{ textAlign: 'center' }} className="text-green font-bold">{t.wins || 0}</td>
                                <td style={{ textAlign: 'center' }} className="text-red font-bold">{t.losses || 0}</td>
                                <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 15 }}>{wr}</td>
                                <td style={{ textAlign: 'center' }} className="text-sm">{Number(t.budget || 0).toLocaleString()}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={t.morale >= 70 ? 'stat-val-high' : t.morale >= 45 ? 'stat-val-mid' : 'stat-val-low'}>
                                    {t.morale ?? '-'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={t.chemistry >= 70 ? 'stat-val-high' : t.chemistry >= 45 ? 'stat-val-mid' : 'stat-val-low'}>
                                    {t.chemistry ?? '-'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Tournament Tab */}
      {selectedTab === 'tournaments' && (
        <>
          {tournaments.length === 0 ? (
            <div className="empty-state">
              <p>진행중인 대회가 없습니다</p>
            </div>
          ) : (
            <>
              <div className="tabs">
                {tournaments.map(t => (
                  <button
                    key={t.id}
                    className={`tab ${selectedTournament === t.id ? 'active' : ''}`}
                    onClick={() => setSelectedTournament(t.id)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>

              {/* Tournament Info */}
              {selectedTournament && (() => {
                const selT = tournaments.find(t => t.id === selectedTournament);
                return selT ? (
                  <div className="card mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 className="font-bold">{selT.name}</h2>
                      <p className="text-sm text-muted" style={{ marginTop: 4 }}>
                        {selT.started_at ? new Date(selT.started_at).toLocaleDateString('ko-KR') : ''} 시작
                      </p>
                    </div>
                    <span className="badge blue" style={{ fontSize: 13 }}>{selT.type}</span>
                  </div>
                ) : null;
              })()}

              {standings.length === 0 ? (
                <div className="empty-state">
                  <p>순위 데이터가 없습니다</p>
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 50 }}>순위</th>
                          <th>팀</th>
                          <th>리그</th>
                          <th>조</th>
                          <th style={{ textAlign: 'center' }}>승</th>
                          <th style={{ textAlign: 'center' }}>패</th>
                          <th style={{ textAlign: 'center' }}>승률</th>
                          <th style={{ textAlign: 'center' }}>득점</th>
                          <th style={{ textAlign: 'center' }}>실점</th>
                          <th style={{ textAlign: 'center' }}>득실차</th>
                          <th style={{ textAlign: 'center' }}>연속</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((s, idx) => {
                          const diff = (s.runs_scored || 0) - (s.runs_allowed || 0);
                          const isMyTeam = user?.teamId === s.team_id;
                          const isPlayoff = idx < 4;
                          return (
                            <tr
                              key={s.team_id}
                              className={isMyTeam ? 'highlight-row' : ''}
                              style={{
                                background: isPlayoff && !isMyTeam ? 'rgba(6, 78, 59, 0.15)' : undefined
                              }}
                            >
                              <td style={{ textAlign: 'center' }}>
                                <span style={{
                                  fontWeight: 800,
                                  color: idx === 0 ? 'var(--yellow-light)' : idx < 3 ? 'var(--blue-light)' : idx < 4 ? 'var(--green-light)' : 'var(--text-muted)',
                                  fontSize: 16
                                }}>
                                  {idx + 1}
                                </span>
                              </td>
                              <td>
                                <Link to={`/team/${s.team_id}`} style={{ fontWeight: 700 }}>
                                  {s.team_name}
                                  {isMyTeam && <span className="badge blue" style={{ marginLeft: 8 }}>내 팀</span>}
                                </Link>
                              </td>
                              <td className="text-sm text-muted">{s.league_name}</td>
                              <td>{s.group_name || '-'}</td>
                              <td style={{ textAlign: 'center' }} className="text-green font-bold">{s.wins}</td>
                              <td style={{ textAlign: 'center' }} className="text-red font-bold">{s.losses}</td>
                              <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 15 }}>
                                {s.win_rate ? Number(s.win_rate).toFixed(3) : '.000'}
                              </td>
                              <td style={{ textAlign: 'center' }}>{s.runs_scored || 0}</td>
                              <td style={{ textAlign: 'center' }}>{s.runs_allowed || 0}</td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={diff > 0 ? 'text-green font-bold' : diff < 0 ? 'text-red font-bold' : 'text-muted'}>
                                  {diff > 0 ? '+' : ''}{diff}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {s.streak ? (
                                  <span className={s.streak > 0 ? 'text-green' : 'text-red'}>
                                    {s.streak > 0 ? `${s.streak}연승` : `${Math.abs(s.streak)}연패`}
                                  </span>
                                ) : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-primary)' }}>
                    <p className="text-xs text-muted">
                      * 초록 배경 = 플레이오프 진출권 (상위 4팀)
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
