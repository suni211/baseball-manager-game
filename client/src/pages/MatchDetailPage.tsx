import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';

export default function MatchDetailPage() {
  const { id } = useParams();
  const [match, setMatch] = useState<any>(null);
  const [tab, setTab] = useState<string>('스코어');

  useEffect(() => { api.get(`/matches/${id}`).then(res => setMatch(res.data)); }, [id]);

  if (!match) return <div className="text-center mt-4">로딩중...</div>;

  const eventColors: Record<string, string> = {
    '홈런': '#f59e0b', '3루타': '#34d399', '2루타': '#60a5fa', '안타': '#a3e635',
    '삼진': '#f87171', '볼넷': '#93c5fd', '병살': '#ef4444',
    '투수교체': '#c084fc', '이닝시작': '#475569', '경기시작': '#2563eb',
    '경기종료': '#dc2626', '도루성공': '#22d3ee', '도루실패': '#fb923c',
    '대타': '#e879f9', '끝내기': '#fbbf24'
  };

  return (
    <div>
      {/* 스코어 헤더 */}
      <div className="card text-center mb-4">
        <p className="text-sm text-muted">{match.tournament_name} | {match.stage}</p>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 40, margin: '16px 0' }}>
          <div><h2 className="text-lg font-bold">{match.home_name}</h2><p className="text-sm text-muted">(홈)</p></div>
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: 4 }}>
            <span className={match.home_score > match.away_score ? 'text-green' : ''}>{match.home_score}</span>
            <span className="text-muted"> - </span>
            <span className={match.away_score > match.home_score ? 'text-green' : ''}>{match.away_score}</span>
          </div>
          <div><h2 className="text-lg font-bold">{match.away_name}</h2><p className="text-sm text-muted">(원정)</p></div>
        </div>
        <p className="text-sm text-muted">날씨: {match.weather} | 관중: {match.attendance?.toLocaleString()}명</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-4">
        {['스코어', '실시간중계', '타격기록', '투수기록'].map(t => (
          <button key={t} className={tab === t ? 'primary' : 'secondary'} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* 이닝 스코어보드 */}
      {tab === '스코어' && match.innings?.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>팀</th>
                {Array.from(new Set(match.innings.map((i: any) => i.inning))).map((inn: any) => (
                  <th key={inn} className="text-center">{inn}</th>
                ))}
                <th className="text-center font-bold">R</th><th className="text-center">H</th><th className="text-center">E</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-bold">{match.away_name}</td>
                {match.innings.filter((i: any) => i.half === '초').map((inn: any) => (
                  <td key={inn.inning} className="text-center" style={{ color: inn.runs > 0 ? '#fbbf24' : '' }}>{inn.runs}</td>
                ))}
                <td className="text-center font-bold">{match.away_score}</td>
                <td className="text-center">{match.innings.filter((i: any) => i.half === '초').reduce((s: number, i: any) => s + i.hits, 0)}</td>
                <td className="text-center">{match.innings.filter((i: any) => i.half === '초').reduce((s: number, i: any) => s + i.errors, 0)}</td>
              </tr>
              <tr>
                <td className="font-bold">{match.home_name}</td>
                {match.innings.filter((i: any) => i.half === '말').map((inn: any) => (
                  <td key={inn.inning} className="text-center" style={{ color: inn.runs > 0 ? '#fbbf24' : '' }}>{inn.runs}</td>
                ))}
                <td className="text-center font-bold">{match.home_score}</td>
                <td className="text-center">{match.innings.filter((i: any) => i.half === '말').reduce((s: number, i: any) => s + i.hits, 0)}</td>
                <td className="text-center">{match.innings.filter((i: any) => i.half === '말').reduce((s: number, i: any) => s + i.errors, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* 실시간 중계 로그 */}
      {tab === '실시간중계' && (
        <div className="card" style={{ maxHeight: 600, overflowY: 'auto' }}>
          <h3 className="font-bold mb-2">경기 실시간 중계</h3>
          {match.play_log?.length > 0 ? match.play_log.map((log: any, idx: number) => {
            const isInningStart = log.event_type === '이닝시작';
            const isGameEvent = log.event_type === '경기시작' || log.event_type === '경기종료';
            const color = eventColors[log.event_type] || '#d1d5db';

            return (
              <div key={idx} style={{
                padding: isInningStart || isGameEvent ? '10px 12px' : '6px 12px',
                borderBottom: '1px solid #1f2937',
                background: isInningStart ? '#111827' : isGameEvent ? '#1e3a5f' : 'transparent',
                borderLeft: `3px solid ${color}`
              }}>
                {isInningStart || isGameEvent ? (
                  <p className="font-bold" style={{ color }}>{log.description}</p>
                ) : (
                  <div>
                    <span style={{ color, fontWeight: 600, marginRight: 8, fontSize: 12 }}>
                      [{log.event_type}]
                    </span>
                    <span>{log.description}</span>
                    {log.runners_on && (
                      <span className="text-sm text-muted" style={{ marginLeft: 8 }}>
                        주자: {log.runners_on}
                      </span>
                    )}
                    <span className="text-sm text-muted" style={{ float: 'right' }}>
                      {log.outs}아웃 | {log.score_away}-{log.score_home}
                    </span>
                  </div>
                )}
              </div>
            );
          }) : <p className="text-muted text-sm">경기 로그가 없습니다</p>}
        </div>
      )}

      {/* 타격 기록 */}
      {tab === '타격기록' && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>팀</th><th>타순</th><th>이름</th><th>포지션</th><th>타수</th><th>안타</th>
                <th>2루타</th><th>3루타</th><th>홈런</th><th>타점</th><th>득점</th><th>볼넷</th><th>삼진</th><th>도루</th>
              </tr>
            </thead>
            <tbody>
              {match.batting_stats?.map((s: any) => (
                <tr key={s.id}>
                  <td className="text-sm text-muted">{s.team_id === match.home_team_id ? '홈' : '원정'}</td>
                  <td>{s.batting_order}</td>
                  <td className="font-bold">{s.player_name}</td>
                  <td>{s.position}</td>
                  <td>{s.at_bats}</td>
                  <td className={s.hits > 0 ? 'text-green font-bold' : ''}>{s.hits}</td>
                  <td>{s.doubles}</td><td>{s.triples}</td>
                  <td className={s.home_runs > 0 ? 'text-yellow font-bold' : ''}>{s.home_runs}</td>
                  <td className={s.rbi > 0 ? 'font-bold' : ''}>{s.rbi}</td>
                  <td>{s.runs}</td><td>{s.walks}</td>
                  <td className={s.strikeouts > 0 ? 'text-red' : ''}>{s.strikeouts}</td>
                  <td>{s.stolen_bases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 투수 기록 */}
      {tab === '투수기록' && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>팀</th><th>이름</th><th>이닝</th><th>투구수</th><th>피안타</th>
                <th>실점</th><th>자책</th><th>볼넷</th><th>삼진</th><th>피홈런</th><th>결과</th>
              </tr>
            </thead>
            <tbody>
              {match.pitching_stats?.map((s: any) => (
                <tr key={s.id}>
                  <td className="text-sm text-muted">{s.team_id === match.home_team_id ? '홈' : '원정'}</td>
                  <td className="font-bold">{s.player_name}</td>
                  <td>{s.innings_pitched?.toFixed(1)}</td>
                  <td>{s.pitches_thrown}</td>
                  <td>{s.hits_allowed}</td>
                  <td>{s.runs_allowed}</td><td>{s.earned_runs}</td>
                  <td>{s.walks_allowed}</td>
                  <td className="text-green">{s.strikeouts_pitched}</td>
                  <td>{s.home_runs_allowed}</td>
                  <td>
                    {s.is_winner && <span className="badge green">승</span>}
                    {s.is_loser && <span className="badge red">패</span>}
                    {s.is_save && <span className="badge blue">S</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
