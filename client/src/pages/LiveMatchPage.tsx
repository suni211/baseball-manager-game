import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';

interface MatchState {
  matchId: number;
  inning: number;
  half: string;
  outs: number;
  homeScore: number;
  awayScore: number;
  homeName: string;
  awayName: string;
  runners: { first: boolean; second: boolean; third: boolean };
  currentBatter: string;
  currentPitcher: string;
  homeTimeouts: number;
  awayTimeouts: number;
  isPaused: boolean;
  pauseTeam: string;
  pauseEndsAt: number;
  innings: { inning: number; half: string; runs: number }[];
}

interface PlayEvent {
  type: string;
  description: string;
  inning: number;
  half: string;
  outs: number;
  homeScore: number;
  awayScore: number;
  runners: string;
  timestamp: number;
}

export default function LiveMatchPage() {
  const { id } = useParams();
  const [state, setState] = useState<MatchState | null>(null);
  const [events, setEvents] = useState<PlayEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [match, setMatch] = useState<any>(null);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    // Load existing match data
    api.get(`/matches/${id}`).then(res => {
      setMatch(res.data);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Try socket connection (may not be available)
    const trySocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        const s = io(window.location.origin, { transports: ['websocket', 'polling'] });

        s.on('connect', () => {
          setConnected(true);
          s.emit('joinMatch', Number(id));
        });

        s.on('disconnect', () => setConnected(false));

        s.on('matchState', (data: MatchState) => {
          setState(data);
          setIsLive(true);
        });

        s.on('atBat', (event: PlayEvent) => {
          setEvents(prev => [...prev, event]);
          setState(prev => prev ? {
            ...prev,
            homeScore: event.homeScore,
            awayScore: event.awayScore,
            outs: event.outs,
          } : prev);
        });

        s.on('inningChange', (data: any) => {
          setState(prev => prev ? { ...prev, inning: data.inning, half: data.half, outs: 0 } : prev);
          setEvents(prev => [...prev, {
            type: '이닝시작',
            description: data.description,
            inning: data.inning,
            half: data.half,
            outs: 0,
            homeScore: data.homeScore || 0,
            awayScore: data.awayScore || 0,
            runners: '',
            timestamp: Date.now()
          }]);
        });

        s.on('pitcherChange', (data: any) => {
          setEvents(prev => [...prev, {
            type: '투수교체',
            description: data.description,
            inning: 0, half: '', outs: 0,
            homeScore: 0, awayScore: 0,
            runners: '',
            timestamp: Date.now()
          }]);
        });

        s.on('timeout', (data: any) => {
          setState(prev => prev ? {
            ...prev,
            isPaused: true,
            pauseTeam: data.team,
            homeTimeouts: data.homeTimeouts,
            awayTimeouts: data.awayTimeouts
          } : prev);
        });

        s.on('timeoutEnd', () => {
          setState(prev => prev ? { ...prev, isPaused: false } : prev);
        });

        s.on('gameEnd', (data: any) => {
          setEvents(prev => [...prev, {
            type: '경기종료',
            description: `경기 종료! ${data.homeName} ${data.homeScore} - ${data.awayScore} ${data.awayName}`,
            inning: 0, half: '', outs: 0,
            homeScore: data.homeScore,
            awayScore: data.awayScore,
            runners: '',
            timestamp: Date.now()
          }]);
          setState(prev => prev ? { ...prev, homeScore: data.homeScore, awayScore: data.awayScore } : prev);
          setIsLive(false);
        });

        s.on('matchNotLive', () => {
          setIsLive(false);
        });

        socketRef.current = s;
      } catch {
        // Socket.io not available, show static data
      }
    };

    trySocket();
    return () => { socketRef.current?.disconnect(); };
  }, [id]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  const callTimeout = (team: 'home' | 'away') => {
    if (socketRef.current) socketRef.current.emit('callTimeout', { matchId: Number(id), team });
  };

  const eventColors: Record<string, string> = {
    '홈런': '#f59e0b', '3루타': '#34d399', '2루타': '#60a5fa', '안타': '#a3e635',
    '삼진': '#f87171', '볼넷': '#93c5fd', '병살': '#ef4444', '투수교체': '#c084fc',
    '이닝시작': '#475569', '경기시작': '#2563eb', '경기종료': '#dc2626',
    '도루성공': '#22d3ee', '도루실패': '#fb923c', '대타': '#e879f9', '끝내기': '#fbbf24'
  };

  if (loading) return <div className="loading">경기 정보 불러오는 중...</div>;

  // Completed match - show static data with play log
  if (!isLive && match && match.status === '완료') {
    return (
      <div>
        <div style={{ marginBottom: 8 }}>
          <Link to="/schedule" className="text-sm text-muted">&larr; 일정으로 돌아가기</Link>
        </div>

        <div className="scoreboard mb-4">
          <p className="text-sm text-muted mb-3">{match.tournament_name} &middot; {match.stage}</p>
          <div className="flex-center" style={{ gap: 48 }}>
            <div className="text-center">
              <h2 className="text-lg font-bold">{match.home_name}</h2>
              <p className="text-xs text-muted">(홈)</p>
            </div>
            <div className="score">
              <span className={match.home_score > match.away_score ? 'text-green' : ''}>{match.home_score}</span>
              <span className="text-muted"> - </span>
              <span className={match.away_score > match.home_score ? 'text-green' : ''}>{match.away_score}</span>
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold">{match.away_name}</h2>
              <p className="text-xs text-muted">(원정)</p>
            </div>
          </div>
          <p className="text-sm text-muted mt-3">경기 종료</p>
        </div>

        {/* Inning scoreboard */}
        {match.innings?.length > 0 && (
          <div className="card mb-4">
            <table className="inning-table">
              <thead>
                <tr>
                  <th>팀</th>
                  {Array.from(new Set(match.innings.map((i: any) => i.inning))).map((inn: any) => (
                    <th key={inn}>{inn}</th>
                  ))}
                  <th className="total-col">R</th>
                  <th>H</th>
                  <th>E</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-bold text-sm">{match.away_name}</td>
                  {match.innings.filter((i: any) => i.half === '초').map((inn: any) => (
                    <td key={inn.inning} style={{ color: inn.runs > 0 ? '#fbbf24' : '' }}>{inn.runs}</td>
                  ))}
                  <td className="total-col">{match.away_score}</td>
                  <td>{match.innings.filter((i: any) => i.half === '초').reduce((s: number, i: any) => s + (i.hits || 0), 0)}</td>
                  <td>{match.innings.filter((i: any) => i.half === '초').reduce((s: number, i: any) => s + (i.errors || 0), 0)}</td>
                </tr>
                <tr>
                  <td className="font-bold text-sm">{match.home_name}</td>
                  {match.innings.filter((i: any) => i.half === '말').map((inn: any) => (
                    <td key={inn.inning} style={{ color: inn.runs > 0 ? '#fbbf24' : '' }}>{inn.runs}</td>
                  ))}
                  <td className="total-col">{match.home_score}</td>
                  <td>{match.innings.filter((i: any) => i.half === '말').reduce((s: number, i: any) => s + (i.hits || 0), 0)}</td>
                  <td>{match.innings.filter((i: any) => i.half === '말').reduce((s: number, i: any) => s + (i.errors || 0), 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Play log */}
        {match.play_log?.length > 0 && (
          <div className="card" style={{ maxHeight: 600, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <h3 className="font-bold mb-3">경기 중계 기록</h3>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {match.play_log.map((log: any, idx: number) => {
                const isSystem = log.event_type === '이닝시작' || log.event_type === '경기시작' || log.event_type === '경기종료';
                const color = eventColors[log.event_type] || '#d1d5db';
                return (
                  <div key={idx} style={{
                    padding: isSystem ? '10px 12px' : '6px 12px',
                    borderBottom: '1px solid var(--border-primary)',
                    background: isSystem ? 'var(--bg-secondary)' : 'transparent',
                    borderLeft: `3px solid ${color}`
                  }}>
                    {isSystem ? (
                      <p className="font-bold" style={{ color }}>{log.description}</p>
                    ) : (
                      <div>
                        <span style={{ color, fontWeight: 600, marginRight: 8, fontSize: 11 }}>[{log.event_type}]</span>
                        <span className="text-sm">{log.description}</span>
                        <span className="text-xs text-muted" style={{ float: 'right' }}>
                          {log.outs}아웃 | {log.score_away}-{log.score_home}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="text-center mt-4">
          <Link to={`/match/${id}`} className="text-sm">상세 기록 페이지 보기 &rarr;</Link>
        </div>
      </div>
    );
  }

  // Not live, not completed
  if (!isLive && !state) {
    return (
      <div>
        <div style={{ marginBottom: 8 }}>
          <Link to="/schedule" className="text-sm text-muted">&larr; 일정으로 돌아가기</Link>
        </div>
        <div className="empty-state">
          <p className="text-lg font-bold" style={{ marginBottom: 8 }}>대기 중</p>
          <p className="text-secondary">경기가 아직 시작되지 않았거나 라이브가 아닙니다</p>
          <p className="text-sm text-muted mt-3">
            {connected ? '서버 연결됨 - 경기 시작을 기다리는 중...' : '서버에 연결 중...'}
          </p>
          {match && (
            <div className="card mt-4" style={{ display: 'inline-block', textAlign: 'center', padding: '20px 40px' }}>
              <p className="text-sm text-muted mb-2">{match.tournament_name}</p>
              <p className="font-bold text-lg">
                {match.home_name} vs {match.away_name}
              </p>
              <p className="text-sm text-muted mt-1">
                {new Date(match.match_date).toLocaleDateString('ko-KR')} {new Date(match.match_date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <span className={`badge ${match.status === '예정' ? 'silver' : 'blue'}`} style={{ marginTop: 8 }}>
                {match.status}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isMyHomeTeam = user.teamId && match?.home_team_id === user.teamId;
  const isMyAwayTeam = user.teamId && match?.away_team_id === user.teamId;

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link to="/schedule" className="text-sm text-muted">&larr; 일정</Link>
      </div>

      {/* Scoreboard */}
      <div className="scoreboard mb-4">
        {state?.isPaused && (
          <div className="badge live mb-2" style={{ fontSize: 14, padding: '6px 16px' }}>
            타임아웃 ({state.pauseTeam})
          </div>
        )}
        <div className="flex-center" style={{ gap: 48 }}>
          <div className="text-center" style={{ minWidth: 120 }}>
            <h2 className="text-lg font-bold">{state?.homeName || match?.home_name || '홈'}</h2>
            <p className="text-xs text-muted">(홈)</p>
            <p className="text-xs text-muted mt-1">타임아웃: {3 - (state?.homeTimeouts || 0)}회 남음</p>
          </div>
          <div>
            <div className="score">
              <span className={(state?.homeScore || 0) > (state?.awayScore || 0) ? 'text-green' : ''}>{state?.homeScore || 0}</span>
              <span className="text-muted"> - </span>
              <span className={(state?.awayScore || 0) > (state?.homeScore || 0) ? 'text-green' : ''}>{state?.awayScore || 0}</span>
            </div>
            <div className="flex-center gap-2 mt-2">
              <span className="live-indicator">LIVE</span>
              <span className="text-sm text-muted">{state?.inning || 1}회 {state?.half || '초'} &middot; {state?.outs || 0}아웃</span>
            </div>
          </div>
          <div className="text-center" style={{ minWidth: 120 }}>
            <h2 className="text-lg font-bold">{state?.awayName || match?.away_name || '원정'}</h2>
            <p className="text-xs text-muted">(원정)</p>
            <p className="text-xs text-muted mt-1">타임아웃: {3 - (state?.awayTimeouts || 0)}회 남음</p>
          </div>
        </div>

        {/* Diamond */}
        <div className="diamond-field mt-3">
          <div className={`diamond-base second ${state?.runners?.second ? 'active' : ''}`}></div>
          <div className={`diamond-base third ${state?.runners?.third ? 'active' : ''}`}></div>
          <div className={`diamond-base first ${state?.runners?.first ? 'active' : ''}`}></div>
          <div className="diamond-base home"></div>
        </div>
      </div>

      {/* Timeout Button */}
      {(isMyHomeTeam || isMyAwayTeam) && isLive && !state?.isPaused && (
        <div className="flex-center mb-4">
          <button className="danger" onClick={() => callTimeout(isMyHomeTeam ? 'home' : 'away')}>
            타임아웃 요청 ({3 - (isMyHomeTeam ? (state?.homeTimeouts || 0) : (state?.awayTimeouts || 0))}회 남음)
          </button>
        </div>
      )}

      <div className="grid-2">
        {/* Play-by-play Log */}
        <div className="card" style={{ maxHeight: 500, display: 'flex', flexDirection: 'column' }}>
          <h3 className="font-bold mb-3">실시간 중계</h3>
          <div ref={logRef} style={{ flex: 1, overflowY: 'auto' }}>
            {events.length > 0 ? events.map((e, idx) => {
              const color = eventColors[e.type] || '#d1d5db';
              const isSystem = e.type === '이닝시작' || e.type === '경기시작' || e.type === '경기종료';
              return (
                <div key={idx} style={{
                  padding: isSystem ? '10px 12px' : '6px 12px',
                  borderBottom: '1px solid var(--border-primary)',
                  background: isSystem ? 'var(--bg-secondary)' : 'transparent',
                  borderLeft: `3px solid ${color}`
                }}>
                  {isSystem ? (
                    <p className="font-bold" style={{ color }}>{e.description}</p>
                  ) : (
                    <div>
                      <span style={{ color, fontWeight: 600, marginRight: 8, fontSize: 11 }}>[{e.type}]</span>
                      <span className="text-sm">{e.description}</span>
                      <span className="text-xs text-muted" style={{ float: 'right' }}>
                        {e.outs}아웃 | {e.awayScore}-{e.homeScore}
                      </span>
                    </div>
                  )}
                </div>
              );
            }) : (
              <p className="text-muted text-sm text-center" style={{ padding: 40 }}>경기 시작을 기다리는 중...</p>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-col gap-3">
          {/* Current at-bat */}
          <div className="card">
            <h3 className="font-bold mb-2">현재 타석</h3>
            <div className="grid-2" style={{ gap: 16 }}>
              <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                <p className="text-xs text-muted">타자</p>
                <p className="font-bold text-lg">{state?.currentBatter || '-'}</p>
              </div>
              <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                <p className="text-xs text-muted">투수</p>
                <p className="font-bold text-lg">{state?.currentPitcher || '-'}</p>
              </div>
            </div>
          </div>

          {/* Out Count */}
          <div className="card">
            <h3 className="font-bold mb-2">아웃 카운트</h3>
            <div className="flex gap-3" style={{ justifyContent: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: i < (state?.outs || 0) ? 'var(--red)' : 'var(--bg-input)',
                  border: `2px solid ${i < (state?.outs || 0) ? 'var(--red)' : 'var(--border-secondary)'}`,
                  transition: 'all 0.3s',
                  boxShadow: i < (state?.outs || 0) ? '0 0 12px rgba(239,68,68,0.4)' : 'none'
                }}></div>
              ))}
            </div>
          </div>

          {/* Inning scores */}
          {state?.innings && state.innings.length > 0 && (
            <div className="card">
              <h3 className="font-bold mb-2">이닝별 점수</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="inning-table">
                  <thead>
                    <tr>
                      <th>팀</th>
                      {Array.from(new Set(state.innings.map(i => i.inning))).map(inn => (
                        <th key={inn}>{inn}</th>
                      ))}
                      <th className="total-col">R</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="font-bold text-sm">{state.awayName}</td>
                      {state.innings.filter(i => i.half === '초').map(inn => (
                        <td key={inn.inning} style={{ color: inn.runs > 0 ? '#fbbf24' : '' }}>{inn.runs}</td>
                      ))}
                      <td className="total-col">{state.awayScore}</td>
                    </tr>
                    <tr>
                      <td className="font-bold text-sm">{state.homeName}</td>
                      {state.innings.filter(i => i.half === '말').map(inn => (
                        <td key={inn.inning} style={{ color: inn.runs > 0 ? '#fbbf24' : '' }}>{inn.runs}</td>
                      ))}
                      <td className="total-col">{state.homeScore}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
