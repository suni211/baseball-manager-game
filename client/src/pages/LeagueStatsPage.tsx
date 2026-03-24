import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

type BattingSort = 'batting_avg' | 'home_runs' | 'rbi' | 'hits' | 'runs' | 'stolen_bases' | 'obp' | 'ops';
type PitchingSort = 'era' | 'wins' | 'saves' | 'strikeouts_pitched' | 'whip' | 'innings_pitched';

export default function LeagueStatsPage() {
  const [tab, setTab] = useState<'batting' | 'pitching'>('batting');
  const [battingLeaders, setBattingLeaders] = useState<any[]>([]);
  const [pitchingLeaders, setPitchingLeaders] = useState<any[]>([]);
  const [battingSort, setBattingSort] = useState<BattingSort>('batting_avg');
  const [pitchingSort, setPitchingSort] = useState<PitchingSort>('era');
  const [loading, setLoading] = useState(true);

  const loadBatting = async (sort: BattingSort) => {
    try {
      const res = await api.get(`/players/stats/batting-leaders?sort=${sort}&limit=30`);
      setBattingLeaders(res.data || []);
    } catch { setBattingLeaders([]); }
  };

  const loadPitching = async (sort: PitchingSort) => {
    try {
      const res = await api.get(`/players/stats/pitching-leaders?sort=${sort}&limit=30`);
      setPitchingLeaders(res.data || []);
    } catch { setPitchingLeaders([]); }
  };

  useEffect(() => {
    Promise.all([loadBatting(battingSort), loadPitching(pitchingSort)]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadBatting(battingSort); }, [battingSort]);
  useEffect(() => { loadPitching(pitchingSort); }, [pitchingSort]);

  if (loading) return <div className="loading">스탯 불러오는 중...</div>;

  const battingSortOptions: { key: BattingSort; label: string }[] = [
    { key: 'batting_avg', label: '타율' },
    { key: 'home_runs', label: '홈런' },
    { key: 'rbi', label: '타점' },
    { key: 'hits', label: '안타' },
    { key: 'runs', label: '득점' },
    { key: 'stolen_bases', label: '도루' },
    { key: 'obp', label: '출루율' },
    { key: 'ops', label: 'OPS' },
  ];

  const pitchingSortOptions: { key: PitchingSort; label: string }[] = [
    { key: 'era', label: '방어율' },
    { key: 'wins', label: '승리' },
    { key: 'saves', label: '세이브' },
    { key: 'strikeouts_pitched', label: '탈삼진' },
    { key: 'whip', label: 'WHIP' },
    { key: 'innings_pitched', label: '이닝' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>리그 종합 기록</h1>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'batting' ? 'active' : ''}`} onClick={() => setTab('batting')}>
          타격 기록
        </button>
        <button className={`tab ${tab === 'pitching' ? 'active' : ''}`} onClick={() => setTab('pitching')}>
          투구 기록
        </button>
      </div>

      {tab === 'batting' && (
        <>
          <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
            {battingSortOptions.map(opt => (
              <button
                key={opt.key}
                className={`tab ${battingSort === opt.key ? 'active' : ''}`}
                onClick={() => setBattingSort(opt.key)}
                style={{ fontSize: 12, padding: '4px 12px' }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {battingLeaders.length === 0 ? (
            <div className="empty-state"><p>기록 데이터가 없습니다. 경기가 진행되면 표시됩니다.</p></div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>선수</th>
                      <th>팀</th>
                      <th>학년</th>
                      <th style={{ textAlign: 'center' }}>경기</th>
                      <th style={{ textAlign: 'center' }}>타수</th>
                      <th style={{ textAlign: 'center' }}>안타</th>
                      <th style={{ textAlign: 'center' }}>2루타</th>
                      <th style={{ textAlign: 'center' }}>3루타</th>
                      <th style={{ textAlign: 'center', fontWeight: battingSort === 'home_runs' ? 900 : undefined, color: battingSort === 'home_runs' ? 'var(--yellow-light)' : undefined }}>홈런</th>
                      <th style={{ textAlign: 'center', fontWeight: battingSort === 'rbi' ? 900 : undefined, color: battingSort === 'rbi' ? 'var(--yellow-light)' : undefined }}>타점</th>
                      <th style={{ textAlign: 'center', fontWeight: battingSort === 'runs' ? 900 : undefined, color: battingSort === 'runs' ? 'var(--yellow-light)' : undefined }}>득점</th>
                      <th style={{ textAlign: 'center' }}>볼넷</th>
                      <th style={{ textAlign: 'center' }}>삼진</th>
                      <th style={{ textAlign: 'center', fontWeight: battingSort === 'stolen_bases' ? 900 : undefined, color: battingSort === 'stolen_bases' ? 'var(--yellow-light)' : undefined }}>도루</th>
                      <th style={{ textAlign: 'center', fontWeight: battingSort === 'batting_avg' ? 900 : undefined, color: battingSort === 'batting_avg' ? 'var(--yellow-light)' : undefined }}>타율</th>
                      <th style={{ textAlign: 'center', fontWeight: battingSort === 'obp' ? 900 : undefined, color: battingSort === 'obp' ? 'var(--yellow-light)' : undefined }}>출루율</th>
                      <th style={{ textAlign: 'center' }}>장타율</th>
                      <th style={{ textAlign: 'center', fontWeight: battingSort === 'ops' ? 900 : undefined, color: battingSort === 'ops' ? 'var(--yellow-light)' : undefined }}>OPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {battingLeaders.map((p, idx) => (
                      <tr key={p.player_id} style={idx < 3 ? { background: 'rgba(250, 204, 21, 0.08)' } : undefined}>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: idx === 0 ? 'var(--yellow-light)' : idx < 3 ? 'var(--blue-light)' : 'var(--text-muted)' }}>
                          {idx + 1}
                        </td>
                        <td>
                          <Link to={`/player/${p.player_id}`} style={{ fontWeight: 700 }}>{p.player_name}</Link>
                          <span className="text-xs text-muted" style={{ marginLeft: 4 }}>{p.position}</span>
                        </td>
                        <td className="text-sm text-secondary">{p.team_name}</td>
                        <td className="text-sm text-muted">{p.grade}학년</td>
                        <td style={{ textAlign: 'center' }}>{p.games}</td>
                        <td style={{ textAlign: 'center' }}>{p.at_bats}</td>
                        <td style={{ textAlign: 'center' }}>{p.hits}</td>
                        <td style={{ textAlign: 'center' }}>{p.doubles}</td>
                        <td style={{ textAlign: 'center' }}>{p.triples}</td>
                        <td style={{ textAlign: 'center', fontWeight: battingSort === 'home_runs' ? 800 : undefined }}>{p.home_runs}</td>
                        <td style={{ textAlign: 'center', fontWeight: battingSort === 'rbi' ? 800 : undefined }}>{p.rbi}</td>
                        <td style={{ textAlign: 'center', fontWeight: battingSort === 'runs' ? 800 : undefined }}>{p.runs}</td>
                        <td style={{ textAlign: 'center' }}>{p.walks}</td>
                        <td style={{ textAlign: 'center' }}>{p.strikeouts}</td>
                        <td style={{ textAlign: 'center', fontWeight: battingSort === 'stolen_bases' ? 800 : undefined }}>{p.stolen_bases}</td>
                        <td style={{ textAlign: 'center', fontWeight: battingSort === 'batting_avg' ? 800 : undefined }}>{(p.batting_avg || 0).toFixed(3)}</td>
                        <td style={{ textAlign: 'center', fontWeight: battingSort === 'obp' ? 800 : undefined }}>{(p.obp || 0).toFixed(3)}</td>
                        <td style={{ textAlign: 'center' }}>{(p.slg || 0).toFixed(3)}</td>
                        <td style={{ textAlign: 'center', fontWeight: battingSort === 'ops' ? 800 : undefined }}>{(p.ops || 0).toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'pitching' && (
        <>
          <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
            {pitchingSortOptions.map(opt => (
              <button
                key={opt.key}
                className={`tab ${pitchingSort === opt.key ? 'active' : ''}`}
                onClick={() => setPitchingSort(opt.key)}
                style={{ fontSize: 12, padding: '4px 12px' }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {pitchingLeaders.length === 0 ? (
            <div className="empty-state"><p>기록 데이터가 없습니다. 경기가 진행되면 표시됩니다.</p></div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>선수</th>
                      <th>팀</th>
                      <th>역할</th>
                      <th style={{ textAlign: 'center' }}>경기</th>
                      <th style={{ textAlign: 'center', fontWeight: pitchingSort === 'wins' ? 900 : undefined, color: pitchingSort === 'wins' ? 'var(--yellow-light)' : undefined }}>승</th>
                      <th style={{ textAlign: 'center' }}>패</th>
                      <th style={{ textAlign: 'center', fontWeight: pitchingSort === 'saves' ? 900 : undefined, color: pitchingSort === 'saves' ? 'var(--yellow-light)' : undefined }}>세이브</th>
                      <th style={{ textAlign: 'center', fontWeight: pitchingSort === 'innings_pitched' ? 900 : undefined, color: pitchingSort === 'innings_pitched' ? 'var(--yellow-light)' : undefined }}>이닝</th>
                      <th style={{ textAlign: 'center' }}>피안타</th>
                      <th style={{ textAlign: 'center' }}>실점</th>
                      <th style={{ textAlign: 'center' }}>자책점</th>
                      <th style={{ textAlign: 'center' }}>볼넷</th>
                      <th style={{ textAlign: 'center', fontWeight: pitchingSort === 'strikeouts_pitched' ? 900 : undefined, color: pitchingSort === 'strikeouts_pitched' ? 'var(--yellow-light)' : undefined }}>탈삼진</th>
                      <th style={{ textAlign: 'center' }}>피홈런</th>
                      <th style={{ textAlign: 'center', fontWeight: pitchingSort === 'era' ? 900 : undefined, color: pitchingSort === 'era' ? 'var(--yellow-light)' : undefined }}>방어율</th>
                      <th style={{ textAlign: 'center', fontWeight: pitchingSort === 'whip' ? 900 : undefined, color: pitchingSort === 'whip' ? 'var(--yellow-light)' : undefined }}>WHIP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pitchingLeaders.map((p, idx) => (
                      <tr key={p.player_id} style={idx < 3 ? { background: 'rgba(250, 204, 21, 0.08)' } : undefined}>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: idx === 0 ? 'var(--yellow-light)' : idx < 3 ? 'var(--blue-light)' : 'var(--text-muted)' }}>
                          {idx + 1}
                        </td>
                        <td>
                          <Link to={`/player/${p.player_id}`} style={{ fontWeight: 700 }}>{p.player_name}</Link>
                        </td>
                        <td className="text-sm text-secondary">{p.team_name}</td>
                        <td className="text-sm text-muted">{p.pitcher_role || '-'}</td>
                        <td style={{ textAlign: 'center' }}>{p.games}</td>
                        <td style={{ textAlign: 'center', fontWeight: pitchingSort === 'wins' ? 800 : undefined }} className="text-green">{p.wins}</td>
                        <td style={{ textAlign: 'center' }} className="text-red">{p.losses}</td>
                        <td style={{ textAlign: 'center', fontWeight: pitchingSort === 'saves' ? 800 : undefined }}>{p.saves}</td>
                        <td style={{ textAlign: 'center', fontWeight: pitchingSort === 'innings_pitched' ? 800 : undefined }}>{Number(p.innings_pitched || 0).toFixed(1)}</td>
                        <td style={{ textAlign: 'center' }}>{p.hits_allowed}</td>
                        <td style={{ textAlign: 'center' }}>{p.runs_allowed}</td>
                        <td style={{ textAlign: 'center' }}>{p.earned_runs}</td>
                        <td style={{ textAlign: 'center' }}>{p.walks_allowed}</td>
                        <td style={{ textAlign: 'center', fontWeight: pitchingSort === 'strikeouts_pitched' ? 800 : undefined }}>{p.strikeouts_pitched}</td>
                        <td style={{ textAlign: 'center' }}>{p.home_runs_allowed}</td>
                        <td style={{ textAlign: 'center', fontWeight: pitchingSort === 'era' ? 800 : undefined }}>{(p.era || 0).toFixed(2)}</td>
                        <td style={{ textAlign: 'center', fontWeight: pitchingSort === 'whip' ? 800 : undefined }}>{(p.whip || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
